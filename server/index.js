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
import { exec } from 'child_process';
import { promisify } from 'util';
import dns from 'dns';

const execAsync = promisify(exec);
const dnsReverse = promisify(dns.reverse);

//  __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize environment variables
dotenv.config();

const db = createClient({
  url: `file:${path.resolve(process.cwd(), 'data/local.db')}`,
});

console.log('Caminho do banco de dados:', path.resolve(process.cwd(), 'data/local.db'));

// Configuração das faixas de rede
const NETWORK_RANGES = [
  { range: '10.0.11.0/24', start: 1, end: 254, type: 'principal' },
  { range: '10.2.11.0/24', start: 1, end: 254, type: 'cameras' },
  { range: '10.4.11.0/24', start: 1, end: 254, type: 'coletores' }
];

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
  lastRequests: [],
  networkDiscoveryStatus: {
    isRunning: false,
    lastRun: null,
    foundDevices: 0,
    progress: 0
  }
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
  this.lastRequests.unshift({
    time: new Date(),
    method: req.method,
    path: req.path,
    ip: req.ip || req.connection.remoteAddress
  });
  if (this.lastRequests.length > 10) {
    this.lastRequests = this.lastRequests.slice(0, 10);
  }
};

// Função para detectar o tipo de dispositivo baseado em portas abertas
const detectDeviceType = async (ip, openPorts) => {
  // Portas características de diferentes tipos de dispositivos
  const deviceSignatures = {
    'Impressora': [9100, 631, 515, 161],
    'Roteador': [80, 443, 22, 23, 161, 8080],
    'Servidor': [80, 443, 22, 21, 3389, 5432, 3306],
    'Computador': [3389, 22, 135, 445, 5357],
    'Switch': [23, 80, 161, 443],
    'Camera IP': [80, 554, 8080],
    'Impressora Fiscal': [9100, 10001, 10002],
    'PDV': [80, 443, 3389, 5432]
  };

  let bestMatch = { type: 'Dispositivo', score: 0 };

  for (const [deviceType, ports] of Object.entries(deviceSignatures)) {
    const matches = ports.filter(port => openPorts.includes(port)).length;
    const score = matches / ports.length;

    if (score > bestMatch.score) {
      bestMatch = { type: deviceType, score };
    }
  }

  // Regras específicas para PDVs e Impressoras Fiscais baseadas no IP
  const lastOctet = parseInt(ip.split('.').pop());
  if (lastOctet >= 101 && lastOctet <= 150) {
    return 'PDV';
  }
  if (lastOctet >= 201 && lastOctet <= 220) {
    return 'Impressora Fiscal';
  }

  return bestMatch.type;
};

// Função para detectar setor baseado no IP
const detectSector = (ip) => {
  const lastOctet = parseInt(ip.split('.').pop());
  const thirdOctet = parseInt(ip.split('.')[2]);

  // Mapeamento por faixa de IP
  if (ip.startsWith('192.168.1.')) {
    if (lastOctet >= 1 && lastOctet <= 50) return 'Administração';
    if (lastOctet >= 51 && lastOctet <= 100) return 'Vendas';
    if (lastOctet >= 101 && lastOctet <= 150) return 'Caixas';
    if (lastOctet >= 151 && lastOctet <= 200) return 'Estoque';
    if (lastOctet >= 201 && lastOctet <= 254) return 'TI';
  }
  
  if (ip.startsWith('192.168.0.')) {
    return 'Rede Convidados';
  }
  
  if (ip.startsWith('10.0.0.')) {
    return 'VLAN Corporativa';
  }

  return 'Não identificado';
};

// Função para obter informações detalhadas do dispositivo
const getDeviceInfo = async (ip) => {
  try {
    let deviceInfo = {
      ip,
      name: ip,
      type: 'Dispositivo',
      user: 'Não identificado',
      sector: detectSector(ip),
      mac: null,
      vendor: null,
      hostname: null,
      openPorts: [],
      services: []
    };

    // Tentar resolver hostname via DNS reverso
    try {
      const hostnames = await dnsReverse(ip);
      if (hostnames && hostnames.length > 0) {
        deviceInfo.hostname = hostnames[0];
        deviceInfo.name = hostnames[0].split('.')[0]; // Pegar apenas o nome sem domínio
      }
    } catch (e) {
      // DNS reverso falhou, não é um problema
    }

    // Verificar portas comuns
    const commonPorts = [21, 22, 23, 25, 53, 80, 110, 135, 139, 143, 443, 445, 515, 631, 993, 995, 3389, 5432, 3306, 8080, 9100, 161, 554];
    const portPromises = commonPorts.map(port => checkPort(ip, port, 1000));
    const portResults = await Promise.all(portPromises);
    
    deviceInfo.openPorts = commonPorts.filter((port, index) => portResults[index]);
    
    // Detectar tipo baseado nas portas abertas
    deviceInfo.type = await detectDeviceType(ip, deviceInfo.openPorts);

    // Tentar obter informações via SNMP (se disponível)
    if (deviceInfo.openPorts.includes(161)) {
      try {
        const snmpInfo = await getSNMPInfo(ip);
        if (snmpInfo.name) deviceInfo.name = snmpInfo.name;
        if (snmpInfo.description) deviceInfo.description = snmpInfo.description;
        if (snmpInfo.vendor) deviceInfo.vendor = snmpInfo.vendor;
      } catch (e) {
        // SNMP não disponível
      }
    }

    // Tentar obter informações via NetBIOS (Windows)
    if (deviceInfo.openPorts.includes(139) || deviceInfo.openPorts.includes(445)) {
      try {
        const netbiosInfo = await getNetBIOSInfo(ip);
        if (netbiosInfo.name) deviceInfo.name = netbiosInfo.name;
        if (netbiosInfo.user) deviceInfo.user = netbiosInfo.user;
      } catch (e) {
        // NetBIOS não disponível
      }
    }

    // Obter endereço MAC via ARP
    try {
      const macInfo = await getMACAddress(ip);
      if (macInfo.mac) {
        deviceInfo.mac = macInfo.mac;
        deviceInfo.vendor = macInfo.vendor;
      }
    } catch (e) {
      // ARP não disponível
    }

    return deviceInfo;
  } catch (error) {
    console.error(`Erro ao obter informações do dispositivo ${ip}:`, error);
    return {
      ip,
      name: ip,
      type: 'Dispositivo',
      user: 'Não identificado',
      sector: detectSector(ip),
      mac: null,
      vendor: null,
      hostname: null,
      openPorts: [],
      services: []
    };
  }
};

