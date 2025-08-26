import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import net from 'net';
const { Socket } = net;
import dotenv from 'dotenv';
import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import nodeSchedule from 'node-schedule';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import os from 'os';
import dns from 'dns';
import pkg from 'pg';
const { Pool } = pkg;
import { promisify } from 'util';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

let isInitialScanComplete = false;
let isInitialScanInProgress = false;

const db = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'superips_user',
  password: '359628',
  database: 'superips_db',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});

const checkDatabaseHealth = async () => {
  try {
    const client = await db.connect();
    await client.query('SELECT 1 as health_check');
    client.release();
    return true;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
};

const app = express();
const distPath = path.join(__dirname, '../dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling'],
  allowEIO3: true
});

// Frontend rodando em http://10.0.11.150:5174
app.use(cors({
  origin: 'http://10.0.11.150:5174',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use((req, res, next) => {
  req.setTimeout(30000);
  res.setTimeout(30000);
  next();
});

const verifyAsync = promisify(jwt.verify);

export const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      console.log(`❌ No token provided for ${req.method} ${req.path} from IP: ${req.ip}`);
      return res.status(401).json({
        error: 'Authentication required',
        code: 'NO_TOKEN',
        timestamp: new Date().toISOString()
      });
    }

    try {
      const user = await verifyAsync(token, process.env.JWT_SECRET || 'TI');
      req.user = user;
      next();
    } catch (err) {
      console.log(`❌ Token verification failed for ${req.method} ${req.path}:`, err.message);

      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          error: 'Token expired',
          code: 'TOKEN_EXPIRED',
          timestamp: new Date().toISOString(),
          expiredAt: err.expiredAt
        });
      }

      return res.status(403).json({
        error: 'Invalid token',
        code: 'INVALID_TOKEN',
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error('❌ Authentication middleware error:', error);
    return res.status(500).json({
      error: 'Authentication error',
      code: 'AUTH_ERROR',
      timestamp: new Date().toISOString()
    });
  }
};

let serverStats = {
  startTime: new Date(),
  requestCount: 0,
  lastRequests: [],
  activeConnections: 0,
  totalDataTransferred: 0,
  lastDatabaseCheck: new Date(),
  databaseHealthy: true
};

app.use(async (req, res, next) => {
  if (req.method === 'GET' && req.path === '/') {
    return next();
  }

  const now = new Date();
  if (now - serverStats.lastDatabaseCheck > 60000) {
    serverStats.databaseHealthy = await checkDatabaseHealth();
    serverStats.lastDatabaseCheck = now;
  }

  serverStats.requestCount++;
  serverStats.lastRequests.unshift({
    time: new Date(),
    method: req.method,
    path: req.path,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('User-Agent')
  });

  if (serverStats.lastRequests.length > 50) {
    serverStats.lastRequests = serverStats.lastRequests.slice(0, 50);
  }

  next();
});

const safeDbExecute = async (sql, args = [], maxRetries = 3, timeout = 30000) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    let client;
    try {
      const executePromise = (async () => {
        client = await db.connect();
        const result = await client.query(sql, args);
        return {
          rows: result.rows,
          rowCount: result.rowCount,
          lastInsertRowid: result.rows.length > 0 && result.rows[0].id ? result.rows[0].id : null
        };
      })();

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Database query timeout')), timeout);
      });
      
      const result = await Promise.race([executePromise, timeoutPromise]);
      if (client) client.release();
      return result;
    } catch (error) {
      if (client) client.release();
      console.error(`Database error (attempt ${attempt}/${maxRetries}):`, error);
      
      if (attempt === maxRetries) {
        console.error('Max retries reached, returning empty result');
        return { rows: [], rowCount: 0 };
      }
      
      await new Promise(resolve => setTimeout(resolve, attempt * 1000));
    }
  }
  
  return { rows: [], rowCount: 0 };
};

