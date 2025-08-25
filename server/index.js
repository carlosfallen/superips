import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { createClient } from '@libsql/client';
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
import { Worker, parentPort, workerData, isMainThread } from 'worker_threads';
import os from 'os';
import dns from 'dns';

// 1. Primeiro crie __dirname e __filename
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 2. Inicialize as variáveis de ambiente
dotenv.config();

// 3. Inicialize as variáveis de controle
let isInitialScanComplete = false;
let isInitialScanInProgress = false;

// 4. Configurações de diretório e banco de dados
const dataDir = '/app/data';
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'local.db');
console.log('Database path:', dbPath);

// CORREÇÃO 1: Pool de conexões melhorado para evitar travamento do banco
const db = createClient({
  url: `file:${dbPath}`,
  busyTimeout: 120000, // Aumentado para 120 segundos
  connectionPoolSize: 10, // Aumentado o pool
  pragmas: {
    journal_mode: 'WAL',
    synchronous: 'NORMAL',
    busy_timeout: 120000,
    cache_size: -2000,
    temp_store: 'memory'
  }
});

// CORREÇÃO 2: Health check do banco de dados
const checkDatabaseHealth = async () => {
  try {
    await db.execute({ sql: 'SELECT 1 as health_check', args: [] });
    return true;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
};

// 6. Inicialize o Express e Socket.io
const app = express();
const distPath = path.join(__dirname, '../dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}

const httpServer = createServer(app);

// CORREÇÃO 3: Configurações melhoradas do Socket.io
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  },
  pingTimeout: 60000, // 60 segundos
  pingInterval: 25000, // 25 segundos
  transports: ['websocket', 'polling'],
  allowEIO3: true
});

// 7. Defina o workerPath (mas não crie o worker ainda)
const workerPath = path.join(__dirname, 'worker.js');

// Verifique se o arquivo worker.js existe
if (!fs.existsSync(workerPath)) {
  console.error('Arquivo worker.js não encontrado em:', workerPath);
  // Não saia do processo, continue sem os workers
  console.log('Continuando sem workers...');
}

// CORREÇÃO 4: CORS melhorado
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// CORREÇÃO 5: Middleware de timeout para requisições
app.use((req, res, next) => {
  req.setTimeout(30000); // 30 segundos
  res.setTimeout(30000);
  next();
});

// Authentication middleware com melhor tratamento de erro
const authenticateToken = (req, res, next) => {
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

    jwt.verify(token, process.env.JWT_SECRET || 'TI', (err, user) => {
      if (err) {
        console.log(`❌ Token verification failed for ${req.method} ${req.path}:`, err.message);
        
        if (err.name === 'TokenExpiredError') {
          return res.status(401).json({ 
            error: 'Token expired', 
            code: 'TOKEN_EXPIRED',
            timestamp: new Date().toISOString(),
            expiredAt: err.expiredAt
          });
        }
        
        if (err.name === 'JsonWebTokenError') {
          return res.status(403).json({ 
            error: 'Invalid token', 
            code: 'INVALID_TOKEN',
            timestamp: new Date().toISOString()
          });
        }
        
        return res.status(403).json({ 
          error: 'Token verification failed', 
          code: 'TOKEN_ERROR',
          timestamp: new Date().toISOString()
        });
      }
      
      req.user = user;
      next();
    });
  } catch (error) {
    console.error('❌ Authentication middleware error:', error);
    return res.status(500).json({ 
      error: 'Authentication error', 
      code: 'AUTH_ERROR',
      timestamp: new Date().toISOString()
    });
  }
};

// Server statistics tracking
let serverStats = {
  startTime: new Date(),
  requestCount: 0,
  lastRequests: [],
  activeConnections: 0,
  totalDataTransferred: 0,
  lastDatabaseCheck: new Date(),
  databaseHealthy: true
};

