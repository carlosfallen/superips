import express from 'express';
import cors from 'cors';
import pkg from 'pg';
const { Pool } = pkg;

const app = express();

const db = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'superips_user',
  password: '359628',
  database: 'superips_db'
});

app.use(cors());
app.use(express.json());

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
    const result = await db.query("SELECT * FROM devices WHERE sector = 'Caixas' ORDER BY name");
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
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

const PORT = 5173;
app.listen(PORT, () => {
  console.log(`API rodando na porta ${PORT}`);
});