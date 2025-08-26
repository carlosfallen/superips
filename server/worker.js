import { parentPort, workerData } from 'worker_threads';
import { createClient as createLibsqlClient } from '@libsql/client';
import { Pool as PgPool } from 'pg';
import net from 'net';

function isLibsqlLike(url) {
  return /^(file:|libsql:|https?:\/\/)/i.test(url);
}
function isPostgresLike(url) {
  return /^(postgres:|postgresql:)/i.test(url) || url.includes('postgres://');
}
function convertQuestionMarksToPg(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

async function createDbClient(url) {
  if (!url || typeof url !== 'string' || url.trim() === '') {
    throw new Error('DATABASE URL ausente. Defina LIBSQL_URL / TURSO_DATABASE_URL / DATABASE_URL corretamente.');
  }
  const u = url.trim();
  if (isLibsqlLike(u)) {
    const lib = createLibsqlClient({ url: u, busyTimeout: 60000 });
    await lib.execute({ sql: 'select 1;', args: [] });
    return {
      type: 'libsql',
      execute: async (sql, args = []) => {
        return await lib.execute({ sql, args });
      },
      raw: lib,
      url: u
    };
  }
  if (isPostgresLike(u)) {
    const pool = new PgPool({ connectionString: u });
    await pool.query('select 1;');
    return {
      type: 'pg',
      execute: async (sql, args = []) => {
        const converted = convertQuestionMarksToPg(sql);
        return await pool.query(converted, args);
      },
      raw: pool,
      url: u
    };
  }
  throw new Error(`URL_INVALID: formato de URL não reconhecido: ${u.slice(0, 120)}`);
}

const MAX_RETRIES = 15;
const INITIAL_DELAY = 100;

function isTransientError(err, type) {
  if (!err) return false;
  if (type === 'libsql') {
    const code = err.code || '';
    const msg = String(err.message || '').toLowerCase();
    return code === 'SQLITE_BUSY' || code === 'SQLITE_LOCKED' || msg.includes('busy') || msg.includes('timeout');
  }
  if (type === 'pg') {
    const code = err.code || '';
    const sys = String(err.message || '').toLowerCase();
    return ['57P01', '57P03', 'ECONNRESET', 'ETIMEDOUT'].includes(code) || sys.includes('timeout') || sys.includes('closed the connection');
  }
  return false;
}

async function executeWithRetry(dbClient, sql, args = [], retries = MAX_RETRIES) {
  let lastError;
  for (let i = 0; i < retries; i++) {
    try {
      return await dbClient.execute(sql, args);
    } catch (error) {
      lastError = error;
      if (!isTransientError(error, dbClient.type)) break;
      const delay = Math.max(50, Math.floor(INITIAL_DELAY * Math.pow(2, i) * (0.5 + Math.random())));
      await new Promise(r => setTimeout(r, delay));
      continue;
    }
  }
  console.error(`Failed after ${retries} retries for args`, args);
  console.error('Last error:', lastError);
  return null;
}

async function checkDeviceStatus(ip) {
  try {
    const commonPorts = [80, 443, 22, 21, 8080];
    const timeout = 2000;
    const checkPort = (port) => {
      return new Promise(resolve => {
        const socket = new net.Socket();
        let done = false;
        socket.setTimeout(timeout);
        socket.once('connect', () => { done = true; socket.destroy(); resolve(true); });
        socket.once('error', () => { if (!done) { done = true; resolve(false); } });
        socket.once('timeout', () => { if (!done) { done = true; socket.destroy(); resolve(false); } });
        socket.connect(port, ip);
      });
    };
    const results = await Promise.all(commonPorts.slice(0, 3).map(checkPort));
    return results.some(r => r) ? 1 : 0;
  } catch (e) {
    console.error(`Error checking ${ip}:`, e);
    return 0;
  }
}

(async () => {
  let dbClient;
  try {
    dbClient = await createDbClient(workerData.dbUrl);
    if (dbClient.type === 'libsql' && dbClient.url.startsWith('file:')) {
      try { await dbClient.execute('PRAGMA journal_mode=WAL', []); } catch (_) {}
    }
  } catch (err) {
    console.error('Worker error creating DB client:', err);
    parentPort.postMessage(0);
    return;
  }

  try {
    let updatedCount = 0;
    for (const device of workerData.ips || []) {
      try {
        const status = await checkDeviceStatus(device.ip);
        const res = await executeWithRetry(
          dbClient,
          'UPDATE devices SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [status, device.id]
        );
        if (res) updatedCount++;
      } catch (error) {
        console.error(`Error updating device ${device.id}:`, error);
      }
    }
    parentPort.postMessage(updatedCount);
  } catch (error) {
    console.error('Worker error:', error);
    parentPort.postMessage(0);
  } finally {
    try {
      if (dbClient?.type === 'pg' && dbClient.raw) await dbClient.raw.end();
    } catch (_) {}
  }
})();
