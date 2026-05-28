// src/db.js
// ─────────────────────────────────────────────────────────────
// Database layer. Uses `pg` with a connection pool.
// To switch from PostgreSQL to another provider — only change
// the Pool config here. Everything else stays the same.
// ─────────────────────────────────────────────────────────────
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Railway uses self-signed certs in some regions — ssl rejectUnauthorized: false is safe internally
  ssl: process.env.DATABASE_URL?.includes('railway') || process.env.DATABASE_URL?.includes('render')
    ? { rejectUnauthorized: false }
    : false,
});

// ── Migrations ───────────────────────────────────────────────
async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id          SERIAL PRIMARY KEY,
      title       TEXT        NOT NULL,
      description TEXT        DEFAULT '',
      type        VARCHAR(16) NOT NULL DEFAULT 'task',   -- 'task' | 'question'
      priority    VARCHAR(16) NOT NULL DEFAULT 'normal', -- 'urgent' | 'high' | 'normal'
      author      TEXT        NOT NULL,
      deadline    TIMESTAMPTZ,
      resolved    BOOLEAN     NOT NULL DEFAULT FALSE,
      resolved_by TEXT,
      resolved_at TIMESTAMPTZ,
      ping_count  INTEGER     NOT NULL DEFAULT 0,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS daily_quota (
      author      TEXT        NOT NULL,
      quota_date  DATE        NOT NULL DEFAULT CURRENT_DATE,
      used        INTEGER     NOT NULL DEFAULT 0,
      PRIMARY KEY (author, quota_date)
    );
  `);
  console.log('[db] migrations ok');
}

// ── Tasks ────────────────────────────────────────────────────
async function createTask({ title, description, type, priority, author, deadline }) {
  const { rows } = await pool.query(
    `INSERT INTO tasks (title, description, type, priority, author, deadline)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [title, description || '', type, priority, author, deadline || null]
  );
  return rows[0];
}

async function getTasks({ filter = 'all' } = {}) {
  let where = '';
  if (filter === 'open')   where = 'WHERE resolved = FALSE';
  if (filter === 'done')   where = 'WHERE resolved = TRUE';
  const { rows } = await pool.query(
    `SELECT * FROM tasks ${where} ORDER BY created_at DESC`
  );
  return rows;
}

async function getTaskById(id) {
  const { rows } = await pool.query('SELECT * FROM tasks WHERE id = $1', [id]);
  return rows[0] || null;
}

async function resolveTask(id, resolvedBy) {
  const { rows } = await pool.query(
    `UPDATE tasks
     SET resolved = TRUE, resolved_by = $2, resolved_at = NOW()
     WHERE id = $1 AND resolved = FALSE
     RETURNING *`,
    [id, resolvedBy]
  );
  return rows[0] || null;
}

async function incrementPingCount(id) {
  await pool.query(
    'UPDATE tasks SET ping_count = ping_count + 1 WHERE id = $1',
    [id]
  );
}

async function getOpenTasksForPing() {
  const { rows } = await pool.query(
    `SELECT * FROM tasks WHERE resolved = FALSE AND type = 'task' ORDER BY created_at ASC`
  );
  return rows;
}

// ── Quotas ───────────────────────────────────────────────────
async function getQuota(author) {
  const { rows } = await pool.query(
    `SELECT used FROM daily_quota WHERE author = $1 AND quota_date = CURRENT_DATE`,
    [author]
  );
  return rows[0]?.used ?? 0;
}

async function incrementQuota(author) {
  await pool.query(
    `INSERT INTO daily_quota (author, quota_date, used)
     VALUES ($1, CURRENT_DATE, 1)
     ON CONFLICT (author, quota_date)
     DO UPDATE SET used = daily_quota.used + 1`,
    [author]
  );
}

async function getAllQuotas() {
  const { rows } = await pool.query(
    `SELECT author, used FROM daily_quota WHERE quota_date = CURRENT_DATE`
  );
  return rows; // [{ author, used }, ...]
}

module.exports = { migrate, pool, createTask, getTasks, getTaskById, resolveTask, incrementPingCount, getOpenTasksForPing, getQuota, incrementQuota, getAllQuotas };