// Função para verificar se uma porta está aberta
const checkPort = (ip, port, timeout = 1000) => {
  return new Promise((resolve) => {
    const socket = new Socket();
    
    socket.setTimeout(timeout);
    
    socket.on('connect', () => {
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
    
    socket.connect(port, ip);
  });
};

// Função para obter informações SNMP (simplificada)
const getSNMPInfo = async (ip) => {
  try {
    // Aqui você poderia usar uma biblioteca SNMP real como 'net-snmp'
    // Por enquanto, retorna um objeto vazio
    return {};
  } catch (error) {
    return {};
  }
};

// Função para obter informações NetBIOS
const getNetBIOSInfo = async (ip) => {
  try {
    const { stdout } = await execAsync(`nbtstat -A ${ip}`, { timeout: 5000 });
    const lines = stdout.split('\n');
    
    let name = null;
    let user = null;
    
    for (const line of lines) {
      if (line.includes('<00>') && line.includes('UNIQUE')) {
        const match = line.match(/(\S+)\s+<00>/);
        if (match) {
          name = match[1];
          break;
        }
      }
    }
    
    return { name, user };
  } catch (error) {
    return { name: null, user: null };
  }
};

// Função para obter endereço MAC via ARP
const getMACAddress = async (ip) => {
  try {
    const { stdout } = await execAsync(`arp -a ${ip}`, { timeout: 3000 });
    const match = stdout.match(/([0-9a-f]{2}[:-]){5}[0-9a-f]{2}/i);
    
    if (match) {
      const mac = match[0];
      // Aqui você poderia consultar uma API para obter o vendor baseado no MAC
      return { mac, vendor: null };
    }
    
    return { mac: null, vendor: null };
  } catch (error) {
    return { mac: null, vendor: null };
  }
};

// Função principal de descoberta de rede
const discoverNetwork = async () => {
  if (serverStats.networkDiscoveryStatus.isRunning) {
    console.log('⚠️ Descoberta de rede já está em execução');
    return;
  }

  console.log('🔍 Iniciando descoberta automática de rede...');
  serverStats.networkDiscoveryStatus.isRunning = true;
  serverStats.networkDiscoveryStatus.foundDevices = 0;
  serverStats.networkDiscoveryStatus.progress = 0;

  try {
    let totalIPs = 0;
    let processedIPs = 0;

    // Calcular total de IPs a serem verificados
    for (const network of NETWORK_RANGES) {
      totalIPs += (network.end - network.start + 1);
    }

    for (const network of NETWORK_RANGES) {
      const baseIP = network.range.split('/')[0];
      const networkBase = baseIP.substring(0, baseIP.lastIndexOf('.'));
      
      console.log(`🔍 Verificando rede ${network.range}...`);
      
      // Processar em lotes para não sobrecarregar a rede
      const BATCH_SIZE = 20;
      for (let i = network.start; i <= network.end; i += BATCH_SIZE) {
        const batch = [];
        
        for (let j = i; j < Math.min(i + BATCH_SIZE, network.end + 1); j++) {
          const ip = `${networkBase}.${j}`;
          batch.push(checkAndAddDevice(ip, network.type));
        }
        
        await Promise.all(batch);
        processedIPs += batch.length;
        
        // Atualizar progresso
        serverStats.networkDiscoveryStatus.progress = Math.round((processedIPs / totalIPs) * 100);
        
        // Emitir progresso via Socket.IO
        io.emit('discoveryProgress', {
          progress: serverStats.networkDiscoveryStatus.progress,
          processed: processedIPs,
          total: totalIPs,
          found: serverStats.networkDiscoveryStatus.foundDevices
        });
        
        // Pequena pausa entre lotes
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    serverStats.networkDiscoveryStatus.lastRun = new Date();
    console.log(`✅ Descoberta de rede concluída! Encontrados ${serverStats.networkDiscoveryStatus.foundDevices} dispositivos.`);
    
    // Emitir conclusão via Socket.IO
    io.emit('discoveryComplete', {
      foundDevices: serverStats.networkDiscoveryStatus.foundDevices,
      duration: Date.now() - serverStats.networkDiscoveryStatus.lastRun
    });

  } catch (error) {
    console.error('❌ Erro durante descoberta de rede:', error);
  } finally {
    serverStats.networkDiscoveryStatus.isRunning = false;
    serverStats.networkDiscoveryStatus.progress = 100;
  }
};

// Função para verificar e adicionar dispositivo se estiver online
const checkAndAddDevice = async (ip, networkType) => {
  try {
    // Verificação rápida de conectividade
    const isOnline = await checkPort(ip, 80, 500) || 
                     await checkPort(ip, 443, 500) || 
                     await checkPort(ip, 22, 500) ||
                     await checkPort(ip, 135, 500);

    if (isOnline) {
      // Verificar se o dispositivo já existe
      const existingDevice = await safeDbExecute(
        'SELECT id FROM devices WHERE ip = ?', 
        [ip]
      );

      if (existingDevice.rows.length === 0) {
        // Obter informações detalhadas do dispositivo
        const deviceInfo = await getDeviceInfo(ip);
        
        // Determinar a tabela correta baseada no tipo de rede
        const tableName = networkType === 'vlan' ? 'vlan' : 'devices';
        
        // Inserir novo dispositivo
        await safeDbExecute(`
          INSERT INTO ${tableName} 
          (ip, name, type, user, sector, status, mac, vendor, hostname, created_at) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `, [
          deviceInfo.ip,
          deviceInfo.name,
          deviceInfo.type,
          deviceInfo.user,
          deviceInfo.sector,
          1, // status online
          deviceInfo.mac,
          deviceInfo.vendor,
          deviceInfo.hostname
        ]);

        serverStats.networkDiscoveryStatus.foundDevices++;
        console.log(`✅ Novo dispositivo encontrado: ${deviceInfo.name} (${ip}) - ${deviceInfo.type}`);
        
        // Emitir novo dispositivo via Socket.IO
        io.emit('newDeviceFound', deviceInfo);
      }
    }
  } catch (error) {
    // Erro silencioso para não poluir o log durante a descoberta
  }
};

const seedDefaultAdminUser = async () => {
  const defaultUsername = 'admin';
  const defaultPassword = 'admin123';

  try {
    const result = await db.execute({
      sql: 'SELECT * FROM users WHERE username = ?',
      args: [defaultUsername],
    });

    if (result.rows.length === 0) {
      const hashedPassword = await bcrypt.hash(defaultPassword, 10);
      await db.execute({
        sql: 'INSERT INTO users (username, password_hash) VALUES (?, ?)',
        args: [defaultUsername, hashedPassword],
      });
      console.log(`✅ Usuário padrão '${defaultUsername}' criado com sucesso`);
    } else {
      console.log(`ℹ️ Usuário '${defaultUsername}' já existe`);
    }
  } catch (error) {
    console.error('❌ Erro ao criar usuário padrão:', error);
  }
};

// Setup static files folder
app.use(express.static(path.join(__dirname, 'public')));

// Root route - serve the index.html
app.get('/', (req, res) => {
  serverStats.recordRequest(req);
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Helper function to safely handle database queries
const safeDbExecute = async (sql, args = []) => {
  try {
    const result = await db.execute({sql, args});
    return result;
  } catch (error) {
    console.error('❌ Erro no banco de dados:', error);
    console.error('SQL:', sql);
    console.error('Args:', args);
    return { rows: [], rowsAffected: 0 };
  }
};

// Função para testar conectividade com o banco
const testDatabaseConnection = async () => {
  try {
    console.log('🔍 Testando conexão com banco de dados...');
    const result = await db.execute('SELECT 1 as test');
    
    if (result.rows && result.rows.length > 0) {
      console.log('✅ Conexão com banco de dados OK');
      return true;
    } else {
      console.error('❌ Falha na conexão com banco de dados');
      return false;
    }
  } catch (error) {
    console.error('❌ Erro ao testar conexão com banco:', error);
    return false;
  }
};

// Função para obter informações do banco
const getDatabaseInfo = async () => {
  try {
    const tables = await safeDbExecute(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `);
    
    console.log('📊 Tabelas encontradas no banco:');
    for (const table of tables.rows) {
      const count = await safeDbExecute(`SELECT COUNT(*) as count FROM ${table.name}`);
      console.log(`   - ${table.name}: ${count.rows[0]?.count || 0} registros`);
    }
  } catch (error) {
    console.error('❌ Erro ao obter informações do banco:', error);
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

// Nova rota para iniciar descoberta manual
app.post('/api/network/discover', authenticateToken, async (req, res) => {
  if (serverStats.networkDiscoveryStatus.isRunning) {
    return res.status(400).json({ 
      error: 'Descoberta de rede já está em execução',
      status: serverStats.networkDiscoveryStatus 
    });
  }

  // Iniciar descoberta em background
  discoverNetwork();
  
  res.json({ 
    message: 'Descoberta de rede iniciada',
    status: serverStats.networkDiscoveryStatus 
  });
});

// Nova rota para obter status da descoberta
app.get('/api/network/discovery-status', authenticateToken, (req, res) => {
  res.json(serverStats.networkDiscoveryStatus);
});

// API route for server status (melhorada)
app.get('/api/server-status', async (req, res) => {
  try {
    serverStats.recordRequest(req);
    
    const devicesResult = await safeDbExecute('SELECT COUNT(*) as count FROM devices');
    const devicesCount = devicesResult.rows && devicesResult.rows[0] ? devicesResult.rows[0].count : 0;
    
    const onlineDevicesResult = await safeDbExecute('SELECT COUNT(*) as count FROM devices WHERE status = 1');
    const onlineDevicesCount = onlineDevicesResult.rows && onlineDevicesResult.rows[0] ? onlineDevicesResult.rows[0].count : 0;
    
    const printersResult = await safeDbExecute('SELECT COUNT(*) as count FROM devices WHERE type = "Impressora"');
    const printersCount = printersResult.rows && printersResult.rows[0] ? printersResult.rows[0].count : 0;
    
    const routersResult = await safeDbExecute('SELECT COUNT(*) as count FROM devices WHERE type = "Roteador"');
    const routersCount = routersResult.rows && routersResult.rows[0] ? routersResult.rows[0].count : 0;
    
    const boxesResult = await safeDbExecute('SELECT COUNT(*) as count FROM devices WHERE sector = "Caixas"');
    const boxesCount = boxesResult.rows && boxesResult.rows[0] ? boxesResult.rows[0].count : 0;

    const uptime = Math.floor((new Date() - serverStats.startTime) / 1000);
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = uptime % 60;
    const uptimeString = `${days}d ${hours}h ${minutes}m ${seconds}s`;
    
    const pingHistory = await getPingHistory(15);
    const lastRequests = Array.isArray(serverStats.lastRequests) ? serverStats.lastRequests : [];
    
    const statusData = {
      devicesCount,
      onlineDevicesCount,
      printersCount,
      routersCount,
      boxesCount,
      uptimeString,
      requestCount: serverStats.requestCount || 0,
      lastRequests: lastRequests,
      pingHistory: pingHistory || [],
      networkDiscovery: serverStats.networkDiscoveryStatus
    };
    
    res.json(statusData);
  } catch (error) {
    console.error('Erro ao obter status do servidor:', error);
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
      pingHistory: [],
      networkDiscovery: serverStats.networkDiscoveryStatus
    });
  }
});

// Rotas existentes (mantidas)
app.put('/api/devices/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { ip, name, type, user, sector } = req.body;

  try {
    if (!ip || !name) {
      return res.status(400).json({ error: 'IP e nome são obrigatórios' });
    }

    const checkResult = await db.execute({
      sql: 'SELECT * FROM devices WHERE id = ?',
      args: [id]
    });

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Dispositivo não encontrado' });
    }

    await db.execute({
      sql: 'UPDATE devices SET ip = ?, name = ?, type = ?, user = ?, sector = ?, updated_at = datetime("now") WHERE id = ?',
      args: [ip, name, type, user, sector, id]
    });

    const updatedResult = await db.execute({
      sql: 'SELECT * FROM devices WHERE id = ?',
      args: [id]
    });

    res.json(updatedResult.rows[0]);
  } catch (error) {
    console.error('Erro ao atualizar dispositivo:', error);
    res.status(500).json({ error: 'Erro ao atualizar dispositivo' });
  }
});

app.put('/api/vlan/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { ip, name, type, user, sector } = req.body;

  try {
    if (!ip || !name) {
      return res.status(400).json({ error: 'IP e nome são obrigatórios' });
    }

    const checkResult = await db.execute({
      sql: 'SELECT * FROM vlan WHERE id = ?',
      args: [id]
    });

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Dispositivo não encontrado' });
    }

    await db.execute({
      sql: 'UPDATE vlan SET ip = ?, name = ?, type = ?, user = ?, sector = ?, updated_at = datetime("now") WHERE id = ?',
      args: [ip, name, type, user, sector, id]
    });

    const updatedResult = await db.execute({
      sql: 'SELECT * FROM vlan WHERE id = ?',
      args: [id]
    });

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
    const result = await db.execute('SELECT * FROM vlan ORDER BY ip');
    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao buscar vlan:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

app.get('/api/devices', authenticateToken, async (req, res) => {
  try {
    const result = await db.execute('SELECT * FROM devices ORDER BY ip');
    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao buscar devices:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

app.get('/api/devices/export', authenticateToken, async (req, res) => {
  try {
    const result = await db.execute('SELECT * FROM devices');
    const devices = result.rows;

    if (devices.length === 0) {
      return res.status(404).json({ error: 'Nenhum dispositivo encontrado' });
    }

    const ws = XLSX.utils.json_to_sheet(devices);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Devices');

    const filePath = './devices.xlsx';
    XLSX.writeFile(wb, filePath);

    res.download(filePath, 'devices.xlsx', (err) => {
      if (err) {
        console.error('Erro ao enviar arquivo:', err);
        return res.status(500).json({ error: 'Erro ao gerar planilha' });
      }
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
      ORDER BY ip
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao buscar dados:', error);
    res.status(500).json({ error: 'Erro ao buscar dados' });
  }
});

app.get('/api/printers', authenticateToken, async (req, res) => {
  try {
    const result = await db.execute(`
      SELECT id, ip, sector, status, model, npat, li, lf, online
      FROM devices
      WHERE type = 'Impressora'
      ORDER BY ip
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao buscar impressoras:', error);
    res.status(500).json({ error: 'Erro ao buscar impressoras' });
  }
});

// Continuação do código a partir de app.post('/api/printers/:id/online'...

app.post('/api/printers/:id/online', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { online } = req.body;

  try {
    await db.execute({
      sql: 'UPDATE devices SET online = ?, updated_at = datetime("now") WHERE id = ? AND type = "Impressora"',
      args: [online ? 1 : 0, id]
    });

    res.json({ success: true, message: 'Status atualizado com sucesso' });
  } catch (error) {
    console.error('Erro ao atualizar status da impressora:', error);
    res.status(500).json({ error: 'Erro ao atualizar status' });
  }
});

app.post('/api/devices', authenticateToken, async (req, res) => {
  const { ip, name, type, user, sector } = req.body;

  try {
    if (!ip || !name) {
      return res.status(400).json({ error: 'IP e nome são obrigatórios' });
    }

    const checkResult = await db.execute({
      sql: 'SELECT * FROM devices WHERE ip = ?',
      args: [ip]
    });

    if (checkResult.rows.length > 0) {
      return res.status(409).json({ error: 'Dispositivo com este IP já existe' });
    }

    const result = await db.execute({
      sql: 'INSERT INTO devices (ip, name, type, user, sector, status, created_at) VALUES (?, ?, ?, ?, ?, 0, datetime("now"))',
      args: [ip, name, type, user, sector]
    });

    const newDevice = await db.execute({
      sql: 'SELECT * FROM devices WHERE id = ?',
      args: [result.lastInsertRowid]
    });

    res.status(201).json(newDevice.rows[0]);
  } catch (error) {
    console.error('Erro ao criar dispositivo:', error);
    res.status(500).json({ error: 'Erro ao criar dispositivo' });
  }
});

app.post('/api/vlan', authenticateToken, async (req, res) => {
  const { ip, name, type, user, sector } = req.body;

  try {
    if (!ip || !name) {
      return res.status(400).json({ error: 'IP e nome são obrigatórios' });
    }

    const checkResult = await db.execute({
      sql: 'SELECT * FROM vlan WHERE ip = ?',
      args: [ip]
    });

    if (checkResult.rows.length > 0) {
      return res.status(409).json({ error: 'Dispositivo com este IP já existe na VLAN' });
    }

    const result = await db.execute({
      sql: 'INSERT INTO vlan (ip, name, type, user, sector, status, created_at) VALUES (?, ?, ?, ?, ?, 0, datetime("now"))',
      args: [ip, name, type, user, sector]
    });

    const newDevice = await db.execute({
      sql: 'SELECT * FROM vlan WHERE id = ?',
      args: [result.lastInsertRowid]
    });

    res.status(201).json(newDevice.rows[0]);
  } catch (error) {
    console.error('Erro ao criar dispositivo VLAN:', error);
    res.status(500).json({ error: 'Erro ao criar dispositivo' });
  }
});

app.delete('/api/devices/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await db.execute({
      sql: 'DELETE FROM devices WHERE id = ?',
      args: [id]
    });

    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: 'Dispositivo não encontrado' });
    }

    res.json({ success: true, message: 'Dispositivo removido com sucesso' });
  } catch (error) {
    console.error('Erro ao remover dispositivo:', error);
    res.status(500).json({ error: 'Erro ao remover dispositivo' });
  }
});

