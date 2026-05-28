// src/routes.js
// ─────────────────────────────────────────────────────────────
// REST API consumed by the frontend.
// All routes are prefixed with /api (mounted in index.js).
// ─────────────────────────────────────────────────────────────
const express = require('express');
const db      = require('./db');
const tg      = require('./telegram');

const router = express.Router();

const DAILY_LIMIT  = parseInt(process.env.DAILY_LIMIT || '3', 10);
const MANAGER_PIN  = process.env.MANAGER_PIN || '1234';
const EMPLOYEES    = (process.env.EMPLOYEES || 'Алексей К.,Мария П.,Дмитрий С.,Ольга Н.,Иван Р.')
  .split(',').map(s => s.trim());

// ── Health ────────────────────────────────────────────────────
router.get('/health', (_, res) => res.json({ ok: true, ts: new Date() }));

// ── Auth (manager PIN) ────────────────────────────────────────
router.post('/auth', (req, res) => {
  const { pin } = req.body;
  if (pin === MANAGER_PIN) return res.json({ ok: true });
  res.status(401).json({ ok: false, error: 'Неверный PIN' });
});

// ── Employees ─────────────────────────────────────────────────
router.get('/employees', (_, res) => res.json(EMPLOYEES));

// ── Tasks ─────────────────────────────────────────────────────
// GET /api/tasks?filter=open|done|all
router.get('/tasks', async (req, res) => {
  try {
    const tasks = await db.getTasks({ filter: req.query.filter || 'all' });
    res.json(tasks);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// POST /api/tasks — create new task
router.post('/tasks', async (req, res) => {
  const { title, description, type, priority, author, deadline } = req.body;

  if (!title || !author || !type) {
    return res.status(400).json({ error: 'title, author, type are required' });
  }
  if (!EMPLOYEES.includes(author)) {
    return res.status(400).json({ error: 'Unknown author' });
  }

  // Check daily quota
  const used = await db.getQuota(author);
  if (used >= DAILY_LIMIT) {
    return res.status(429).json({
      error: `Лимит исчерпан — ${author} уже отправил ${DAILY_LIMIT} обращений сегодня`,
    });
  }

  try {
    const task = await db.createTask({ title, description, type, priority: priority || 'normal', author, deadline });
    await db.incrementQuota(author);
    await tg.notifyNew(task);
    res.status(201).json(task);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// PATCH /api/tasks/:id/resolve — mark as resolved
router.patch('/tasks/:id/resolve', async (req, res) => {
  const { resolvedBy } = req.body;
  try {
    const task = await db.resolveTask(parseInt(req.params.id), resolvedBy || 'Управленец');
    if (!task) return res.status(404).json({ error: 'Task not found or already resolved' });
    await tg.notifyResolved(task, task.resolved_by);
    res.json(task);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// ── Quotas ────────────────────────────────────────────────────
// GET /api/quotas — today's usage per employee
router.get('/quotas', async (_, res) => {
  try {
    const rows  = await db.getAllQuotas();
    // Return full employee list with usage = 0 for those not in DB yet
    const map   = Object.fromEntries(rows.map(r => [r.author, r.used]));
    const result = EMPLOYEES.map(emp => ({
      author: emp,
      used:   map[emp] ?? 0,
      limit:  DAILY_LIMIT,
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'DB error' });
  }
});

module.exports = router;
