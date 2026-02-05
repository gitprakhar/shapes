import express from 'express';
import cors from 'cors';
import pg from 'pg';

const { Pool } = pg;

const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://prakhar@localhost:5432/almostanything';

const pool = new Pool({ connectionString: DATABASE_URL });

const app = express();
app.use(cors());
app.use(express.json({ limit: '15mb' }));

const getShapeId = async () => {
  const todayResult = await pool.query(
    'SELECT id, date, shape_data FROM daily_shapes WHERE date = CURRENT_DATE LIMIT 1'
  );
  if (todayResult.rows.length > 0) return todayResult.rows[0];
  const recentResult = await pool.query(
    'SELECT id, date, shape_data FROM daily_shapes ORDER BY date DESC LIMIT 1'
  );
  return recentResult.rows[0] ?? null;
};

app.get('/api/shape', async (_req, res) => {
  try {
    const shape = await getShapeId();
    if (!shape) {
      res.json({ shape: null });
      return;
    }
    res.json({ shape });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load shape' });
  }
});

app.post('/api/shape', async (req, res) => {
  const { date, shape_data } = req.body || {};
  if (!date || !shape_data) {
    res.status(400).json({ error: 'Missing date or shape_data' });
    return;
  }
  try {
    const result = await pool.query(
      `INSERT INTO daily_shapes (date, shape_data)
       VALUES ($1, $2)
       ON CONFLICT (date) DO UPDATE SET shape_data = EXCLUDED.shape_data
       RETURNING id, date, shape_data`,
      [date, shape_data]
    );
    res.json({ shape: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save shape' });
  }
});

app.get('/api/drawings', async (req, res) => {
  const { shapeId, limit, before, after, order } = req.query;
  if (!shapeId) {
    res.status(400).json({ error: 'Missing shapeId' });
    return;
  }
  const parsedLimit = Math.min(Number(limit) || 200, 1000);
  const sortOrder = order === 'asc' ? 'ASC' : 'DESC';
  const params = [shapeId];
  const clauses = ['daily_shape_id = $1'];

  if (before) {
    params.push(before);
    clauses.push(`created_at < $${params.length}`);
  }
  if (after) {
    params.push(after);
    clauses.push(`created_at > $${params.length}`);
  }

  try {
    const result = await pool.query(
      `SELECT id, daily_shape_id, drawing_paths, created_at
       FROM user_drawings
       WHERE ${clauses.join(' AND ')}
       ORDER BY created_at ${sortOrder}
       LIMIT ${parsedLimit}`,
      params
    );
    res.json({ drawings: result.rows });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load drawings' });
  }
});

app.post('/api/drawings', async (req, res) => {
  const { daily_shape_id, drawing_paths } = req.body || {};
  if (!daily_shape_id || !drawing_paths) {
    res.status(400).json({ error: 'Missing daily_shape_id or drawing_paths' });
    return;
  }
  try {
    const result = await pool.query(
      `INSERT INTO user_drawings (daily_shape_id, drawing_paths)
       VALUES ($1, $2)
       RETURNING id, daily_shape_id, drawing_paths, created_at`,
      [daily_shape_id, drawing_paths]
    );
    res.json({ drawing: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save drawing' });
  }
});

app.delete('/api/drawings/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM user_drawings WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete drawing' });
  }
});

const port = process.env.PORT || 3001;
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`API server running on http://localhost:${port}`);
});