app.delete('/api/vlan/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await db.execute({
      sql: 'DELETE FROM vlan WHERE id = ?',
      args: [id]
    });

    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: 'Dispositivo não encontrado' });
    }

    res.json({ success: true, message: 'Dispositivo VLAN removido com sucesso' });
  } catch (error) {
    console.error('Erro ao remover dispositivo VLAN:', error);
    res.status(500).json({ error: 'Erro ao remover dispositivo' });
  }
});

// Função para inicializar tabelas com IPs das faixas de rede
const initializeNetworkTables = async () => {
  console.log('🔧 Inicializando tabelas com faixas de rede...');
  
  try {
    for (const network of NETWORK_RANGES) {
      const baseIP = network.range.split('/')[0];
      const networkBase = baseIP.substring(0, baseIP.lastIndexOf('.'));
      const tableName = network.type === 'vlan' ? 'vlan' : 'devices';
      
      console.log(`📊 Preenchendo tabela ${tableName} para rede ${network.range}...`);
      
      for (let i = network.start; i <= network.end; i++) {
        const ip = `${networkBase}.${i}`;
        
        // Verificar se o IP já existe
        const existingResult = await safeDbExecute(
          `SELECT id FROM ${tableName} WHERE ip = ?`, 
          [ip]
        );
        
        if (existingResult.rows.length === 0) {
          // Determinar setor baseado no IP
          const sector = detectSector(ip);
          
          // Inserir IP na tabela
          await safeDbExecute(`
            INSERT INTO ${tableName} 
            (ip, name, type, user, sector, status, created_at) 
            VALUES (?, ?, ?, ?, ?, 0, datetime('now'))
          `, [
            ip,
            `Device-${ip.split('.').pop()}`, // Nome padrão baseado no último octeto
            'Dispositivo',
            'Não identificado',
            sector
          ]);
        }
      }
      
      console.log(`✅ Tabela ${tableName} preenchida para rede ${network.range}`);
    }
    
    console.log('✅ Inicialização das tabelas concluída!');
  } catch (error) {
    console.error('❌ Erro ao inicializar tabelas:', error);
  }
};