const columnExists = async (tableName, columnName) => {
  try {
    const result = await safeDbExecute(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = $1 AND column_name = $2
    `, [tableName, columnName]);
    return result.rows.length > 0;
  } catch (error) {
    console.error(`Error checking column ${columnName} in ${tableName}:`, error);
    return false;
  }
};

const addColumnIfNotExists = async (tableName, columnName, columnType, defaultValue = null) => {
  try {
    const exists = await columnExists(tableName, columnName);
    if (!exists) {
      const defaultClause = defaultValue ? ` DEFAULT ${defaultValue}` : '';
      await safeDbExecute(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}${defaultClause}`);
      console.log(`Added column ${columnName} to ${tableName}`);
    }
  } catch (error) {
    console.error(`Error adding column ${columnName} to ${tableName}:`, error);
  }
};

const networkRanges = [
  '10.0.11.1-10.0.11.254',
  '10.2.11.1-10.2.11.254',  
  '10.4.11.1-10.4.11.254'
];

function expandIpRange(range) {
  const [start, end] = range.split('-').map(ip => {
    const parts = ip.split('.').map(Number);
    return (parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3];
  });

  const ips = [];
  for (let i = start; i <= end; i++) {
    const ip = [
      (i >>> 24) & 0xFF,
      (i >>> 16) & 0xFF,
      (i >>> 8) & 0xFF,
      i & 0xFF
    ].join('.');
    ips.push(ip);
  }
  return ips;
}

const allIpsInRanges = networkRanges.flatMap(range => expandIpRange(range));

const checkDeviceStatus = async (ip, device = null, timeout = 2000) => {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let resolved = false;
    
    const cleanup = () => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
      }
    };
    
    const timer = setTimeout(() => {
      cleanup();
      resolve(0);
    }, timeout);
    
    socket.setTimeout(timeout);
    
    socket.on('connect', () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        socket.destroy();
        resolve(1);
      }
    });
    
    socket.on('error', () => {
      cleanup();
      clearTimeout(timer);
      resolve(0);
    });
    
    socket.on('timeout', () => {
      cleanup();
      clearTimeout(timer);
      resolve(0);
    });
    
    try {
      socket.connect(80, ip);
    } catch (error) {
      cleanup();
      clearTimeout(timer);
      resolve(0);
    }
  });
};

async function resolveHostname(ip) {
  try {
    const hostnames = await dns.promises.reverse(ip);
    if (hostnames.length > 0) return hostnames[0];
  } catch {}

  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(500);
    socket.on('error', () => resolve(null));
    socket.on('timeout', () => resolve(null));
    socket.connect(137, ip, () => {
      socket.end();
      resolve(`NODE-${ip.replace(/\./g, '-')}`);
    });
  });
}

