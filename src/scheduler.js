// src/scheduler.js
// ─────────────────────────────────────────────────────────────
// Runs a cron job every minute, checks which open tasks need
// a ping based on TG_PING_INTERVAL_MINUTES, and sends them.
//
// Why cron instead of setInterval per task?
// — Survives server restarts (tasks are re-loaded from DB)
// — No memory leaks from dangling timers
// — Easy to change interval via env var
// ─────────────────────────────────────────────────────────────
const cron = require('node-cron');
const db   = require('./db');
const tg   = require('./telegram');

const INTERVAL_MINS = parseInt(process.env.TG_PING_INTERVAL_MINUTES || '10', 10);

function start() {
  // Run every minute — lightweight check
  cron.schedule('* * * * *', async () => {
    try {
      const tasks = await db.getOpenTasksForPing();
      const now   = Date.now();

      for (const task of tasks) {
        const createdAt  = new Date(task.created_at).getTime();
        const ageMinutes = (now - createdAt) / 60000;

        // Ping when: age > interval * (ping_count + 1)
        // e.g. interval=10: ping at 10min, 20min, 30min, ...
        const nextPingAt = INTERVAL_MINS * (task.ping_count + 1);

        if (ageMinutes >= nextPingAt) {
          await db.incrementPingCount(task.id);
          const updated = await db.getTaskById(task.id);
          await tg.notifyPing(updated);
        }
      }
    } catch (err) {
      console.error('[scheduler] error:', err.message);
    }
  });

  console.log(`[scheduler] started — pinging every ${INTERVAL_MINS} min`);
}

module.exports = { start };