// Função melhorada para descoberta automática com mais informações
const enhancedDiscoverNetwork = async () => {
  if (serverStats.networkDiscoveryStatus.isRunning) {
    console.log('⚠️ Descoberta de rede já está em execução');
    return;
  }

  console.log('🔍 Iniciando descoberta avançada de rede...');
  serverStats.networkDiscoveryStatus.isRunning = true;
  serverStats.networkDiscoveryStatus.foundDevices = 0;
  serverStats.networkDiscoveryStatus.progress = 0;

  try {
    // Buscar todos os IPs das tabelas
    const devicesResult = await safeDbExecute('SELECT * FROM devices');
    const vlanResult = await safeDbExecute('SELECT * FROM vlan');
    
    const allDevices = [
      ...devicesResult.rows.map(d => ({ ...d, table: 'devices' })),
      ...vlanResult.rows.map(d => ({ ...d, table: 'vlan' }))
    ];

    const totalDevices = allDevices.length;
    let processedDevices = 0;

    console.log(`📊 Verificando ${totalDevices} dispositivos...`);

    // Processar em lotes
    const BATCH_SIZE = 15;
    for (let i = 0; i < allDevices.length; i += BATCH_SIZE) {
      const batch = allDevices.slice(i, i + BATCH_SIZE);
      
      const batchPromises = batch.map(async (device) => {
        try {
          const deviceInfo = await getEnhancedDeviceInfo(device.ip);
          
          if (deviceInfo.isOnline) {
            // Atualizar informações no banco
            await safeDbExecute(`
              UPDATE ${device.table} 
              SET 
                name = COALESCE(NULLIF(?, ''), name),
                type = COALESCE(NULLIF(?, ''), type),
                user = COALESCE(NULLIF(?, ''), user),
                mac = COALESCE(NULLIF(?, ''), mac),
                vendor = COALESCE(NULLIF(?, ''), vendor),
                hostname = COALESCE(NULLIF(?, ''), hostname),
                status = 1,
                last_seen = datetime('now'),
                updated_at = datetime('now')
              WHERE id = ?
            `, [
              deviceInfo.name !== device.ip ? deviceInfo.name : null,
              deviceInfo.type,
              deviceInfo.user,
              deviceInfo.mac,
              deviceInfo.vendor,
              deviceInfo.hostname,
              device.id
            ]);

            serverStats.networkDiscoveryStatus.foundDevices++;
            
            // Emitir dispositivo atualizado
            io.emit('deviceUpdated', {
              id: device.id,
              table: device.table,
              ...deviceInfo
            });
          } else {
            // Marcar como offline
            await safeDbExecute(`
              UPDATE ${device.table} 
              SET status = 0, updated_at = datetime('now') 
              WHERE id = ?
            `, [device.id]);
          }
        } catch (error) {
          console.error(`Erro ao processar dispositivo ${device.ip}:`, error);
        }
      });

      await Promise.all(batchPromises);
      processedDevices += batch.length;

      // Atualizar progresso
      serverStats.networkDiscoveryStatus.progress = Math.round((processedDevices / totalDevices) * 100);
      
      // Emitir progresso
      io.emit('discoveryProgress', {
        progress: serverStats.networkDiscoveryStatus.progress,
        processed: processedDevices,
        total: totalDevices,
        found: serverStats.networkDiscoveryStatus.foundDevices
      });

      // Pausa entre lotes
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    serverStats.networkDiscoveryStatus.lastRun = new Date();
    console.log(`✅ Descoberta avançada concluída! ${serverStats.networkDiscoveryStatus.foundDevices} dispositivos online.`);
    
    io.emit('discoveryComplete', {
      foundDevices: serverStats.networkDiscoveryStatus.foundDevices,
      totalProcessed: processedDevices
    });

  } catch (error) {
    console.error('❌ Erro durante descoberta avançada:', error);
  } finally {
    serverStats.networkDiscoveryStatus.isRunning = false;
    serverStats.networkDiscoveryStatus.progress = 100;
  }
};

// Função aprimorada para obter informações do dispositivo
const getEnhancedDeviceInfo = async (ip) => {
  try {
    let deviceInfo = {
      ip,
      name: ip,
      type: 'Dispositivo',
      user: 'Não identificado',
      sector: detectSector(ip),
      mac: null,
      vendor: null,
      hostname: null,
      isOnline: false,
      openPorts: [],
      services: [],
      osInfo: null
    };

    // Verificação de conectividade mais abrangente
    const connectivityChecks = [
      checkPort(ip, 80, 1500),    // HTTP
      checkPort(ip, 443, 1500),   // HTTPS
      checkPort(ip, 22, 1500),    // SSH
      checkPort(ip, 3389, 1500),  // RDP
      checkPort(ip, 135, 1500),   // RPC
      checkPort(ip, 445, 1500),   // SMB
      checkPort(ip, 161, 1500),   // SNMP
      checkPort(ip, 23, 1500)     // Telnet
    ];

    const connectivityResults = await Promise.all(connectivityChecks);
    const isOnline = connectivityResults.some(result => result);
    
    if (!isOnline) {
      return deviceInfo;
    }

    deviceInfo.isOnline = true;

    // Detectar portas abertas
    const commonPorts = [21, 22, 23, 25, 53, 80, 110, 135, 139, 143, 443, 445, 515, 631, 993, 995, 3389, 5432, 3306, 8080, 9100, 161, 554, 10001, 10002];
    const portPromises = commonPorts.map(port => checkPort(ip, port, 1000));
    const portResults = await Promise.all(portPromises);
    
    deviceInfo.openPorts = commonPorts.filter((port, index) => portResults[index]);

    // Tentar obter hostname via DNS reverso
    try {
      const hostnames = await dnsReverse(ip);
      if (hostnames && hostnames.length > 0) {
        deviceInfo.hostname = hostnames[0];
        const hostname = hostnames[0].split('.')[0].toUpperCase();
        if (hostname !== ip) {
          deviceInfo.name = hostname;
        }
      }
    } catch (e) {
      // DNS reverso falhou
    }

    // Tentar obter informações via NetBIOS (Windows)
    if (deviceInfo.openPorts.includes(139) || deviceInfo.openPorts.includes(445)) {
      try {
        const netbiosInfo = await getAdvancedNetBIOSInfo(ip);
        if (netbiosInfo.computerName) {
          deviceInfo.name = netbiosInfo.computerName;
        }
        if (netbiosInfo.userName) {
          deviceInfo.user = netbiosInfo.userName;
        }
        if (netbiosInfo.workgroup) {
          deviceInfo.workgroup = netbiosInfo.workgroup;
        }
      } catch (e) {
        // NetBIOS não disponível
      }
    }

    // Obter MAC address via ARP
    try {
      const macInfo = await getAdvancedMACInfo(ip);
      if (macInfo.mac) {
        deviceInfo.mac = macInfo.mac;
        deviceInfo.vendor = macInfo.vendor;
      }
    } catch (e) {
      // ARP não disponível
    }

    // Detectar tipo de dispositivo com base nas portas e informações coletadas
    deviceInfo.type = await detectAdvancedDeviceType(ip, deviceInfo);

    // Tentar obter informações do sistema via SNMP
    if (deviceInfo.openPorts.includes(161)) {
      try {
        const snmpInfo = await getAdvancedSNMPInfo(ip);
        if (snmpInfo.systemName) deviceInfo.name = snmpInfo.systemName;
        if (snmpInfo.systemDescription) deviceInfo.description = snmpInfo.systemDescription;
        if (snmpInfo.systemContact) deviceInfo.contact = snmpInfo.systemContact;
      } catch (e) {
        // SNMP não disponível
      }
    }

    return deviceInfo;
  } catch (error) {
    console.error(`Erro ao obter informações avançadas do dispositivo ${ip}:`, error);
    return {
      ip,
      name: ip,
      type: 'Dispositivo',
      user: 'Não identificado',
      sector: detectSector(ip),
      isOnline: false
    };
  }
};

// Função aprimorada para detectar tipo de dispositivo
const detectAdvancedDeviceType = async (ip, deviceInfo) => {
  const { openPorts, hostname, name, mac } = deviceInfo;
  
  // Assinaturas mais específicas
  const deviceSignatures = {
    'Impressora': {
      ports: [9100, 631, 515, 161],
      hostnames: ['hp-', 'canon-', 'epson-', 'brother-', 'xerox-', 'lexmark-'],
      vendors: ['Hewlett Packard', 'Canon', 'Epson', 'Brother', 'Xerox']
    },
    'Impressora Fiscal': {
      ports: [9100, 10001, 10002],
      ipRanges: [[201, 220]]
    },
    'PDV': {
      ports: [80, 443, 3389, 5432],
      ipRanges: [[101, 150]]
    },
    'Roteador': {
      ports: [80, 443, 22, 23, 161, 8080],
      hostnames: ['router', 'gateway', 'gw-', 'rt-'],
      vendors: ['Tp-Link', 'D-Link', 'Cisco', 'Mikrotik']
    },
    'Switch': {
      ports: [23, 80, 161, 443],
      hostnames: ['switch', 'sw-'],
      vendors: ['Cisco', 'HP Enterprise', 'D-Link']
    },
    'Servidor': {
      ports: [80, 443, 22, 21, 3389, 5432, 3306, 1433],
      hostnames: ['server', 'srv-', 'web-', 'db-', 'mail-']
    },
    'Computador': {
      ports: [3389, 22, 135, 445, 5357],
      hostnames: ['pc-', 'desktop-', 'notebook-', 'laptop-']
    },
    'Camera IP': {
      ports: [80, 554, 8080, 8000],
      hostnames: ['cam-', 'camera-', 'ipcam-']
    }
  };

  let bestMatch = { type: 'Dispositivo', score: 0 };

  for (const [deviceType, signature] of Object.entries(deviceSignatures)) {
    let score = 0;

    // Verificar portas
    if (signature.ports) {
      const portMatches = signature.ports.filter(port => openPorts.includes(port)).length;
      score += (portMatches / signature.ports.length) * 0.4;
    }

    // Verificar hostname
    if (signature.hostnames && (hostname || name)) {
      const deviceName = (hostname || name).toLowerCase();
      const hostnameMatch = signature.hostnames.some(pattern => deviceName.includes(pattern));
      if (hostnameMatch) score += 0.3;
    }

    // Verificar faixa de IP
    if (signature.ipRanges) {
      const lastOctet = parseInt(ip.split('.').pop());
      const inRange = signature.ipRanges.some(range => lastOctet >= range[0] && lastOctet <= range[1]);
      if (inRange) score += 0.2;
    }

    // Verificar vendor do MAC
    if (signature.vendors && deviceInfo.vendor) {
      const vendorMatch = signature.vendors.some(vendor => 
        deviceInfo.vendor.toLowerCase().includes(vendor.toLowerCase())
      );
      if (vendorMatch) score += 0.1;
    }

    if (score > bestMatch.score) {
      bestMatch = { type: deviceType, score };
    }
  }

  return bestMatch.score > 0.3 ? bestMatch.type : 'Dispositivo';
};

// Função aprimorada para NetBIOS
const getAdvancedNetBIOSInfo = async (ip) => {
  try {
    const { stdout } = await execAsync(`nbtstat -A ${ip}`, { timeout: 8000 });
    const lines = stdout.split('\n');
    
    let computerName = null;
    let userName = null;
    let workgroup = null;
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Nome do computador
      if (trimmed.includes('<00>') && trimmed.includes('UNIQUE') && !computerName) {
        const match = trimmed.match(/(\S+)\s+<00>/);
        if (match && !match[1].includes('__MSBROWSE__')) {
          computerName = match[1];
        }
      }
      
      // Nome do usuário
      if (trimmed.includes('<03>') && trimmed.includes('UNIQUE')) {
        const match = trimmed.match(/(\S+)\s+<03>/);
        if (match) {
          userName = match[1];
        }
      }
      
      // Grupo de trabalho
      if (trimmed.includes('<00>') && trimmed.includes('GROUP')) {
        const match = trimmed.match(/(\S+)\s+<00>/);
        if (match) {
          workgroup = match[1];
        }
      }
    }
    
    return { computerName, userName, workgroup };
  } catch (error) {
    return { computerName: null, userName: null, workgroup: null };
  }
};

