import { parentPort, workerData } from 'worker_threads';
import { createClient } from '@libsql/client';
import net from 'net';

const db = createClient({
  url: workerData.dbUrl,
  busyTimeout: 60000
});

// Garante modo WAL antes de qualquer operação
await db.execute({ sql: 'PRAGMA journal_mode=WAL' });

const MAX_RETRIES = 15;
const INITIAL_DELAY = 100; // ms

async function executeWithRetry(sql, args, retries = MAX_RETRIES) {
  let lastError;
  
  for (let i = 0; i < retries; i++) {
    try {
      return await db.execute({ sql, args });
    } catch (error) {
      lastError = error;
      
      // Aumenta o delay exponencialmente com fator randômico
      const delay = INITIAL_DELAY * Math.pow(2, i) * (0.5 + Math.random());
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Reconecta se for erro de conexão
      if (error.code === 'SQLITE_BUSY' || error.code === 'SQLITE_LOCKED') {
        continue;
      }
      break; // Para outros tipos de erro, não tenta novamente
    }
  }
  
  console.error(`Failed after ${retries} retries for device`, args[1]);
  console.error('Last error:', lastError);
  return null; // Retorna null em vez de lançar erro
}

async function checkDeviceStatus(ip) {
  try {
    const commonPorts = [80, 443, 22, 21, 8080];
    const timeout = 2000;
    
    const checkPort = (port) => {
      return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(timeout);
        
        socket.on('connect', () => {
          socket.destroy();
          resolve(true);
        });
        
        socket.on('error', () => resolve(false));
        socket.on('timeout', () => resolve(false));
        
        socket.connect(port, ip);
      });
    };

    const results = await Promise.all(commonPorts.slice(0, 3).map(checkPort));
    return results.some(r => r) ? 1 : 0;
  } catch (error) {
    console.error(`Error checking ${ip}:`, error);
    return 0;
  }
}

(async () => {
  try {
    let updatedCount = 0;
    for (const device of workerData.ips) {
      try {
        const status = await checkDeviceStatus(device.ip);
        await executeWithRetry(
          'UPDATE devices SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [status, device.id]
        );
        updatedCount++;
      } catch (error) {
        console.error(`Error updating device ${device.id}:`, error);
      }
    }
    parentPort.postMessage(updatedCount);
  } catch (error) {
    console.error('Worker error:', error);
    parentPort.postMessage(0);
  }
})();