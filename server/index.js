import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { createClient } from '@libsql/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Socket } from 'net';
import dotenv from 'dotenv';
import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import nodeSchedule from 'node-schedule';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Create __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize environment variables
dotenv.config();

// Initialize LibSQL client
const db = createClient({
  url: `file:${path.resolve(process.cwd(), 'server/local.db')}`,
});

// Adicione um log para verificar o caminho completo
console.log('Caminho do banco de dados:', path.resolve(process.cwd(), 'server/local.db'));

// Initialize Express app and Socket.io
const app = express();

const distPath = path.join(__dirname, '../dist');
app.use(express.static(distPath));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

app.use(cors());
app.use(express.json());

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'TI', (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

// Variáveis para rastrear estatísticas do servidor
let serverStats = {
  startTime: new Date(),
  requestCount: 0,
  lastRequests: []
};

// Middleware to track requests
app.use((req, res, next) => {
  // Ignorar rota GET /
  if (req.method === 'GET' && req.path === '/') {
    return next();
  }

  serverStats.requestCount++;

  serverStats.lastRequests.unshift({
    time: new Date(),
    method: req.method,
    path: req.path,
    ip: req.ip
  });

  if (serverStats.lastRequests.length > 10) {
    serverStats.lastRequests.pop();
  }

  next();
});

// Function to record requests to server stats
serverStats.recordRequest = function(req) {
  this.requestCount++;
  
  // Adicionar registro da requisição
  this.lastRequests.unshift({
    time: new Date(),
    method: req.method,
    path: req.path,
    ip: req.ip || req.connection.remoteAddress
  });
  
  // Manter apenas as últimas 10 requisições
  if (this.lastRequests.length > 10) {
    this.lastRequests = this.lastRequests.slice(0, 10);
  }
};

// Setup static files folder
app.use(express.static(path.join(__dirname, 'public')));

// Root route - serve the index.html
app.get('/', (req, res) => {
  // Record this request
  serverStats.recordRequest(req);
  
  // Serve static file
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Helper function to safely handle database queries
const safeDbExecute = async (sql, args = []) => {
  try {
    const result = await db.execute({sql, args});
    return result;
  } catch (error) {
    console.error('Database error:', error);
    return { rows: [], rowsAffected: 0 };
  }
};

// Function to get ping history
const getPingHistory = async (limit = 15) => {
  try {
    const result = await safeDbExecute(`
      SELECT ph.*, d.name 
      FROM ping_history ph
      LEFT JOIN devices d ON ph.device_id = d.id
      ORDER BY timestamp DESC
      LIMIT ?
    `, [limit]);
    
    return result.rows || [];
  } catch (error) {
    console.error('Error getting ping history:', error);
    return [];
  }
};

// API route for server status
app.get('/api/server-status', async (req, res) => {
  try {
    // Record this API request
    serverStats.recordRequest(req);
    
    // Get device count with safe handling
    const devicesResult = await safeDbExecute('SELECT COUNT(*) as count FROM devices');
    const devicesCount = devicesResult.rows && devicesResult.rows[0] ? devicesResult.rows[0].count : 0;
    
    // Get online device count
    const onlineDevicesResult = await safeDbExecute('SELECT COUNT(*) as count FROM devices WHERE status = 1');
    const onlineDevicesCount = onlineDevicesResult.rows && onlineDevicesResult.rows[0] ? onlineDevicesResult.rows[0].count : 0;
    
    // Get printer count
    const printersResult = await safeDbExecute('SELECT COUNT(*) as count FROM printers');
    const printersCount = printersResult.rows && printersResult.rows[0] ? printersResult.rows[0].count : 0;
    
    // Get router count
    const routersResult = await safeDbExecute('SELECT COUNT(*) as count FROM routers');
    const routersCount = routersResult.rows && routersResult.rows[0] ? routersResult.rows[0].count : 0;
    
    // Get box count
    const boxesResult = await safeDbExecute('SELECT COUNT(*) as count FROM boxes');
    const boxesCount = boxesResult.rows && boxesResult.rows[0] ? boxesResult.rows[0].count : 0;

    // Calculate uptime
    const uptime = Math.floor((new Date() - serverStats.startTime) / 1000);
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = uptime % 60;
    const uptimeString = `${days}d ${hours}h ${minutes}m ${seconds}s`;
    
    // Get ping history
    const pingHistory = await getPingHistory(15);
    
    // Ensure lastRequests is an array
    const lastRequests = Array.isArray(serverStats.lastRequests) ? serverStats.lastRequests : [];
    
    // Prepare data to return as JSON
    const statusData = {
      devicesCount,
      onlineDevicesCount,
      printersCount,
      routersCount,
      boxesCount,
      uptimeString,
      requestCount: serverStats.requestCount || 0,
      lastRequests: lastRequests,
      pingHistory: pingHistory || []
    };
    
    res.json(statusData);
  } catch (error) {
    console.error('Erro ao obter status do servidor:', error);
    // Return a simplified response in case of error
    res.status(500).json({
      error: 'Erro ao obter status do servidor',
      message: error.message,
      devicesCount: 0,
      onlineDevicesCount: 0,
      printersCount: 0,
      routersCount: 0,
      boxesCount: 0,
      uptimeString: '0d 0h 0m 0s',
      requestCount: 0,
      lastRequests: [],
      pingHistory: []
    });
  }
});

/* app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await db.execute({
      sql: 'INSERT INTO users (username, password_hash) VALUES (?, ?)',
      args: [username, hashedPassword],
    });

    // Converta `result.lastInsertRowid` para um número ou string
    const userId = Number(result.lastInsertRowid);

    const token = jwt.sign(
      { id: userId, username },
      process.env.JWT_SECRET || 'TI'
    );

    res.json({ id: userId, username, token });
  } catch (error) {
    res.status(400).json({ error: 'Nome já existe' });
    console.log('Erro no registro:', error);
  }
}); */

app.put('/api/devices/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { ip, name, type, user, sector } = req.body;

  try {
    // Validar os dados recebidos
    if (!ip || !name) {
      return res.status(400).json({ error: 'IP e nome são obrigatórios' });
    }

    // Verificar se o dispositivo existe
    const checkResult = await db.execute({
      sql: 'SELECT * FROM devices WHERE id = ?',
      args: [id]
    });

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Dispositivo não encontrado' });
    }

    // Atualizar o dispositivo
    await db.execute({
      sql: 'UPDATE devices SET ip = ?, name = ?, type = ?, user = ?, sector = ? WHERE id = ?',
      args: [ip, name, type, user, sector, id]
    });

    // Buscar o dispositivo atualizado
    const updatedResult = await db.execute({
      sql: 'SELECT * FROM devices WHERE id = ?',
      args: [id]
    });

    // Retornar o dispositivo atualizado
    res.json(updatedResult.rows[0]);
  } catch (error) {
    console.error('Erro ao atualizar dispositivo:', error);
    res.status(500).json({ error: 'Erro ao atualizar dispositivo' });
  }
});

// Rota para atualizar um dispositivo na VLAN
app.put('/api/vlan/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { ip, name, type, user, sector } = req.body;

  try {
    // Validar os dados recebidos
    if (!ip || !name) {
      return res.status(400).json({ error: 'IP e nome são obrigatórios' });
    }

    // Verificar se o dispositivo existe
    const checkResult = await db.execute({
      sql: 'SELECT * FROM vlan WHERE id = ?',
      args: [id]
    });

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Dispositivo não encontrado' });
    }

    // Atualizar o dispositivo
    await db.execute({
      sql: 'UPDATE vlan SET ip = ?, name = ?, type = ?, user = ?, sector = ? WHERE id = ?',
      args: [ip, name, type, user, sector, id]
    });

    // Buscar o dispositivo atualizado
    const updatedResult = await db.execute({
      sql: 'SELECT * FROM vlan WHERE id = ?',
      args: [id]
    });

    // Retornar o dispositivo atualizado
    res.json(updatedResult.rows[0]);
  } catch (error) {
    console.error('Erro ao atualizar dispositivo VLAN:', error);
    res.status(500).json({ error: 'Erro ao atualizar dispositivo' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;

  const result = await db.execute({
    sql: 'SELECT * FROM users WHERE username = ?',
    args: [username]
  });
  const user = result.rows[0];

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const validPassword = await bcrypt.compare(password, user.password_hash);
  if (!validPassword) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { id: user.id, username },
    process.env.JWT_SECRET || 'TI'
  );
  res.json({ id: user.id, username, token });
});

app.get('/api/vlan', authenticateToken, async (req, res) => {
  try {
    const result = await db.execute('SELECT * FROM vlan');
    console.log(result); // Adicione isso para ver a saída
    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao buscar vlan:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// Device routes
app.get('/api/devices', authenticateToken, async (req, res) => {
  try {
    const result = await db.execute('SELECT * FROM devices');
    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao buscar devices:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

app.get('/api/devices/export', authenticateToken, async (req, res) => {
  try {
    // Buscar dispositivos no banco de dados
    const result = await db.execute('SELECT * FROM devices');
    const devices = result.rows;

    console.log('Dispositivos encontrados:', devices);  // Verifique os dados retornados

    if (devices.length === 0) {
      return res.status(404).json({ error: 'Nenhum dispositivo encontrado' });
    }

    // Criar a planilha com os dados
    const ws = XLSX.utils.json_to_sheet(devices);

    console.log('Planilha gerada:', ws);  // Verifique se a planilha está sendo criada corretamente

    // Criar um novo workbook e adicionar a planilha
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Devices');

    // Caminho para salvar o arquivo temporário
    const filePath = './devices.xlsx';
    XLSX.writeFile(wb, filePath);

    // Enviar o arquivo para o cliente
    res.download(filePath, 'devices.xlsx', (err) => {
      if (err) {
        console.error('Erro ao enviar arquivo:', err);
        return res.status(500).json({ error: 'Erro ao gerar planilha' });
      }

      // Remover o arquivo após o envio
      fs.unlinkSync(filePath);
    });
  } catch (error) {
    console.error('Erro ao exportar devices:', error);
    res.status(500).json({ error: 'Erro ao exportar dados' });
  }
});

app.get('/api/routers', authenticateToken, async (req, res) => {
  try {
    const result = await db.execute(`
SELECT id, ip, name, status, login_username, login_password, wifi_ssid, wifi_password, hidden
FROM devices
WHERE type = 'Roteador'
    `);

    // Retorne o resultado como JSON
    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao buscar dados:', error);
    res.status(500).json({ error: 'Erro ao buscar dados' });
  }
});

// Printer routes
app.get('/api/printers', authenticateToken, async (req, res) => {
  const result = await db.execute(`
SELECT id, ip, sector, status, model, npat, li, lf, online
FROM devices
WHERE npat > 0 AND type = 'Impressora';
  `);
  res.json(result.rows);
});

app.post('/api/printers/:id/online', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { online } = req.body;

  // Validação do status
  if (![1, 0].includes(online)) {
    return res.status(400).json({ error: 'Invalid online status. Must be 1 or 0.' });
  }

  try {
    // Atualiza o status na tabela devices
    const updateResult = await db.execute({
      sql: 'UPDATE devices SET online = ? WHERE id = ?',
      args: [online, id]
    });

    // Verifica se alguma linha foi afetada
    if (updateResult.rowsAffected === 0) {
      return res.status(404).json({ error: 'Printer not found or no change made.' });
    }

    // Retorna uma resposta de sucesso
    res.status(200).json({ message: 'Printer online status updated successfully' });
  } catch (error) {
    console.error('Error updating printer online status:', error);
    res.status(500).json({ error: 'Failed to update printer online status.' });
  }
});

// Box routes
app.get('/api/boxes', authenticateToken, async (req, res) => {
  try {
    const result = await db.execute(`
SELECT ip, name, status, online
FROM devices
WHERE sector = 'Caixas';
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching boxes:', error);
    res.status(500).json({ error: 'Failed to fetch boxes' });
  }
});

app.post('/api/boxes/:id/power-status', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { power_status } = req.body;

  // Valida o power_status
  if (![1, 0].includes(power_status)) {
    return res.status(400).json({ error: 'Invalid power status. Must be 1 or 0.' });
  }

  try {
    // Atualiza a coluna power_status na tabela boxes
    const updateResult = await db.execute({
      sql: 'UPDATE devices SET online = ? WHERE id = ?',
      args: [power_status, id],
    });

    // Verifica se alguma linha foi afetada
    if (updateResult.rowsAffected === 0) {
      return res.status(404).json({ error: 'Box not found or no change made.' });
    }

    // Busca os dados atualizados
    const result = await db.execute({
      sql: `
SELECT ip, name, status, online
FROM devices
WHERE id = ? and sector = 'Caixas';
      `,
      args: [id],
    });

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Box not found after update.' });
    }

    // Retorna os dados atualizados
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating box power status:', error);
    res.status(500).json({ error: 'Failed to update box power status.' });
  }
});

// Configurações avançadas de ping
const PING_CONFIG = {
  timeout: 1.5,          // Tempo limite em segundos
  extra: ['-c 4', '-i 0.3', '-W 1'], // 4 pacotes, intervalo 300ms
  minSuccess: 1          // Mínimo de pacotes bem-sucedidos para considerar online
};

const checkDeviceStatus = async (ip, device) => {
  try {
    // Portas comuns para tentar
    const commonPorts = [80, 443, 22, 21, 8080, 3389];
    
    // Tempo de timeout para cada tentativa
    const timeout = 1500; // 1.5 segundos
    
    // Função para verificar uma porta específica
    const checkPort = (port) => {
      return new Promise((resolve) => {
        const socket = new Socket();
        let connectionSuccess = false;
        
        socket.setTimeout(timeout);
        
        socket.on('connect', () => {
          connectionSuccess = true;
          socket.destroy();
          resolve(true);
        });
        
        socket.on('error', () => {
          socket.destroy();
          resolve(false);
        });
        
        socket.on('timeout', () => {
          socket.destroy();
          resolve(false);
        });
        
        // Tenta conectar à porta
        socket.connect(port, ip);
      });
    };
    
    // Tenta cada porta até que uma seja bem-sucedida
    for (const port of commonPorts) {
      const result = await checkPort(port);
      if (result) {
        await logPingResult(device, 1, { 
          avg: timeout / 2, 
          packetLoss: 0 
        });
        return 1; // Online
      }
    }
    
    await logPingResult(device, 0, { 
      avg: 0, 
      packetLoss: 100 
    });
    return 0;
    
  } catch (error) {
    console.error(`Erro ao verificar status do dispositivo ${ip}:`, error);
    await logPingResult(device, 0, { 
      avg: 0, 
      packetLoss: 100 
    });
    return 0;
  }
};

// Função para registrar resultados de ping
const logPingResult = async (device, status, result) => {
  try {
    await db.execute({
      sql: `INSERT INTO ping_history 
            (device_id, ip, status, response_time, packet_loss) 
            VALUES (?, ?, ?, ?, ?)`,
      args: [
        device.id, 
        device.ip,
        status,
        parseFloat(result.avg) || 0,
        parseFloat(result.packetLoss) || 100
      ]
    });
  } catch (error) {
    console.error('Error logging ping result:', error);
  }
};

// Função genérica para atualizar dispositivos
const processDevices = async (tableName) => {
  try {
    
    // Buscar dispositivos do banco de dados
    const result = await safeDbExecute(`SELECT * FROM ${tableName}`);
    const devices = result.rows;

    if (!Array.isArray(devices)) {
      console.error(`Não foi possível obter dispositivos da tabela ${tableName}`);
      return;
    }

    // Processar em paralelo com controle de batches
    const BATCH_SIZE = 50;
    for (let i = 0; i < devices.length; i += BATCH_SIZE) {
      const batch = devices.slice(i, i + BATCH_SIZE);
      
      const updates = await Promise.all(
        batch.map(async (device) => ({
          id: device.id,
          currentStatus: await checkDeviceStatus(device.ip, device),
          previousStatus: device.status
        }))
      );

      // Filtrar e atualizar apenas os que mudaram
      const changes = updates.filter(u => u.currentStatus !== u.previousStatus);
      
      for (const change of changes) {
        console.log(`[DB] Tentativa de UPDATE na tabela ${tableName}:`, {
          id: change.id,
          novoStatus: change.currentStatus
        });
      
        const updateResult = await db.execute({
          sql: `UPDATE ${tableName} SET status = ? WHERE id = ?`,
          args: [change.currentStatus, change.id]
        });
      
        // Verificação se o UPDATE foi bem sucedido
        console.log(`[DB] Resultado do UPDATE:`, {
          rowsAffected: updateResult.rowsAffected,
          changes: updateResult.rowsChanged
        });
      
        // Verificação adicional buscando o registro atualizado
        const verifyResult = await db.execute({
          sql: `SELECT status FROM ${tableName} WHERE id = ?`,
          args: [change.id]
        });
        
        console.log(`[DB] Status atual no banco para ID ${change.id}:`, verifyResult.rows[0]?.status);
        
        // Emitir evento para o cliente
        io.emit('statusUpdate', {
          table: tableName,
          id: change.id,
          status: change.currentStatus,
          timestamp: new Date().toISOString()
        });
      }
      
      // Intervalo entre batches para evitar sobrecarga
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  } catch (error) {
    console.error(`Erro crítico no processamento de ${tableName}:`, error);
  }
};

// Agendamento inteligente com prioridades
const SCHEDULE_CONFIG = {
  devices: {
    interval: '*/2 * * * *', // A cada 2 minutos
    retries: 3
  },
  vlan: {
    interval: '*/5 * * * *', // A cada 5 minutos
    retries: 2
  }
};

// Iniciar agendamentos
const startMonitoring = () => {
  for (const [tableName, config] of Object.entries(SCHEDULE_CONFIG)) {
    nodeSchedule.scheduleJob(config.interval, async () => {
      let attempts = 0;
      while (attempts < config.retries) {
        try {
          await processDevices(tableName);
          break;
        } catch (error) {
          attempts++;
          console.error(`Tentativa ${attempts} falhou para ${tableName}:`, error);
          if (attempts === config.retries) {
            console.error(`Monitoramento de ${tableName} crítico após ${config.retries} tentativas`);
          }
        }
      }
    });
  }
};

// Iniciar o serviço de monitoramento
startMonitoring();

// Eventos do Socket.io
io.on('connection', (socket) => {
  console.log('Cliente conectado:', socket.id);
  
  socket.on('forceCheck', async ({ table, id }) => {
    try {
      const result = await db.execute(`SELECT * FROM ${table} WHERE id = ?`, [id]);
      const device = result.rows[0];
      
      if (device) {
        const status = await checkDeviceStatus(device.ip);
        await db.execute(`UPDATE ${table} SET status = ? WHERE id = ?`, [status, id]);
        io.emit('statusUpdate', { table, id, status });
      }
    } catch (error) {
      console.error(`Verificação forçada falhou para ${table}/${id}:`, error);
    }
  });

  socket.on('disconnect', () => {
    console.log('Cliente desconectado:', socket.id);
  });
});

// Redirecionar todas as rotas para o index.html (útil para SPA)
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// Initialize database and start server
const startServer = async () => {
  try {
    // Ensure ping_history table exists
    await safeDbExecute(`
      CREATE TABLE IF NOT EXISTS ping_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id INTEGER,
        ip TEXT NOT NULL,
        status INTEGER NOT NULL,
        response_time REAL,
        packet_loss REAL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (device_id) REFERENCES devices(id)
      )
    `);
    
    httpServer.listen(5173, '0.0.0.0', () => {
      console.log(`Server running on http://0.0.0.0:5173`);
    });
    
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();