// Função aprimorada para obter MAC e vendor
const getAdvancedMACInfo = async (ip) => {
  try {
    const { stdout } = await execAsync(`arp -a ${ip}`, { timeout: 5000 });
    const match = stdout.match(/([0-9a-f]{2}[:-]){5}[0-9a-f]{2}/i);
    
    if (match) {
      const mac = match[0].toUpperCase();
      const vendor = await getMACVendor(mac);
      return { mac, vendor };
    }
    
    return { mac: null, vendor: null };
  } catch (error) {
    return { mac: null, vendor: null };
  }
};

// Função para obter vendor do MAC (usando OUI database local simplificado)
const getMACVendor = async (mac) => {
  const oui = mac.substring(0, 8).replace(/[:-]/g, '').toUpperCase();
  
  // Database simplificado de alguns vendors comuns
  const vendors = {
    '00:50:56': 'VMware',
    '08:00:27': 'Oracle VirtualBox',
    '00:0C:29': 'VMware',
    '00:15:5D': 'Microsoft Hyper-V',
    '00:1B:21': 'Intel',
    '00:23:24': 'Apple',
    '00:26:BB': 'Apple',
    '28:CF:E9': 'Apple',
    'AC:DE:48': 'Apple',
    '00:1A:A0': 'Dell',
    '00:14:22': 'Dell',
    '18:03:73': 'Dell',
    '2C:76:8A': 'HP',
    '70:5A:0F': 'HP',
    '00:1F:29': 'HP',
    '00:50:DA': 'D-Link',
    '00:17:9A': 'D-Link',
    '00:05:5D': 'D-Link',
    '04:DA:D2': 'Tp-Link',
    '50:C7:BF': 'Tp-Link',
    '00:27:19': 'Tp-Link'
  };
  
  for (const [ouiPattern, vendor] of Object.entries(vendors)) {
    if (mac.startsWith(ouiPattern)) {
      return vendor;
    }
  }
  
  return null;
};

