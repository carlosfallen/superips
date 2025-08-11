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

const db = createClient({
  url: `file:${dbPath}`,
  busyTimeout: 60000, // 60 segundos
  connectionPoolSize: 3,
  // Adicione para melhor desempenho em alta concorrência
  pragmas: {
    journal_mode: 'WAL',
    synchronous: 'NORMAL',
    busy_timeout: 60000
  }
});

// 6. Inicialize o Express e Socket.io
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
});

// 7. Defina o workerPath (mas não crie o worker ainda)
const workerPath = path.join(__dirname, 'worker.js');

// Verifique se o arquivo worker.js existe
if (!fs.existsSync(workerPath)) {
  console.error('Arquivo worker.js não encontrado em:', workerPath);
  process.exit(1);
}

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

// Server statistics tracking
let serverStats = {
  startTime: new Date(),
  requestCount: 0,
  lastRequests: [],
  activeConnections: 0,
  totalDataTransferred: 0
};

// Middleware to track requests
app.use((req, res, next) => {
  if (req.method === 'GET' && req.path === '/') {
    return next();
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

// Helper function to safely handle database queries
const safeDbExecute = async (sql, args = []) => {
  try {
    const result = await db.execute({ sql, args });
    return result;
  } catch (error) {
    console.error('Database error:', error);
    return { rows: [], rowsAffected: 0 };
  }
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

// Função para verificar o status de um dispositivo
async function resolveHostname(ip) {
  // Tentar resolver via DNS reverso
  try {
    const hostnames = await dns.promises.reverse(ip);
    if (hostnames.length > 0) return hostnames[0];
  } catch {}

  // Tentar resolver via NetBIOS (timeout rápido)
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
    
    // Obter IPs existentes no banco
    const existingIpsResult = await safeDbExecute('SELECT ip FROM devices');
    const existingIps = new Set(existingIpsResult.rows.map(row => row.ip));
    
    // Identificar IPs faltantes
    const missingIps = allIpsInRanges.filter(ip => !existingIps.has(ip));
    
    if (missingIps.length === 0) {
      console.log('Todos os IPs já estão no banco de dados');
      return;
    }
    
    console.log(`Inserindo ${missingIps.length} IPs faltantes...`);
    
    // Processar em lotes de 50 IPs
    const batchSize = 250;
    for (let i = 0; i < missingIps.length; i += batchSize) {
      const batch = missingIps.slice(i, i + batchSize);
      
      // Processar lote atual
      await Promise.all(batch.map(async (ip) => {
        const hostname = await resolveHostname(ip);
        await safeDbExecute(
          'INSERT INTO devices (ip, name, type, status) VALUES (?, ?, ?, ?)',
          [ip, hostname || ip, 'Desconhecido', 0]
        );
      }));
      
      console.log(`Processado lote ${i/batchSize + 1} de ${Math.ceil(missingIps.length/batchSize)}`);
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
      
      const cpuCores = os.cpus().length;
      const workersCount = Math.min(cpuCores, 4); // Reduz para no máximo 4 workers
      const ipsPerWorker = Math.ceil(devices.length / workersCount);
      
      let completedWorkers = 0;
      let updatedCount = 0;
      
      for (let i = 0; i < workersCount; i++) {
        const startIdx = i * ipsPerWorker;
        const endIdx = Math.min(startIdx + ipsPerWorker, devices.length);
        const workerIps = devices.slice(startIdx, endIdx);
        
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
          reject(err);
        });
        
        worker.on('exit', (code) => {
          completedWorkers++;
          if (completedWorkers === workersCount) {
            console.log(`Scan inicial completo! ${updatedCount} dispositivos atualizados`);
            isInitialScanInProgress = false;
            resolve();
          }
        });
      }
    }).catch(reject);
  });
}

// Initialize database tables
const initializeDatabase = async () => {
  try {
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
  }
};

