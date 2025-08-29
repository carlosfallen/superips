import express from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import cors from 'cors';
import path from 'path';
import pkg from 'pg';
import fs from 'fs';
const { Pool } = pkg;

const app = express();

const db = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'superips_user',
  password: '359628',
  database: 'superips_db'
});

const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

// --- Rotas da API ---
app.get('/api/devices', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM devices ORDER BY ip');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/devices', async (req, res) => {
  try {
    const { ip, name, type, user, sector } = req.body;
    const result = await db.query(
      'INSERT INTO devices (ip, name, type, "user", sector) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [ip, name, type, user, sector]
    );
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/devices/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { ip, name, type, user, sector } = req.body;
    const result = await db.query(
      'UPDATE devices SET ip = $1, name = $2, type = $3, "user" = $4, sector = $5 WHERE id = $6 RETURNING *',
      [ip, name, type, user, sector, id]
    );
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/devices/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM devices WHERE id = $1', [id]);
    res.json({ message: 'Device deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Import devices (XLSX ou JSON) — recebe multipart/form-data com campo 'file'
app.post('/api/devices/import', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Arquivo não enviado' });

  try {
    let rows = [];

    const name = (req.file.originalname || '').toLowerCase();
    const isXlsx = name.endsWith('.xlsx') || name.endsWith('.xls') || req.file.mimetype.includes('spreadsheet') || req.file.mimetype.includes('excel');
    const isJson = name.endsWith('.json') || req.file.mimetype.includes('json');

    if (isXlsx) {
      const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null });
    } else if (isJson) {
      const text = req.file.buffer.toString('utf8');
      rows = JSON.parse(text);
      if (!Array.isArray(rows)) {
        // permitir objeto com key 'devices'
        if (rows.devices && Array.isArray(rows.devices)) rows = rows.devices;
        else return res.status(400).json({ error: 'JSON inválido: esperar array de objetos ou { devices: [] }' });
      }
    } else {
      return res.status(400).json({ error: 'Tipo de arquivo não suportado. Envie XLSX ou JSON.' });
    }

    // Normalize keys: toLowerCase, trim
    const normalize = (obj) => {
      const out = {};
      for (const k of Object.keys(obj)) {
        out[k.toString().trim().toLowerCase()] = obj[k];
      }
      return out;
    };

    const client = await db.connect();
    const summary = { inserted: 0, updated: 0, skipped: 0, errors: [] };

    try {
      await client.query('BEGIN');

      for (const rawRow of rows) {
        const r = normalize(rawRow);

        // mapeia campos possíveis
        const id = r.id ? Number(r.id) : null;
        const ip = r.ip ?? r.ip_address ?? r.endereco ?? r.address ?? null;
        const name = r.name ?? r.nome ?? r.device_name ?? null;
        const type = r.type ?? r.tipo ?? null;
        const user = r.user ?? r.usuario ?? r.owner ?? null;
        const sector = r.sector ?? r.setor ?? r.department ?? null;
        const status = r.status !== undefined && r.status !== null ? (Number(r.status) || 0) : null;
        const online = r.online !== undefined && r.online !== null ? (Number(r.online) || 0) : null;

        // validação básica: precisa de pelo menos ip ou name
        if (!id && !ip && !name) {
          summary.skipped++;
          continue;
        }

        try {
          if (id) {
            // upsert por id
            const q = `
              INSERT INTO devices (id, ip, name, type, "user", sector, status, online)
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
              ON CONFLICT (id) DO UPDATE
              SET ip = EXCLUDED.ip, name = EXCLUDED.name, type = EXCLUDED.type,
                  "user" = EXCLUDED."user", sector = EXCLUDED.sector,
                  status = EXCLUDED.status, online = EXCLUDED.online
              RETURNING id
            `;
            await client.query(q, [id, ip, name, type, user, sector, status, online]);
            summary.updated++;
          } else if (ip) {
            // tenta atualizar por ip; se não existir, insere
            const upd = await client.query(
              `UPDATE devices SET name=$1, type=$2, "user"=$3, sector=$4, status=$5, online=$6, updated_at=CURRENT_TIMESTAMP WHERE ip = $7 RETURNING id`,
              [name, type, user, sector, status, online, ip]
            );
            if (upd.rowCount > 0) {
              summary.updated++;
            } else {
              await client.query(
                `INSERT INTO devices (ip, name, type, "user", sector, status, online) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
                [ip, name, type, user, sector, status, online]
              );
              summary.inserted++;
            }
          } else {
            // sem ip e sem id: insere com name (fallback)
            await client.query(
              `INSERT INTO devices (ip, name, type, "user", sector, status, online) VALUES ($1,$2,$3,$4,$5,$6)`,
              [ip, name, type, user, sector, status, online]
            );
            summary.inserted++;
          }
        } catch (errRow) {
          summary.errors.push({ row: rawRow, error: String(errRow.message || errRow) });
        }
      } // for

      await client.query('COMMIT');
      res.json({ success: true, summary });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Import devices transaction error:', err);
      res.status(500).json({ error: 'Erro ao importar dispositivos', detail: String(err.message || err) });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Import devices error:', err);
    res.status(500).json({ error: 'Erro ao processar arquivo', detail: String(err.message || err) });
  }
});

app.get('/api/devices/export', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM devices')
    const devices = result.rows

    if (devices.length === 0) {
      return res.status(404).json({ error: 'Nenhum dispositivo encontrado' })
    }

    const ws = XLSX.utils.json_to_sheet(devices)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Devices')

    const filePath = './devices.xlsx'
    XLSX.writeFile(wb, filePath)

    res.download(filePath, 'devices.xlsx', (err) => {
      if (err) {
        console.error('Erro ao enviar arquivo:', err)
        return res.status(500).json({ error: 'Erro ao gerar planilha' })
      }

      fs.unlinkSync(filePath) // remove o arquivo depois do download
    })
  } catch (error) {
    console.error('Erro ao exportar devices:', error)
    res.status(500).json({ error: 'Erro ao exportar dados' })
  }
})

app.get('/api/routers', async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM devices WHERE type = 'Roteador' ORDER BY ip");
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/printers', async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM devices WHERE type = 'Impressora' ORDER BY sector, ip");
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/boxes', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        id AS device_id,
        ip,
        name,
        status,
        online AS power_status
      FROM devices
      WHERE sector = 'Caixas'
      ORDER BY name
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/boxes/:id/power-status', async (req, res) => {
  try {
    const { id } = req.params;
    const { power_status } = req.body;

    if (![0, 1].includes(power_status)) {
      return res.status(400).json({ error: 'Invalid power status. Must be 0 or 1.' });
    }

    const updateResult = await db.query(
      'UPDATE devices SET online = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND sector = $3 RETURNING id AS device_id, ip, name, status, online AS power_status',
      [power_status, id, 'Caixas']
    );
    console.log(updateResult);
    if (updateResult.rowCount === 0) {
      return res.status(404).json({ error: 'Box not found' });
    }

    res.json(updateResult.rows[0]);
  } catch (error) {
    console.error('Error updating box power status:', error);
    res.status(500).json({ error: error.message });
  }
});

// backend (server.js / index.js)
app.post('/api/printers/:id/online', async (req, res) => {
  try {
    const { id } = req.params;
    const online = Number(req.body?.online);

    if (![0, 1].includes(online)) {
      return res.status(400).json({ error: 'Invalid online status. Must be 0 or 1.' });
    }

    const updateResult = await db.query(
      `UPDATE devices 
         SET online = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 AND type = $3
       RETURNING id, ip, name, status, online`,
      [online, id, 'Impressora']
    );

    if (updateResult.rowCount === 0) {
      return res.status(404).json({ error: 'Printer not found or not of type Impressora' });
    }

    res.json(updateResult.rows[0]);
  } catch (error) {
    console.error('Error updating printer online status:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});


app.get('/api/tasks', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM tasks ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/tasks', async (req, res) => {
  try {
    const { title, description, priority, category, due_date, assigned_to } = req.body;
    const result = await db.query(
      'INSERT INTO tasks (title, description, priority, category, due_date, assigned_to) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [title, description, priority, category, due_date, assigned_to]
    );
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, priority, status, category, due_date, assigned_to } = req.body;
    const result = await db.query(
      'UPDATE tasks SET title = $1, description = $2, priority = $3, status = $4, category = $5, due_date = $6, assigned_to = $7 WHERE id = $8 RETURNING *',
      [title, description, priority, status, category, due_date, assigned_to, id]
    );
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM tasks WHERE id = $1', [id]);
    res.json({ message: 'Task deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Servir front-end otimizado ---
const __dirname = path.resolve();
const distPath = path.join(__dirname, 'dist');

app.use(express.static(distPath));

// Qualquer rota que não seja API cai aqui
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

const PORT = 5173;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT} e servindo front-end da pasta dist`);
});