// CORREÇÃO 6: Middleware com melhor rastreamento e health check
app.use(async (req, res, next) => {
  if (req.method === 'GET' && req.path === '/') {
    return next();
  }

  // Health check periódico do banco
  const now = new Date();
  if (now - serverStats.lastDatabaseCheck > 60000) { // A cada minuto
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

// CORREÇÃO 7: Helper function melhorada com retry e timeout
const safeDbExecute = async (sql, args = [], maxRetries = 3, timeout = 30000) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Criar uma Promise com timeout
      const executePromise = db.execute({ sql, args });
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Database query timeout')), timeout);
      });
      
      const result = await Promise.race([executePromise, timeoutPromise]);
      return result;
    } catch (error) {
      console.error(`Database error (attempt ${attempt}/${maxRetries}):`, error);
      
      if (attempt === maxRetries) {
        console.error('Max retries reached, returning empty result');
        return { rows: [], rowsAffected: 0 };
      }
      
      // Aguardar antes de tentar novamente
      await new Promise(resolve => setTimeout(resolve, attempt * 1000));
    }
  }
  
  return { rows: [], rowsAffected: 0 };
};

// Check if column exists in table
const columnExists = async (tableName, columnName) => {
  try {
    const result = await safeDbExecute(`PRAGMA table_info(${tableName})`);
    return result.rows.some(row => row.name === columnName);
  } catch (error) {
    console.error(`Error checking column ${columnName} in ${tableName}:`, error);
    return false;
  }
};

// Add column if it doesn't exist
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
  '10.0.11.1-10.0.11.254',    // Faixa 10.0.11.x
  '10.2.11.1-10.2.11.254',    // Faixa 10.2.11.x  
  '10.4.11.1-10.4.11.254'     // Faixa 10.4.11.x
];

// Função para expandir uma faixa de IPs
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

// Gerar todos os IPs das faixas
const allIpsInRanges = networkRanges.flatMap(range => expandIpRange(range));

// CORREÇÃO 8: Função checkDeviceStatus melhorada (estava faltando no código original)
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
      resolve(0); // offline
    }, timeout);
    
    socket.setTimeout(timeout);
    
    socket.on('connect', () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        socket.destroy();
        resolve(1); // online
      }
    });
    
    socket.on('error', () => {
      cleanup();
      clearTimeout(timer);
      resolve(0); // offline
    });
    
    socket.on('timeout', () => {
      cleanup();
      clearTimeout(timer);
      resolve(0); // offline
    });
    
    // Tentar conectar na porta 80 primeiro, depois 22 se for necessário
    try {
      socket.connect(80, ip);
    } catch (error) {
      cleanup();
      clearTimeout(timer);
      resolve(0);
    }
  });
};

// Função para verificar o hostname
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
    
    const batchSize = 100; // Reduzido para evitar travamento
    for (let i = 0; i < missingIps.length; i += batchSize) {
      const batch = missingIps.slice(i, i + batchSize);
      
      const insertPromises = batch.map(async (ip) => {
        const hostname = await resolveHostname(ip);
        return safeDbExecute(
          'INSERT OR IGNORE INTO devices (ip, name, type, status) VALUES (?, ?, ?, ?)',
          [ip, hostname || ip, 'Desconhecido', 0]
        );
      });
      
      await Promise.all(insertPromises);
      console.log(`Processado lote ${i/batchSize + 1} de ${Math.ceil(missingIps.length/batchSize)}`);
      
      // Pequeno delay para não sobrecarregar o banco
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log('IPs faltantes inseridos com sucesso');
  } catch (error) {
    console.error('Erro na validação de cobertura:', error);
  }
}

