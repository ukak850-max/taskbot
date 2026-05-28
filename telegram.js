// src/telegram.js
// ─────────────────────────────────────────────────────────────
// Telegram notifications + inline "Решил" button handling.
// Uses node-telegram-bot-api in polling mode (works on Railway
// without a public webhook URL). Switch to webhook anytime by
// changing the constructor options below.
// ─────────────────────────────────────────────────────────────
const TelegramBot = require('node-telegram-bot-api');
const db = require('./db');

const TOKEN    = process.env.TG_BOT_TOKEN;
const CHAT_IDS = (process.env.TG_CHAT_IDS || '').split(',').map(s => s.trim()).filter(Boolean);

let bot = null;

function init() {
  if (!TOKEN) {
    console.warn('[tg] TG_BOT_TOKEN not set — Telegram disabled');
    return;
  }
  if (!CHAT_IDS.length) {
    console.warn('[tg] TG_CHAT_IDS not set — no recipients');
  }

  // polling: works everywhere, no public URL needed
  // to switch to webhook: replace { polling: true } with
  //   { webHook: { port: 443 } } and call bot.setWebHook(url)
  bot = new TelegramBot(TOKEN, { polling: true });

  // ── Handle inline button callbacks ───────────────────────
  bot.on('callback_query', async (query) => {
    const [action, taskId, resolverName] = query.data.split(':');
    if (action !== 'resolve') return;

    const task = await db.resolveTask(parseInt(taskId), resolverName || query.from.first_name || 'Управленец');
    if (!task) {
      // already resolved — just answer silently
      await bot.answerCallbackQuery(query.id, { text: '✅ Уже решено' });
      return;
    }

    // Edit the original message to show resolved state
    try {
      await bot.editMessageText(
        formatMessage(task, 'resolved'),
        {
          chat_id: query.message.chat.id,
          message_id: query.message.message_id,
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: [] }, // remove button
        }
      );
    } catch (_) {}

    await bot.answerCallbackQuery(query.id, { text: '✅ Задача закрыта!' });

    // Notify all other chats that it's resolved
    const resolver = task.resolved_by || query.from.first_name || 'Управленец';
    for (const chatId of CHAT_IDS) {
      if (String(chatId) === String(query.message.chat.id)) continue;
      await sendText(chatId, formatMessage(task, 'resolved', resolver));
    }
  });

  console.log('[tg] bot started (polling)');
}

// ── Message formatters ────────────────────────────────────────
const PRIO_LABEL = { urgent: '🔴 Критично', high: '🟠 Высокий', normal: '🔵 Обычный' };

function formatMessage(task, type, resolverName) {
  const dl = task.deadline
    ? `\n⏰ Дедлайн: ${new Date(task.deadline).toLocaleString('ru', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`
    : '';
  const desc = task.description ? `\n💬 ${task.description.slice(0, 300)}` : '';
  const isQ  = task.type === 'question';

  if (type === 'new') {
    return [
      isQ ? `❓ <b>НОВЫЙ ВОПРОС #${task.id}</b>` : `🚨 <b>НОВАЯ ЗАДАЧА #${task.id}</b>`,
      `👤 ${task.author}`,
      isQ ? '' : PRIO_LABEL[task.priority],
      dl,
      `📌 ${task.title}`,
      desc,
      '',
      isQ ? '' : `⚡️ Буду напоминать каждые ${process.env.TG_PING_INTERVAL_MINUTES || 10} мин`,
    ].filter(l => l !== undefined && l !== null).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  if (type === 'ping') {
    return [
      `⏰ <b>БЕЗ ОТВЕТА — пинг #${task.ping_count}</b>`,
      `📌 ${task.title}`,
      `👤 ${task.author}`,
      dl,
    ].join('\n');
  }

  if (type === 'resolved') {
    const by = resolverName || task.resolved_by || '—';
    return [`✅ <b>РЕШЕНО #${task.id}</b>`, `📌 ${task.title}`, `👤 ${task.author}`, `🙋 Закрыл: ${by}`].join('\n');
  }

  return '';
}

function resolveButton(task) {
  return {
    reply_markup: {
      inline_keyboard: [[
        {
          text: '✅ Я решил',
          callback_data: `resolve:${task.id}:Управленец`,
        },
      ]],
    },
  };
}

// ── Send helpers ──────────────────────────────────────────────
async function sendText(chatId, text, extra = {}) {
  if (!bot) return;
  try {
    await bot.sendMessage(chatId, text, { parse_mode: 'HTML', ...extra });
  } catch (err) {
    console.error(`[tg] sendMessage to ${chatId} failed:`, err.message);
  }
}

async function notifyNew(task) {
  if (!bot || !CHAT_IDS.length) return;
  const text   = formatMessage(task, 'new');
  const isTask = task.type === 'task';
  for (const chatId of CHAT_IDS) {
    await sendText(chatId, text, isTask ? resolveButton(task) : {});
  }
}

async function notifyPing(task) {
  if (!bot || !CHAT_IDS.length) return;
  const text = formatMessage(task, 'ping');
  for (const chatId of CHAT_IDS) {
    await sendText(chatId, text, resolveButton(task));
  }
}

async function notifyResolved(task, resolverName) {
  if (!bot || !CHAT_IDS.length) return;
  const text = formatMessage(task, 'resolved', resolverName);
  for (const chatId of CHAT_IDS) {
    await sendText(chatId, text);
  }
}

module.exports = { init, notifyNew, notifyPing, notifyResolved };