// Função aprimorada para SNMP
const getAdvancedSNMPInfo = async (ip) => {
  try {
    // Esta é uma implementação simplificada
    // Em produção, você usaria uma biblioteca SNMP real
    return {
      systemName: null,
      systemDescription: null,
      systemContact: null
    };
  } catch (error) {
    return {};
  }
};

// Agendar descoberta automática a cada 30 minutos
nodeSchedule.scheduleJob('*/30 * * * *', () => {
  console.log('⏰ Executando descoberta automática programada...');
  enhancedDiscoverNetwork();
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`🔌 Cliente conectado: ${socket.id}`);
  
  socket.on('startDiscovery', () => {
    enhancedDiscoverNetwork();
  });
  
  socket.on('disconnect', () => {
    console.log(`🔌 Cliente desconectado: ${socket.id}`);
  });
});

// Nova rota para descoberta aprimorada
app.post('/api/network/enhanced-discover', authenticateToken, async (req, res) => {
  if (serverStats.networkDiscoveryStatus.isRunning) {
    return res.status(400).json({ 
      error: 'Descoberta de rede já está em execução',
      status: serverStats.networkDiscoveryStatus 
    });
  }

  enhancedDiscoverNetwork();
  
  res.json({ 
    message: 'Descoberta avançada de rede iniciada',
    status: serverStats.networkDiscoveryStatus 
  });
});

