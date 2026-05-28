// src/index.js
require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const path       = require('path');
const db         = require('./db');
const tg         = require('./telegram');
const scheduler  = require('./scheduler');
const routes     = require('./routes');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false })); // CSP off — we serve our own frontend
app.use(cors());
app.use(express.json());

// ── API ───────────────────────────────────────────────────────
app.use('/api', routes);

// ── Frontend (static) ─────────────────────────────────────────
// In production the built frontend lives in /public.
// In dev you can run the frontend separately (set FRONTEND_URL for CORS).
app.use(express.static(path.join(__dirname, '../public')));

// SPA fallback — any non-API route returns index.html
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ── Startup ───────────────────────────────────────────────────
async function start() {
  await db.migrate();
  tg.init();
  scheduler.start();

  app.listen(PORT, () => {
    console.log(`[app] listening on port ${PORT}`);
    console.log(`[app] daily limit = ${process.env.DAILY_LIMIT || 3} per employee`);
    console.log(`[app] ping interval = ${process.env.TG_PING_INTERVAL_MINUTES || 10} min`);
  });
}

start().catch(err => {
  console.error('[app] startup failed:', err);
  process.exit(1);
});