async function performInitialScan() {
  return new Promise((resolve, reject) => {
    console.log('Iniciando verificação de status paralela...');
    isInitialScanInProgress = true;
    
    safeDbExecute('SELECT id, ip FROM devices').then((result) => {
      const devices = result.rows;
      if (devices.length === 0) {
        console.log('Nenhum dispositivo encontrado para scan');
        isInitialScanInProgress = false;
        return resolve();
      }
      
      // CORREÇÃO 9: Verificar se o worker existe antes de usar
      if (!fs.existsSync(workerPath)) {
        console.log('Worker não disponível, usando scan sequencial...');
        performSequentialScan(devices).then(resolve).catch(reject);
        return;
      }
      
      const cpuCores = os.cpus().length;
      const workersCount = Math.min(cpuCores, 3); // Reduzido para 3 workers
      const ipsPerWorker = Math.ceil(devices.length / workersCount);
      
      let completedWorkers = 0;
      let updatedCount = 0;
      
      for (let i = 0; i < workersCount; i++) {
        const startIdx = i * ipsPerWorker;
        const endIdx = Math.min(startIdx + ipsPerWorker, devices.length);
        const workerIps = devices.slice(startIdx, endIdx);
        
        try {
          const worker = new Worker(workerPath, {
            workerData: { 
              ips: workerIps,
              dbUrl: `file:${dbPath}`
            }
          });
          
          worker.on('message', (count) => {
            updatedCount += count;
          });
          
          worker.on('error', (err) => {
            console.error('Worker error:', err);
            completedWorkers++;
            if (completedWorkers === workersCount) {
              isInitialScanInProgress = false;
              resolve();
            }
          });
          
          worker.on('exit', (code) => {
            completedWorkers++;
            if (completedWorkers === workersCount) {
              console.log(`Scan inicial completo! ${updatedCount} dispositivos atualizados`);
              isInitialScanInProgress = false;
              resolve();
            }
          });
        } catch (error) {
          console.error('Erro ao criar worker:', error);
          completedWorkers++;
          if (completedWorkers === workersCount) {
            isInitialScanInProgress = false;
            resolve();
          }
        }
      }
    }).catch(reject);
  });
}

// CORREÇÃO 10: Scan sequencial como fallback
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
            'UPDATE devices SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
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