async function ensureNetworkCoverage() {
  try {
    console.log('Verificando cobertura de rede...');
    
    const existingIpsResult = await safeDbExecute('SELECT ip FROM devices');
    const existingIps = new Set(existingIpsResult.rows.map(row => row.ip));
    
    const missingIps = allIpsInRanges.filter(ip => !existingIps.has(ip));
    
    if (missingIps.length === 0) {
      console.log('Todos os IPs já estão no banco de dados');
      return;
    }
    
    console.log(`Inserindo ${missingIps.length} IPs faltantes...`);
    
    const batchSize = 100;
    for (let i = 0; i < missingIps.length; i += batchSize) {
      const batch = missingIps.slice(i, i + batchSize);
      
      const insertPromises = batch.map(async (ip) => {
        const hostname = await resolveHostname(ip);
        return safeDbExecute(
          'INSERT INTO devices (ip, name, type, status) VALUES ($1, $2, $3, $4) ON CONFLICT (ip) DO NOTHING',
          [ip, hostname || ip, 'Desconhecido', 0]
        );
      });
      
      await Promise.all(insertPromises);
      console.log(`Processado lote ${i/batchSize + 1} de ${Math.ceil(missingIps.length/batchSize)}`);
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log('IPs faltantes inseridos com sucesso');
  } catch (error) {
    console.error('Erro na validação de cobertura:', error);
  }
}

async function performInitialScan() {
  console.log('Iniciando verificação de status sequencial...');
  isInitialScanInProgress = true;
  try {
    const result = await safeDbExecute('SELECT id, ip, status FROM devices');
    const devices = result.rows;
    if (!devices || devices.length === 0) {
      console.log('Nenhum dispositivo encontrado para scan');
      isInitialScanInProgress = false;
      return;
    }
    await performSequentialScan(devices);
    console.log('Scan inicial completo!');
  } catch (error) {
    console.error('Erro no scan inicial:', error);
  } finally {
    isInitialScanInProgress = false;
  }
}

async function performSequentialScan(devices) {
  console.log('Executando scan sequencial...');
  let updatedCount = 0;
  
  const batchSize = 20;
  for (let i = 0; i < devices.length; i += batchSize) {
    const batch = devices.slice(i, i + batchSize);
    
    const updates = await Promise.all(
      batch.map(async (device) => {
        const status = await checkDeviceStatus(device.ip);
        if (status !== device.status) {
          await safeDbExecute(
            'UPDATE devices SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [status, device.id]
          );
          updatedCount++;
        }
        return status;
      })
    );
    
    console.log(`Processado lote ${Math.floor(i/batchSize) + 1} de ${Math.ceil(devices.length/batchSize)}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log(`Scan sequencial completo! ${updatedCount} dispositivos atualizados`);
  isInitialScanInProgress = false;
}

const initializeDatabase = async () => {
  try {
    const healthCheck = await checkDatabaseHealth();
    if (!healthCheck) throw new Error('Database is not accessible');

    await safeDbExecute(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        email TEXT,
        role TEXT DEFAULT 'user',
        last_login TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await safeDbExecute(`
      CREATE TABLE IF NOT EXISTS devices (
        id SERIAL PRIMARY KEY,
        ip TEXT NOT NULL UNIQUE,
        name TEXT,
        type TEXT,
        "user" TEXT,
        sector TEXT,
        status INTEGER DEFAULT 0,
        online BOOLEAN DEFAULT FALSE,
        login_username TEXT,
        login_password TEXT,
        wifi_ssid TEXT,
        wifi_password TEXT,
        hidden BOOLEAN DEFAULT FALSE,
        model TEXT,
        npat INTEGER DEFAULT 0,
        li TEXT,
        lf TEXT,
        updated_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await safeDbExecute(`
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        priority TEXT DEFAULT 'medium',
        status TEXT DEFAULT 'pending',
        category TEXT,
        due_date DATE,
        assigned_to TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await safeDbExecute(`
      CREATE TABLE IF NOT EXISTS user_settings (
        id SERIAL PRIMARY KEY,
        user_id INTEGER UNIQUE REFERENCES users(id),
        theme TEXT DEFAULT 'light',
        language TEXT DEFAULT 'pt-BR',
        notifications_enabled BOOLEAN DEFAULT TRUE,
        email_notifications BOOLEAN DEFAULT FALSE,
        refresh_interval INTEGER DEFAULT 30,
        timezone TEXT DEFAULT 'America/Sao_Paulo',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const adminCheck = await safeDbExecute('SELECT id FROM users WHERE username = $1', ['admin']);
    if (!adminCheck.rows || adminCheck.rows.length === 0) {
      const hashedPassword = await bcrypt.hash('admin', 10);
      await safeDbExecute(
        'INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3)',
        ['admin', hashedPassword, 'admin']
      );
      console.log('Default admin user created (username: admin, password: admin)');
    }

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  }
};

app.get('/api/health', async (req, res) => {
  try {
    const dbHealthy = await checkDatabaseHealth();
    const uptime = process.uptime();
    
    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(uptime),
      database: dbHealthy ? 'healthy' : 'unhealthy',
      memory: process.memoryUsage(),
      activeConnections: serverStats.activeConnections
    });
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

const JWT_SECRET = process.env.JWT_SECRET || 'TI';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'TI_REFRESH';
const JWT_EXPIRY = '15m'; // token curto
const REFRESH_EXPIRY = '7d'; // refresh token

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    const result = await safeDbExecute('SELECT * FROM users WHERE username = $1', [username]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) return res.status(401).json({ error: 'Invalid credentials' });

    await safeDbExecute('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

    const payload = { id: user.id, username: user.username, role: user.role || 'user' };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
    const refreshToken = jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: REFRESH_EXPIRY });

    res.cookie('refreshToken', refreshToken, { httpOnly: true, sameSite: 'strict', maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.json({ token, user: payload });
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Refresh token
app.post('/api/auth/refresh', async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) {
      return res.status(401).json({ error: 'No refresh token' });
    }

    // Verify refresh token and generate new access token
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const accessToken = jwt.sign(
      { id: decoded.id, username: decoded.username },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    res.json({ token: accessToken, user: decoded });
  } catch (error) {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

app.get('/api/auth/verify', authenticateToken, (req, res) => {
  res.json({ valid: true, user: req.user });
});


app.get('/api/devices', authenticateToken, async (req, res) => {
  try {
    const result = await safeDbExecute('SELECT * FROM devices ORDER BY ip');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching devices:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/devices/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { ip, name, type, user, sector } = req.body;

    if (!ip || !name) {
      return res.status(400).json({ error: 'IP and name are required' });
    }

    const checkResult = await safeDbExecute('SELECT * FROM devices WHERE id = $1', [id]);
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }

    await safeDbExecute(
      'UPDATE devices SET ip = $1, name = $2, type = $3, "user" = $4, sector = $5, updated_at = CURRENT_TIMESTAMP WHERE id = $6',
      [ip, name, type, user, sector, id]
    );

    const updatedResult = await safeDbExecute('SELECT * FROM devices WHERE id = $1', [id]);
    
    io.emit('deviceUpdated', updatedResult.rows[0]);
    
    res.json(updatedResult.rows[0]);
  } catch (error) {
    console.error('Error updating device:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/devices/export', authenticateToken, async (req, res) => {
  try {
    const result = await safeDbExecute('SELECT ip, name, type, sector, model, updated_at FROM devices ORDER BY ip');
    const devices = result.rows;

    if (devices.length === 0) {
      return res.status(404).json({ error: 'No devices found' });
    }

    const ws = XLSX.utils.json_to_sheet(devices);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Devices');

    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const filePath = path.join(tempDir, `devices_${Date.now()}.xlsx`);
    XLSX.writeFile(wb, filePath);

    res.download(filePath, 'devices.xlsx', (err) => {
      if (err) {
        console.error('Error sending file:', err);
        return res.status(500).json({ error: 'Error generating spreadsheet' });
      }
      
      setTimeout(() => {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }, 5000);
    });
  } catch (error) {
    console.error('Error exporting devices:', error);
    res.status(500).json({ error: 'Error exporting data' });
  }
});

app.get('/api/routers', authenticateToken, async (req, res) => {
  try {
    const result = await safeDbExecute(`
      SELECT id, ip, name, status, login_username, login_password, 
             wifi_ssid, wifi_password, hidden
      FROM devices
      WHERE type = $1
      ORDER BY ip
    `, ['Roteador']);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching routers:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/printers', authenticateToken, async (req, res) => {
  try {
    const result = await safeDbExecute(`
      SELECT id, ip, sector, status, model, npat, li, lf, online
      FROM devices
      WHERE type = $1
      ORDER BY sector, ip
    `, ['Impressora']);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching printers:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/printers/:id/online', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { online } = req.body;

    if (![1, 0].includes(online)) {
      return res.status(400).json({ error: 'Invalid online status. Must be 1 or 0.' });
    }

    const updateResult = await safeDbExecute(
      'UPDATE devices SET online = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND type = $3',
      [online, id, 'Impressora']
    );

    if (updateResult.rowCount === 0) {
      return res.status(404).json({ error: 'Printer not found' });
    }

    io.emit('printerStatusUpdate', { id: parseInt(id), online });

    res.json({ message: 'Printer status updated successfully' });
  } catch (error) {
    console.error('Error updating printer status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/boxes', authenticateToken, async (req, res) => {
  try {
    const result = await safeDbExecute(`
      SELECT id as device_id, ip, name, status, online as power_status
      FROM devices
      WHERE sector = $1
      ORDER BY name
    `, ['Caixas']);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching boxes:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/boxes/:id/power-status', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { power_status } = req.body;

    if (![1, 0].includes(power_status)) {
      return res.status(400).json({ error: 'Invalid power status. Must be 1 or 0.' });
    }

    const updateResult = await safeDbExecute(
      'UPDATE devices SET online = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND sector = $3',
      [power_status, id, 'Caixas']
    );

    if (updateResult.rowCount === 0) {
      return res.status(404).json({ error: 'Box not found' });
    }

    const result = await safeDbExecute(
      'SELECT id as device_id, ip, name, status, online as power_status FROM devices WHERE id = $1',
      [id]
    );

    io.emit('boxStatusUpdate', { id: parseInt(id), power_status });

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating box power status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/tasks', authenticateToken, async (req, res) => {
  try {
    const result = await safeDbExecute(`
      SELECT t.*, u.username as created_by_name
      FROM tasks t
      LEFT JOIN users u ON t.created_by = u.id
      ORDER BY t.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/tasks', authenticateToken, async (req, res) => {
  try {
    const { title, description, priority, category, due_date, assigned_to } = req.body;
    
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const result = await safeDbExecute(`
      INSERT INTO tasks (title, description, priority, category, due_date, assigned_to, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id
    `, [title, description, priority || 'medium', category, due_date, assigned_to, req.user.id]);

    const taskId = result.rows[0].id;
    const newTask = await safeDbExecute('SELECT * FROM tasks WHERE id = $1', [taskId]);

    io.emit('taskCreated', newTask.rows[0]);

    res.json(newTask.rows[0]);
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/tasks/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, priority, status, category, due_date, assigned_to } = req.body;

    const updateResult = await safeDbExecute(`
      UPDATE tasks 
      SET title = $1, description = $2, priority = $3, status = $4, 
          category = $5, due_date = $6, assigned_to = $7, updated_at = CURRENT_TIMESTAMP
      WHERE id = $8
    `, [title, description, priority, status, category, due_date, assigned_to, id]);

    if (updateResult.rowCount === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const updatedTask = await safeDbExecute('SELECT * FROM tasks WHERE id = $1', [id]);

    io.emit('taskUpdated', updatedTask.rows[0]);

    res.json(updatedTask.rows[0]);
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/tasks/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const deleteResult = await safeDbExecute('DELETE FROM tasks WHERE id = $1', [id]);

    if (deleteResult.rowCount === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    io.emit('taskDeleted', { id: parseInt(id) });

    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/settings', authenticateToken, async (req, res) => {
  try {
    const result = await safeDbExecute('SELECT * FROM user_settings WHERE user_id = $1', [req.user.id]);
    
    if (result.rows.length === 0) {
      await safeDbExecute(`
        INSERT INTO user_settings (user_id) VALUES ($1)
      `, [req.user.id]);
      
      const newSettings = await safeDbExecute('SELECT * FROM user_settings WHERE user_id = $1', [req.user.id]);
      res.json(newSettings.rows[0]);
    } else {
      res.json(result.rows[0]);
    }
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/settings', authenticateToken, async (req, res) => {
  try {
    const { theme, language, notifications_enabled, email_notifications, refresh_interval, timezone } = req.body;
    
    await safeDbExecute(`
      UPDATE user_settings 
      SET theme = $1, language = $2, notifications_enabled = $3, 
          email_notifications = $4, refresh_interval = $5, timezone = $6,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $7
    `, [theme, language, notifications_enabled, email_notifications, refresh_interval, timezone, req.user.id]);
    
    const updatedSettings = await safeDbExecute('SELECT * FROM user_settings WHERE user_id = $1', [req.user.id]);
    
    res.json(updatedSettings.rows[0]);
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/server-status', async (req, res) => {
  try {
    const devicesResult = await safeDbExecute('SELECT COUNT(*) as count FROM devices');
    const devicesCount = devicesResult.rows[0]?.count || 0;
    
    const onlineDevicesResult = await safeDbExecute('SELECT COUNT(*) as count FROM devices WHERE status = 1');
    const onlineDevicesCount = onlineDevicesResult.rows[0]?.count || 0;
    
    const printersResult = await safeDbExecute('SELECT COUNT(*) as count FROM devices WHERE type = $1', ['Impressora']);
    const printersCount = printersResult.rows[0]?.count || 0;
    
    const routersResult = await safeDbExecute('SELECT COUNT(*) as count FROM devices WHERE type = $1', ['Roteador']);
    const routersCount = routersResult.rows[0]?.count || 0;
    
    const boxesResult = await safeDbExecute('SELECT COUNT(*) as count FROM devices WHERE sector = $1', ['Caixas']);
    const boxesCount = boxesResult.rows[0]?.count || 0;

    const tasksResult = await safeDbExecute('SELECT COUNT(*) as count FROM tasks');
    const tasksCount = tasksResult.rows[0]?.count || 0;

    const uptime = Math.floor((new Date() - serverStats.startTime) / 1000);
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = uptime % 60;
    const uptimeString = `${days}d ${hours}h ${minutes}m ${seconds}s`;
    
    res.json({
      devicesCount,
      onlineDevicesCount,
      printersCount,
      routersCount,
      boxesCount,
      tasksCount,
      uptimeString,
      requestCount: serverStats.requestCount,
      activeConnections: serverStats.activeConnections,
      lastRequests: serverStats.lastRequests.slice(0, 10),
      databaseHealthy: serverStats.databaseHealthy,
      lastDatabaseCheck: serverStats.lastDatabaseCheck
    });
  } catch (error) {
    console.error('Error getting server status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const processDevices = async () => {
  if (!isInitialScanComplete || isInitialScanInProgress) {
    console.log('Aguardando scan inicial...');
    return;
  }
  
  try {
    if (!serverStats.databaseHealthy) {
      console.log('Database unhealthy, skipping device monitoring');
      return;
    }

    const result = await safeDbExecute('SELECT * FROM devices', [], 1, 10000);
    const devices = result.rows;

    if (!Array.isArray(devices) || devices.length === 0) {
      console.log('No devices found for monitoring');
      return;
    }

    console.log(`Starting monitoring for ${devices.length} devices...`);

    const BATCH_SIZE = 30;
    const parallelChecks = 15;
    
    let totalUpdated = 0;
    
    for (let i = 0; i < devices.length; i += BATCH_SIZE) {
      const batch = devices.slice(i, i + BATCH_SIZE);
      
      const updates = [];
      for (let j = 0; j < batch.length; j += parallelChecks) {
        const checkBatch = batch.slice(j, j + parallelChecks);
        
        const batchUpdates = await Promise.allSettled(
          checkBatch.map(async (device) => {
            try {
              const currentStatus = await checkDeviceStatus(device.ip, device, 1500);
              return {
                id: device.id,
                currentStatus,
                previousStatus: device.status,
                device
              };
            } catch (error) {
              console.error(`Error checking device ${device.ip}:`, error);
              return {
                id: device.id,
                currentStatus: device.status,
                previousStatus: device.status,
                device
              };
            }
          })
        );
        
        const successfulUpdates = batchUpdates
          .filter(result => result.status === 'fulfilled')
          .map(result => result.value);
        
        updates.push(...successfulUpdates);
      }

      const changes = updates.filter(u => u.currentStatus !== u.previousStatus);
      
      if (changes.length > 0) {
        const updatePromises = changes.map(change => 
          safeDbExecute(
            'UPDATE devices SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [change.currentStatus, change.id],
            1,
            5000
          )
        );

        const updateResults = await Promise.allSettled(updatePromises);
        const successfulUpdates = updateResults.filter(result => result.status === 'fulfilled').length;
        
        totalUpdated += successfulUpdates;

        for (let idx = 0; idx < changes.length; idx++) {
          if (updateResults[idx].status === 'fulfilled') {
            const change = changes[idx];
            try {
              io.emit('deviceStatusUpdate', {
                id: change.id,
                status: change.currentStatus,
                timestamp: new Date().toISOString()
              });
            } catch (socketError) {
              console.error('Socket.io emit error:', socketError);
            }
          }
        }
      }
      
      if (i + BATCH_SIZE < devices.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    if (totalUpdated > 0) {
      console.log(`Device monitoring completed: ${totalUpdated} devices updated`);
    }
  } catch (error) {
    console.error('Error in device monitoring:', error);
  }
};

const startMonitoring = () => {
  console.log('Starting device monitoring scheduler...');
  
  const monitorJob = nodeSchedule.scheduleJob('*/2 * * * *', async () => {
    console.log('Starting device monitoring cycle...');
    try {
      await processDevices();
    } catch (error) {
      console.error('Device monitoring cycle failed:', error);
    }
  });

  const healthJob = nodeSchedule.scheduleJob('*/5 * * * *', async () => {
    try {
      serverStats.databaseHealthy = await checkDatabaseHealth();
      serverStats.lastDatabaseCheck = new Date();
      
      if (!serverStats.databaseHealthy) {
        console.warn('Database health check failed!');
      }
    } catch (error) {
      console.error('Health check failed:', error);
      serverStats.databaseHealthy = false;
    }
  });

  const cleanupJob = nodeSchedule.scheduleJob('0 2 * * *', async () => {
    try {
      serverStats.lastRequests = serverStats.lastRequests.slice(0, 50);
      
      await safeDbExecute(
        'DELETE FROM notifications WHERE created_at < NOW() - INTERVAL \'7 days\'',
        [],
        1,
        10000
      );
      
      console.log('Daily cleanup completed');
    } catch (error) {
      console.error('Error in daily cleanup:', error);
    }
  });

  process.on('SIGTERM', () => {
    console.log('SIGTERM received, canceling scheduled jobs...');
    monitorJob.cancel();
    healthJob.cancel();
    cleanupJob.cancel();
  });

  process.on('SIGINT', () => {
    console.log('SIGINT received, canceling scheduled jobs...');
    monitorJob.cancel();
    healthJob.cancel();
    cleanupJob.cancel();
  });
};
// middleware: valida e filtra conexões antes do `connection`
io.use((socket, next) => {
  try {
    const hs = socket.handshake || {};
    const auth = hs.auth || {};
    const query = hs.query || {};
    const ua = (hs.headers || {})['user-agent'] || '';
    const ip = hs.address || socket.conn?.remoteAddress || (socket.request && socket.request.connection && socket.request.connection.remoteAddress) || 'unknown';

    const allowedProbeUA = ['kube-probe', 'ELB-HealthChecker', 'ELB-HealthChecker/2.0', 'UptimeRobot'];
    const isProbe = allowedProbeUA.some(x => ua.toLowerCase().includes(x.toLowerCase()));
    const token = (auth.token || query.token || '').toString().trim();

    if (!token && !isProbe && ip !== '127.0.0.1' && ip !== '::1') {
      return next(new Error('unauthorized'));
    }

    socket.meta = {
      ip,
      ua,
      token: token ? `${token.slice(0,6)}...` : null,
      isProbe
    };

    next();
  } catch (err) {
    next(err);
  }
});

io.on('connection', (socket) => {
  const meta = socket.meta || {};
  const ip = meta.ip || socket.handshake.address || 'unknown';
  const ua = meta.ua || socket.handshake.headers?.['user-agent'] || '';
  const isProbe = !!meta.isProbe;

  if (!isProbe) {
    serverStats.activeConnections = Math.max(0, (serverStats.activeConnections || 0) + 1);
    socket._counted = true;
  } else {
    socket._counted = false;
  }

  console.log('Client connected:', socket.id, 'ip=', ip, 'ua=', ua, isProbe ? '[probe]' : '');

  socket.emit('serverHealth', {
    databaseHealthy: serverStats.databaseHealthy,
    uptime: Math.floor((Date.now() - serverStats.startTime) / 1000)
  });

  socket.on('forceDeviceCheck', async (deviceId) => {
    try {
      if (!serverStats.databaseHealthy) {
        socket.emit('error', { message: 'Database is currently unavailable' });
        return;
      }

      const result = await safeDbExecute('SELECT * FROM devices WHERE id = $1', [deviceId]);
      const device = result.rows[0];

      if (!device) {
        socket.emit('error', { message: 'Device not found' });
        return;
      }

      const status = await checkDeviceStatus(device.ip, device);
      const updateResult = await safeDbExecute(
        'UPDATE devices SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [status, deviceId]
      );

      if (updateResult && updateResult.rowCount > 0) {
        const payload = { id: parseInt(deviceId), status, timestamp: new Date().toISOString() };
        socket.emit('deviceStatusUpdate', payload);
        socket.broadcast.emit('deviceStatusUpdate', payload);
      }
    } catch (error) {
      console.error('Force check failed:', error);
      socket.emit('error', { message: 'Force check failed: ' + (error.message || error) });
    }
  });

  socket.on('joinRoom', (room) => {
    socket.join(room);
    console.log(`Client ${socket.id} joined room: ${room}`);
  });

  socket.on('leaveRoom', (room) => {
    socket.leave(room);
    console.log(`Client ${socket.id} left room: ${room}`);
  });

  socket.on('ping', () => socket.emit('pong'));

  socket.on('disconnect', (reason) => {
    if (socket._counted) serverStats.activeConnections = Math.max(0, (serverStats.activeConnections || 0) - 1);
    console.log('Client disconnected:', socket.id, 'Reason:', reason, 'ip=', meta.ip || 'unknown');
  });

  socket.on('error', (error) => {
    console.error('Socket error for client', socket.id, ':', error);
  });
});


if (fs.existsSync(distPath)) {
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'API endpoint not found' });
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  
  if (error.code === 'ECONNABORTED') {
    return res.status(408).json({ error: 'Request timeout' });
  }
  
  if (error.name === 'ValidationError') {
    return res.status(400).json({ error: 'Validation error: ' + error.message });
  }
  
  if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
    return res.status(503).json({ error: 'Database is unavailable, please try again' });
  }
  
  res.status(500).json({ 
    error: 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

app.use('/api/*', (req, res) => {
  res.status(404).json({ 
    error: 'API endpoint not found',
    path: req.path,
    method: req.method
  });
});

let serverStarted = false;

const startServer = async () => {
  if (serverStarted) return;
  serverStarted = true;

  try {
    console.log('🚀 Starting server initialization...');
    
    console.log('Initializing database...');
    await initializeDatabase();

    const PORT = process.env.PORT || 5173;
    const HOST = process.env.HOST || '0.0.0.0';
    
    httpServer.listen(PORT, HOST, () => {
      console.log(`🚀 Servidor rodando em http://${HOST}:${PORT}`);
      console.log(`📊 Health check disponível em http://${HOST}:${PORT}/api/health`);
    });

    console.log('Starting background tasks...');
    
    ensureNetworkCoverage()
      .then(() => {
        console.log('Network coverage ensured, starting initial scan...');
        return performInitialScan();
      })
      .then(() => {
        console.log('Initial scan completed, starting monitoring...');
        isInitialScanComplete = true;
        startMonitoring();
        console.log('✅ Server fully initialized and monitoring started');
      })
      .catch((error) => {
        console.error('❌ Erro na inicialização em background:', error);
        isInitialScanComplete = true;
        startMonitoring();
      });

  } catch (error) {
    console.error('❌ Falha crítica ao iniciar servidor:', error);
    process.exit(1);
  }
};

const gracefulShutdown = (signal) => {
  console.log(`\n${signal} received, shutting down gracefully...`);
  
  httpServer.close(() => {
    console.log('✅ HTTP server closed');
    
    io.close(() => {
      console.log('✅ Socket.io server closed');
      
      try {
        db.end();
        console.log('✅ Database connections closed');
      } catch (error) {
        console.error('Error closing database:', error);
      }
      
      console.log('✅ Graceful shutdown completed');
      process.exit(0);
    });
  });
  
  setTimeout(() => {
    console.error('⚠️ Forced shutdown due to timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

startServer();