// Função para inicializar todas as tabelas do banco de dados
const initializeDatabaseTables = async () => {
  console.log('🗄️ Inicializando tabelas do banco de dados...');
  
  try {
    // Tabela de usuários
    await safeDbExecute(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Tabela users criada/verificada');

    // Tabela de dispositivos
    await safeDbExecute(`
      CREATE TABLE IF NOT EXISTS devices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ip TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        type TEXT DEFAULT 'Dispositivo',
        user TEXT DEFAULT 'Não identificado',
        sector TEXT DEFAULT 'Não identificado',
        status INTEGER DEFAULT 0,
        mac TEXT,
        vendor TEXT,
        hostname TEXT,
        model TEXT,
        npat TEXT,
        li TEXT,
        lf TEXT,
        online INTEGER DEFAULT 0,
        login_username TEXT,
        login_password TEXT,
        wifi_ssid TEXT,
        wifi_password TEXT,
        hidden INTEGER DEFAULT 0,
        description TEXT,
        contact TEXT,
        workgroup TEXT,
        last_seen DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Tabela devices criada/verificada');

    // Tabela de VLAN
    await safeDbExecute(`
      CREATE TABLE IF NOT EXISTS vlan (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ip TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        type TEXT DEFAULT 'Dispositivo',
        user TEXT DEFAULT 'Não identificado',
        sector TEXT DEFAULT 'Não identificado',
        status INTEGER DEFAULT 0,
        mac TEXT,
        vendor TEXT,
        hostname TEXT,
        model TEXT,
        description TEXT,
        contact TEXT,
        workgroup TEXT,
        last_seen DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Tabela vlan criada/verificada');

    // Tabela de histórico de ping
    await safeDbExecute(`
      CREATE TABLE IF NOT EXISTS ping_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id INTEGER,
        ip TEXT NOT NULL,
        status INTEGER NOT NULL,
        response_time REAL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (device_id) REFERENCES devices (id)
      )
    `);
    console.log('✅ Tabela ping_history criada/verificada');

    // Tabela de logs do sistema
    await safeDbExecute(`
      CREATE TABLE IF NOT EXISTS system_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        details TEXT,
        ip TEXT,
        user_id INTEGER,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )
    `);
    console.log('✅ Tabela system_logs criada/verificada');

    // Tabela de configurações
    await safeDbExecute(`
      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        value TEXT,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Tabela settings criada/verificada');

    // Tabela de descoberta de rede (histórico)
    await safeDbExecute(`
      CREATE TABLE IF NOT EXISTS network_discovery_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        devices_found INTEGER DEFAULT 0,
        total_scanned INTEGER DEFAULT 0,
        duration_seconds INTEGER DEFAULT 0,
        started_at DATETIME,
        completed_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Tabela network_discovery_history criada/verificada');

    // Criar índices para melhorar performance
    await safeDbExecute(`CREATE INDEX IF NOT EXISTS idx_devices_ip ON devices(ip)`);
    await safeDbExecute(`CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status)`);
    await safeDbExecute(`CREATE INDEX IF NOT EXISTS idx_devices_type ON devices(type)`);
    await safeDbExecute(`CREATE INDEX IF NOT EXISTS idx_vlan_ip ON vlan(ip)`);
    await safeDbExecute(`CREATE INDEX IF NOT EXISTS idx_vlan_status ON vlan(status)`);
    await safeDbExecute(`CREATE INDEX IF NOT EXISTS idx_ping_history_device_id ON ping_history(device_id)`);
    await safeDbExecute(`CREATE INDEX IF NOT EXISTS idx_ping_history_timestamp ON ping_history(timestamp)`);
    console.log('✅ Índices criados/verificados');

    // Inserir configurações padrão se não existirem
    const defaultSettings = [
      {
        key: 'discovery_interval',
        value: '30',
        description: 'Intervalo em minutos para descoberta automática de rede'
      },
      {
        key: 'ping_timeout',
        value: '1500',
        description: 'Timeout em ms para verificação de conectividade'
      },
      {
        key: 'batch_size',
        value: '20',
        description: 'Tamanho do lote para processamento de descoberta'
      },
      {
        key: 'auto_discovery_enabled',
        value: 'true',
        description: 'Habilitar descoberta automática de rede'
      }
    ];

    for (const setting of defaultSettings) {
      const existingSetting = await safeDbExecute(
        'SELECT id FROM settings WHERE key = ?',
        [setting.key]
      );

      if (existingSetting.rows.length === 0) {
        await safeDbExecute(
          'INSERT INTO settings (key, value, description) VALUES (?, ?, ?)',
          [setting.key, setting.value, setting.description]
        );
        console.log(`✅ Configuração padrão criada: ${setting.key}`);
      }
    }

    console.log('🎉 Todas as tabelas foram inicializadas com sucesso!');
    
    // Verificar se há dados nas tabelas principais
    const devicesCount = await safeDbExecute('SELECT COUNT(*) as count FROM devices');
    const vlanCount = await safeDbExecute('SELECT COUNT(*) as count FROM vlan');
    const usersCount = await safeDbExecute('SELECT COUNT(*) as count FROM users');

    console.log(`📊 Status das tabelas:`);
    console.log(`   - Dispositivos: ${devicesCount.rows[0]?.count || 0}`);
    console.log(`   - VLAN: ${vlanCount.rows[0]?.count || 0}`);
    console.log(`   - Usuários: ${usersCount.rows[0]?.count || 0}`);

  } catch (error) {
    console.error('❌ Erro ao inicializar tabelas do banco de dados:', error);
    throw error;
  }
};

// Função para verificar e criar diretório de dados se não existir
const ensureDataDirectory = () => {
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log('📁 Diretório data/ criado');
  }
};

// Função de inicialização do servidor (VERSÃO ATUALIZADA)
const initializeServer = async () => {
  try {
    console.log('🚀 Inicializando servidor...');
    
    // 1. Garantir que o diretório de dados existe
    ensureDataDirectory();
    
    // 3. Inicializar todas as tabelas do banco de dados
    await initializeDatabaseTables();
    
    // 4. Criar usuário padrão
    await seedDefaultAdminUser();
    
    // 5. Inicializar tabelas com IPs das faixas de rede
    await initializeNetworkTables();
    
    // 6. Executar descoberta inicial após 10 segundos
    setTimeout(() => {
      console.log('🔍 Iniciando descoberta inicial da rede...');
      enhancedDiscoverNetwork();
    }, 10000);
    
    console.log('✅ Servidor inicializado com sucesso!');
    console.log('🌐 Acesse http://10.0.0.146:3002 para usar o sistema');
    
  } catch (error) {
    console.error('❌ Erro na inicialização do servidor:', error);
    process.exit(1); // Encerra o processo se houver erro crítico
  }
};

// Initialize server
const PORT = process.env.PORT || 3002;
httpServer.listen(PORT, async () => {
  console.log(`🌐 Servidor rodando na porta ${PORT}`);
  await initializeServer();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Recebido SIGTERM, encerrando servidor...');
  httpServer.close(() => {
    console.log('✅ Servidor encerrado graciosamente');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 Recebido SIGINT, encerrando servidor...');
  httpServer.close(() => {
    console.log('✅ Servidor encerrado graciosamente');
    process.exit(0);
  });
});