// Initialize database tables
const initializeDatabase = async () => {
  try {
    // Verificar se o banco está acessível
    const healthCheck = await checkDatabaseHealth();
    if (!healthCheck) {
      throw new Error('Database is not accessible');
    }

    // Users table
    await safeDbExecute(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add missing columns to users table
    await addColumnIfNotExists('users', 'email', 'TEXT');
    await addColumnIfNotExists('users', 'role', 'TEXT', "'user'");
    await addColumnIfNotExists('users', 'last_login', 'DATETIME');

    // Devices table
    await safeDbExecute(`
      CREATE TABLE IF NOT EXISTS devices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ip TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        user TEXT,
        sector TEXT,
        status INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add missing columns to devices table
    await addColumnIfNotExists('devices', 'online', 'INTEGER', '0');
    await addColumnIfNotExists('devices', 'login_username', 'TEXT');
    await addColumnIfNotExists('devices', 'login_password', 'TEXT');
    await addColumnIfNotExists('devices', 'wifi_ssid', 'TEXT');
    await addColumnIfNotExists('devices', 'wifi_password', 'TEXT');
    await addColumnIfNotExists('devices', 'hidden', 'INTEGER', '0');
    await addColumnIfNotExists('devices', 'model', 'TEXT');
    await addColumnIfNotExists('devices', 'npat', 'INTEGER', '0');
    await addColumnIfNotExists('devices', 'li', 'TEXT');
    await addColumnIfNotExists('devices', 'lf', 'TEXT');
    await addColumnIfNotExists('devices', 'updated_at', 'DATETIME');

    // Tasks table
    await safeDbExecute(`
      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        priority TEXT DEFAULT 'medium',
        status TEXT DEFAULT 'pending',
        category TEXT,
        due_date DATE,
        assigned_to TEXT,
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users(id)
      )
    `);

    // Settings table
    await safeDbExecute(`
      CREATE TABLE IF NOT EXISTS user_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER UNIQUE,
        theme TEXT DEFAULT 'light',
        language TEXT DEFAULT 'pt-BR',
        notifications_enabled INTEGER DEFAULT 1,
        email_notifications INTEGER DEFAULT 0,
        refresh_interval INTEGER DEFAULT 30,
        timezone TEXT DEFAULT 'America/Sao_Paulo',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // Create default admin user if not exists
    const adminCheck = await safeDbExecute('SELECT * FROM users WHERE username = ?', ['admin']);
    if (adminCheck.rows.length === 0) {
      const hashedPassword = await bcrypt.hash('admin', 10);
      await safeDbExecute(
        'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
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

// CORREÇÃO 11: Health check endpoint
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

// CORREÇÃO 4: Modificar o login para incluir informações do token
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const result = await safeDbExecute('SELECT * FROM users WHERE username = ?', [username]);
    const user = result.rows[0];

    if (!user) {
      console.log(`❌ Login failed - user not found: ${username}`);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      console.log(`❌ Login failed - invalid password: ${username}`);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login
    await safeDbExecute('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);

    const tokenPayload = { 
      id: user.id, 
      username: user.username, 
      role: user.role || 'user' 
    };

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET || 'TI', { expiresIn: '24h' });

    console.log(`✅ Login successful: ${username}`);

    res.json({ 
      id: user.id, 
      username: user.username, 
      role: user.role || 'user',
      token,
      tokenExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24h from now
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, email } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await safeDbExecute(
      'INSERT INTO users (username, password_hash, email, role) VALUES (?, ?, ?, ?)',
      [username, hashedPassword, email || null, 'user']
    );

    const userId = Number(result.lastInsertRowid);
    const token = jwt.sign(
      { id: userId, username, role: 'user' },
      process.env.JWT_SECRET || 'TI',
      { expiresIn: '24h' }
    );

    res.json({ id: userId, username, role: 'user', token });
  } catch (error) {
    if (error.message && error.message.includes('UNIQUE constraint failed')) {
      res.status(400).json({ error: 'Username already exists' });
    } else {
      console.error('Registration error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// CORREÇÃO 2: Endpoint para verificar se o token é válido
app.get('/api/auth/verify', authenticateToken, (req, res) => {
  res.json({
    valid: true,
    user: {
      id: req.user.id,
      username: req.user.username,
      role: req.user.role
    },
    timestamp: new Date().toISOString()
  });
});

// CORREÇÃO 3: Endpoint para refresh token
app.post('/api/auth/refresh', authenticateToken, async (req, res) => {
  try {
    // Gerar novo token com 24h de validade
    const newToken = jwt.sign(
      { 
        id: req.user.id, 
        username: req.user.username, 
        role: req.user.role 
      },
      process.env.JWT_SECRET || 'TI',
      { expiresIn: '24h' }
    );

    // Atualizar last_login
    await safeDbExecute('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [req.user.id]);

    res.json({ 
      token: newToken,
      user: {
        id: req.user.id,
        username: req.user.username,
        role: req.user.role
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Token refresh error:', error);
    res.status(500).json({ 
      error: 'Failed to refresh token',
      code: 'REFRESH_ERROR',
      timestamp: new Date().toISOString()
    });
  }
});

// Device routes com timeout
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

    const checkResult = await safeDbExecute('SELECT * FROM devices WHERE id = ?', [id]);
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }

    await safeDbExecute(
      'UPDATE devices SET ip = ?, name = ?, type = ?, user = ?, sector = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [ip, name, type, user, sector, id]
    );

    const updatedResult = await safeDbExecute('SELECT * FROM devices WHERE id = ?', [id]);
    
    // Emit update to all connected clients
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
      
      // Clean up temp file
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

// Router routes
app.get('/api/routers', authenticateToken, async (req, res) => {
  try {
    const result = await safeDbExecute(`
      SELECT id, ip, name, status, login_username, login_password, 
             wifi_ssid, wifi_password, hidden
      FROM devices
      WHERE type = 'Roteador'
      ORDER BY ip
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching routers:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Printer routes
app.get('/api/printers', authenticateToken, async (req, res) => {
  try {
    const result = await safeDbExecute(`
      SELECT id, ip, sector, status, model, npat, li, lf, online
      FROM devices
      WHERE type = 'Impressora'
      ORDER BY sector, ip
    `);
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
      'UPDATE devices SET online = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND type = ?',
      [online, id, 'Impressora']
    );

    if (updateResult.rowsAffected === 0) {
      return res.status(404).json({ error: 'Printer not found' });
    }

    // Emit real-time update
    io.emit('printerStatusUpdate', { id: parseInt(id), online });

    res.json({ message: 'Printer status updated successfully' });
  } catch (error) {
    console.error('Error updating printer status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Box routes
app.get('/api/boxes', authenticateToken, async (req, res) => {
  try {
    const result = await safeDbExecute(`
      SELECT id as device_id, ip, name, status, online as power_status
      FROM devices
      WHERE sector = 'Caixas'
      ORDER BY name
    `);
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
      'UPDATE devices SET online = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND sector = ?',
      [power_status, id, 'Caixas']
    );

    if (updateResult.rowsAffected === 0) {
      return res.status(404).json({ error: 'Box not found' });
    }

    // Get updated box data
    const result = await safeDbExecute(
      'SELECT id as device_id, ip, name, status, online as power_status FROM devices WHERE id = ?',
      [id]
    );

    // Emit real-time update
    io.emit('boxStatusUpdate', { id: parseInt(id), power_status });

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating box power status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Task routes
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
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [title, description, priority || 'medium', category, due_date, assigned_to, req.user.id]);

    const taskId = result.lastInsertRowid;
    const newTask = await safeDbExecute('SELECT * FROM tasks WHERE id = ?', [taskId]);

    // Emit real-time update
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
      SET title = ?, description = ?, priority = ?, status = ?, 
          category = ?, due_date = ?, assigned_to = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [title, description, priority, status, category, due_date, assigned_to, id]);

    if (updateResult.rowsAffected === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const updatedTask = await safeDbExecute('SELECT * FROM tasks WHERE id = ?', [id]);

    // Emit real-time update
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

    const deleteResult = await safeDbExecute('DELETE FROM tasks WHERE id = ?', [id]);

    if (deleteResult.rowsAffected === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Emit real-time update
    io.emit('taskDeleted', { id: parseInt(id) });

    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Settings routes
app.get('/api/settings', authenticateToken, async (req, res) => {
  try {
    const result = await safeDbExecute('SELECT * FROM user_settings WHERE user_id = ?', [req.user.id]);
    
    if (result.rows.length === 0) {
      // Create default settings
      await safeDbExecute(`
        INSERT INTO user_settings (user_id) VALUES (?)
      `, [req.user.id]);
      
      const newSettings = await safeDbExecute('SELECT * FROM user_settings WHERE user_id = ?', [req.user.id]);
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
      SET theme = ?, language = ?, notifications_enabled = ?, 
          email_notifications = ?, refresh_interval = ?, timezone = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `, [theme, language, notifications_enabled, email_notifications, refresh_interval, timezone, req.user.id]);
    
    const updatedSettings = await safeDbExecute('SELECT * FROM user_settings WHERE user_id = ?', [req.user.id]);
    
    res.json(updatedSettings.rows[0]);
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Server status route
app.get('/api/server-status', async (req, res) => {
  try {
    const devicesResult = await safeDbExecute('SELECT COUNT(*) as count FROM devices');
    const devicesCount = devicesResult.rows[0]?.count || 0;
    
    const onlineDevicesResult = await safeDbExecute('SELECT COUNT(*) as count FROM devices WHERE status = 1');
    const onlineDevicesCount = onlineDevicesResult.rows[0]?.count || 0;
    
    const printersResult = await safeDbExecute('SELECT COUNT(*) as count FROM devices WHERE type = ?', ['Impressora']);
    const printersCount = printersResult.rows[0]?.count || 0;
    
    const routersResult = await safeDbExecute('SELECT COUNT(*) as count FROM devices WHERE type = ?', ['Roteador']);
    const routersCount = routersResult.rows[0]?.count || 0;
    
    const boxesResult = await safeDbExecute('SELECT COUNT(*) as count FROM devices WHERE sector = ?', ['Caixas']);
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

// CORREÇÃO 12: Device monitoring process melhorado
const processDevices = async () => {
  if (!isInitialScanComplete || isInitialScanInProgress) {
    console.log('Aguardando scan inicial...');
    return;
  }
  
  try {
    // Verificar saúde do banco antes de continuar
    if (!serverStats.databaseHealthy) {
      console.log('Database unhealthy, skipping device monitoring');
      return;
    }

    const result = await safeDbExecute('SELECT * FROM devices', [], 1, 10000); // Timeout de 10s
    const devices = result.rows;

    if (!Array.isArray(devices) || devices.length === 0) {
      console.log('No devices found for monitoring');
      return;
    }

    console.log(`Starting monitoring for ${devices.length} devices...`);

    const BATCH_SIZE = 30;  // Reduzido para evitar sobrecarga
    const parallelChecks = 15; // Reduzido também
    
    let totalUpdated = 0;
    
    for (let i = 0; i < devices.length; i += BATCH_SIZE) {
      const batch = devices.slice(i, i + BATCH_SIZE);
      
      // Executar verificações em paralelo dentro do batch
      const updates = [];
      for (let j = 0; j < batch.length; j += parallelChecks) {
        const checkBatch = batch.slice(j, j + parallelChecks);
        
        const batchUpdates = await Promise.allSettled(
          checkBatch.map(async (device) => {
            try {
              const currentStatus = await checkDeviceStatus(device.ip, device, 1500); // Timeout reduzido
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
                currentStatus: device.status, // Manter status anterior em caso de erro
                previousStatus: device.status,
                device
              };
            }
          })
        );
        
        // Processar apenas resultados bem-sucedidos
        const successfulUpdates = batchUpdates
          .filter(result => result.status === 'fulfilled')
          .map(result => result.value);
        
        updates.push(...successfulUpdates);
      }

      // Filter and update only changed devices
      const changes = updates.filter(u => u.currentStatus !== u.previousStatus);
      
      // Atualizar em lote com timeout
      if (changes.length > 0) {
        const updatePromises = changes.map(change => 
          safeDbExecute(
            'UPDATE devices SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [change.currentStatus, change.id],
            1, // Apenas 1 tentativa para updates
            5000 // Timeout de 5s para updates
          )
        );

        const updateResults = await Promise.allSettled(updatePromises);
        const successfulUpdates = updateResults.filter(result => result.status === 'fulfilled').length;
        
        totalUpdated += successfulUpdates;

        // Notificações e eventos em tempo real - apenas para updates bem-sucedidos
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
      
      // Pequeno delay entre batches para evitar sobrecarga
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

// CORREÇÃO 13: Start monitoring with intelligent scheduling melhorado
const startMonitoring = () => {
  console.log('Starting device monitoring scheduler...');
  
  // Monitor devices every 2 minutes (reduzido de 3)
  const monitorJob = nodeSchedule.scheduleJob('*/2 * * * *', async () => {
    console.log('Starting device monitoring cycle...');
    try {
      await processDevices();
    } catch (error) {
      console.error('Device monitoring cycle failed:', error);
    }
  });

  // Health check do banco a cada 5 minutos
  const healthJob = nodeSchedule.scheduleJob('*/5 * * * *', async () => {
    try {
      serverStats.databaseHealthy = await checkDatabaseHealth();
      serverStats.lastDatabaseCheck = new Date();
      
      if (!serverStats.databaseHealthy) {
        console.warn('Database health check failed!');
        // Tentar reconectar ou reinicializar se necessário
      }
    } catch (error) {
      console.error('Health check failed:', error);
      serverStats.databaseHealthy = false;
    }
  });

  // Clean old data every day
  const cleanupJob = nodeSchedule.scheduleJob('0 2 * * *', async () => { // 2 AM
    try {
      // Clean old request logs
      serverStats.lastRequests = serverStats.lastRequests.slice(0, 50);
      
      // Clean old notifications if table exists
      await safeDbExecute(
        'DELETE FROM notifications WHERE created_at < datetime("now", "-7 days")',
        [],
        1,
        10000
      );
      
      console.log('Daily cleanup completed');
    } catch (error) {
      console.error('Error in daily cleanup:', error);
    }
  });

  // Graceful shutdown handler
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

// CORREÇÃO 14: Socket.io events melhorados
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  serverStats.activeConnections++;
  
  // Enviar status de saúde do servidor na conexão
  socket.emit('serverHealth', {
    databaseHealthy: serverStats.databaseHealthy,
    uptime: Math.floor((new Date() - serverStats.startTime) / 1000)
  });
  
  socket.on('forceDeviceCheck', async (deviceId) => {
    try {
      if (!serverStats.databaseHealthy) {
        socket.emit('error', { message: 'Database is currently unavailable' });
        return;
      }

      const result = await safeDbExecute('SELECT * FROM devices WHERE id = ?', [deviceId]);
      const device = result.rows[0];
      
      if (device) {
        const status = await checkDeviceStatus(device.ip, device);
        const updateResult = await safeDbExecute(
          'UPDATE devices SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [status, deviceId]
        );
        
        if (updateResult.rowsAffected > 0) {
          socket.emit('deviceStatusUpdate', { 
            id: parseInt(deviceId), 
            status,
            timestamp: new Date().toISOString()
          });
          
          // Broadcast to all other clients
          socket.broadcast.emit('deviceStatusUpdate', { 
            id: parseInt(deviceId), 
            status,
            timestamp: new Date().toISOString()
          });
        }
      } else {
        socket.emit('error', { message: 'Device not found' });
      }
    } catch (error) {
      console.error('Force check failed:', error);
      socket.emit('error', { message: 'Force check failed: ' + error.message });
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

  // Ping-pong para manter conexão ativa
  socket.on('ping', () => {
    socket.emit('pong');
  });

  socket.on('disconnect', (reason) => {
    console.log('Client disconnected:', socket.id, 'Reason:', reason);
    serverStats.activeConnections--;
  });

  socket.on('error', (error) => {
    console.error('Socket error for client', socket.id, ':', error);
  });
});

// Serve static files and handle SPA routing
if (fs.existsSync(distPath)) {
  app.get('*', (req, res) => {
    // Não servir arquivos estáticos para rotas da API
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'API endpoint not found' });
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// CORREÇÃO 15: Error handling middleware melhorado
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  
  // Diferentes tipos de erro
  if (error.code === 'ECONNABORTED') {
    return res.status(408).json({ error: 'Request timeout' });
  }
  
  if (error.name === 'ValidationError') {
    return res.status(400).json({ error: 'Validation error: ' + error.message });
  }
  
  if (error.code === 'SQLITE_BUSY') {
    return res.status(503).json({ error: 'Database is busy, please try again' });
  }
  
  res.status(500).json({ 
    error: 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// 404 handler para APIs
app.use('/api/*', (req, res) => {
  res.status(404).json({ 
    error: 'API endpoint not found',
    path: req.path,
    method: req.method
  });
});

let serverStarted = false;

// CORREÇÃO 16: Função de inicialização melhorada
const startServer = async () => {
  if (serverStarted) return;
  serverStarted = true;

  try {
    console.log('🚀 Starting server initialization...');
    
    // Verificar e criar arquivo de banco se necessário
    if (!fs.existsSync(dbPath)) {
      console.log('Creating database file...');
      fs.writeFileSync(dbPath, '');
    }

    // Inicializar banco de dados
    console.log('Initializing database...');
    await initializeDatabase();

    // Inicie o servidor HTTP imediatamente
    const PORT = process.env.PORT || 5173;
    const HOST = process.env.HOST || '0.0.0.0';
    
    httpServer.listen(PORT, HOST, () => {
      console.log(`🚀 Servidor rodando em http://${HOST}:${PORT}`);
      console.log(`📊 Health check disponível em http://${HOST}:${PORT}/api/health`);
    });

    // Executar tarefas pesadas em background
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
        // Não falhar o servidor, apenas registrar o erro
        isInitialScanComplete = true; // Permitir que o servidor continue funcionando
        startMonitoring(); // Iniciar monitoramento mesmo com erro no scan inicial
      });

  } catch (error) {
    console.error('❌ Falha crítica ao iniciar servidor:', error);
    process.exit(1);
  }
};

// CORREÇÃO 17: Graceful shutdown melhorado
const gracefulShutdown = (signal) => {
  console.log(`\n${signal} received, shutting down gracefully...`);
  
  // Parar de aceitar novas conexões
  httpServer.close(() => {
    console.log('✅ HTTP server closed');
    
    // Fechar conexões do Socket.io
    io.close(() => {
      console.log('✅ Socket.io server closed');
      
      // Fechar conexões do banco de dados
      try {
        db.close();
        console.log('✅ Database connections closed');
      } catch (error) {
        console.error('Error closing database:', error);
      }
      
      console.log('✅ Graceful shutdown completed');
      process.exit(0);
    });
  });
  
  // Forçar saída após 10 segundos
  setTimeout(() => {
    console.error('⚠️ Forced shutdown due to timeout');
    process.exit(1);
  }, 10000);
};

// Registrar handlers de shutdown
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handler para erros não capturados
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Não sair do processo para rejections, apenas registrar
});

// Inicializar servidor apenas no thread principal
if (isMainThread) {
  startServer();
}