// Authentication routes
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const result = await safeDbExecute('SELECT * FROM users WHERE username = ?', [username]);
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login
    await safeDbExecute('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role || 'user' },
      process.env.JWT_SECRET || 'TI',
      { expiresIn: '24h' }
    );

    res.json({ 
      id: user.id, 
      username: user.username, 
      role: user.role || 'user',
      token 
    });
  } catch (error) {
    console.error('Login error:', error);
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

// Device routes
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
    const result = await safeDbExecute('SELECT * FROM devices ORDER BY ip');
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
      lastRequests: serverStats.lastRequests.slice(0, 10)
    });
  } catch (error) {
    console.error('Error getting server status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Device monitoring process
const processDevices = async () => {
  if (!isInitialScanComplete || isInitialScanInProgress) {
    console.log('Aguardando scan inicial...');
    return;
  }
  try {
    // Não executar durante o scan inicial
    if (isInitialScanInProgress) return;

    const result = await safeDbExecute('SELECT * FROM devices');
    const devices = result.rows;

    if (!Array.isArray(devices) || devices.length === 0) {
      return;
    }

    const BATCH_SIZE = 50;  // Aumentamos o tamanho do batch para melhor desempenho
    const parallelChecks = 25; // Número de verificações simultâneas por batch
    
    for (let i = 0; i < devices.length; i += BATCH_SIZE) {
      const batch = devices.slice(i, i + BATCH_SIZE);
      
      // Executar verificações em paralelo dentro do batch
      const updates = [];
      for (let j = 0; j < batch.length; j += parallelChecks) {
        const checkBatch = batch.slice(j, j + parallelChecks);
        
        const batchUpdates = await Promise.all(
          checkBatch.map(async (device) => {
            const currentStatus = await checkDeviceStatus(device.ip, device);
            return {
              id: device.id,
              currentStatus,
              previousStatus: device.status,
              device
            };
          })
        );
        
        updates.push(...batchUpdates);
      }

      // Filter and update only changed devices
      const changes = updates.filter(u => u.currentStatus !== u.previousStatus);
      
      // Atualizar em lote
      if (changes.length > 0) {
        const updatePromises = changes.map(change => 
          safeDbExecute(
            'UPDATE devices SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [change.currentStatus, change.id]
          )
        );

        await Promise.all(updatePromises);

        // Notificações e eventos em tempo real
        for (const change of changes) {
          io.emit('deviceStatusUpdate', {
            id: change.id,
            status: change.currentStatus,
            timestamp: new Date().toISOString()
          });
        }
      }
      
      // Pequeno delay entre batches para evitar sobrecarga
      if (i + BATCH_SIZE < devices.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  } catch (error) {
    console.error('Error in device monitoring:', error);
  }
};

// Start monitoring with intelligent scheduling
const startMonitoring = () => {
  // Monitor devices every 3 minutes
  nodeSchedule.scheduleJob('*/3 * * * *', async () => {
    console.log('Starting device monitoring cycle...');
    await processDevices();
    console.log('Device monitoring cycle completed');
  });

  // Clean old notifications every day
  nodeSchedule.scheduleJob('0 0 * * *', async () => {
    try {
      await safeDbExecute(
        'DELETE FROM notifications WHERE created_at < datetime("now", "-7 days")'
      );
      console.log('Old notifications cleaned');
    } catch (error) {
      console.error('Error cleaning notifications:', error);
    }
  });
};

// Socket.io events
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  serverStats.activeConnections++;
  
  socket.on('forceDeviceCheck', async (deviceId) => {
    try {
      const result = await safeDbExecute('SELECT * FROM devices WHERE id = ?', [deviceId]);
      const device = result.rows[0];
      
      if (device) {
        const status = await checkDeviceStatus(device.ip, device);
        await safeDbExecute(
          'UPDATE devices SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [status, deviceId]
        );
        
        socket.emit('deviceStatusUpdate', { id: deviceId, status });
      }
    } catch (error) {
      console.error('Force check failed:', error);
      socket.emit('error', { message: 'Force check failed' });
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

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    serverStats.activeConnections--;
  });
});

// Serve static files and handle SPA routing
if (fs.existsSync(distPath)) {
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

let serverStarted = false; // Adicione esta variável

const startServer = async () => {
  if (serverStarted) return;
  serverStarted = true;

  try {
    if (!fs.existsSync(dbPath)) {
      fs.writeFileSync(dbPath, '');
    }

    await initializeDatabase();

    // Inicie o servidor HTTP imediatamente
    const PORT = process.env.PORT || 5173;
    const HOST = process.env.HOST || '0.0.0.0';
    httpServer.listen(PORT, HOST, () => {
      console.log(`🚀 Servidor rodando em http://${HOST}:${PORT}`);
    });

    // Rode as tarefas pesadas em background, sem bloquear o frontend
    ensureNetworkCoverage()
      .then(() => performInitialScan())
      .then(() => {
        isInitialScanComplete = true;
        startMonitoring();
      })
      .catch((error) => {
        console.error('Erro na inicialização em background:', error);
      });

  } catch (error) {
    console.error('Falha ao iniciar servidor:', error);
    process.exit(1);
  }
};

// Mantenha apenas esta chamada
if (isMainThread) {
  startServer();
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

if (isMainThread) {
  startServer();
}