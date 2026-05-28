# TaskBot

Бот для экстренных задач команды с Telegram-уведомлениями.

## Стек
- **Backend**: Node.js + Express
- **БД**: PostgreSQL (через `pg`)
- **Telegram**: `node-telegram-bot-api` (polling — работает без публичного URL)
- **Хостинг**: Railway (легко мигрировать на Render / VPS)

---

## Деплой на Railway (5 шагов)

### 1. Создайте проект
1. Зайдите на [railway.app](https://railway.app) → New Project
2. Deploy from GitHub repo (загрузите этот код) или **Deploy from local** через CLI:
   ```bash
   npm install -g @railway/cli
   railway login
   railway init
   railway up
   ```

### 2. Добавьте PostgreSQL
В Railway: **New Service → Database → PostgreSQL**  
Railway автоматически добавит переменную `DATABASE_URL` в ваш проект.

### 3. Настройте переменные окружения
В Railway → вашем сервисе → вкладка **Variables**:

| Переменная | Значение | Описание |
|---|---|---|
| `DATABASE_URL` | *(Railway добавит сам)* | Строка подключения к PostgreSQL |
| `TG_BOT_TOKEN` | `123456789:AAFxxx...` | Токен от @BotFather |
| `TG_CHAT_IDS` | `-1001234567890,987654321` | Chat ID получателей через запятую |
| `TG_PING_INTERVAL_MINUTES` | `10` | Интервал повторных пингов |
| `MANAGER_PIN` | `1234` | PIN для входа управленцев |
| `DAILY_LIMIT` | `3` | Лимит обращений на сотрудника |
| `EMPLOYEES` | `Алексей К.,Мария П.,Дмитрий С.` | Список сотрудников через запятую |

### 4. Запустите
Railway сам запустит `npm start`. База данных создастся автоматически при первом старте (миграции в `src/db.js`).

### 5. Откройте
Railway даст публичный URL вида `https://taskbot-xxx.up.railway.app`  
Поделитесь им с командой.

---

## Как получить Telegram Chat ID

**Для личного чата:**
1. Напишите боту любое сообщение
2. Откройте: `https://api.telegram.org/bot<TOKEN>/getUpdates`
3. Найдите поле `"chat": {"id": 123456789}` — это и есть ID

**Для группы/канала:**
1. Добавьте бота в группу
2. Напишите любое сообщение в группе
3. Откройте `getUpdates` — ID группы начинается с `-100`

---

## Миграция на другой хостинг

### Render
Всё то же самое. В Render тоже есть PostgreSQL как сервис.  
Добавьте переменные в Environment → Deploy.

### VPS (Ubuntu)
```bash
# 1. Установите Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install nodejs

# 2. Установите PostgreSQL
sudo apt install postgresql
sudo -u postgres createdb taskbot
sudo -u postgres createuser taskbot_user -P

# 3. Клонируйте и запустите
git clone <ваш-репо>
cd taskbot
cp .env.example .env
# заполните .env
npm install
npm start

# 4. Для продакшена используйте pm2
npm install -g pm2
pm2 start src/index.js --name taskbot
pm2 save
pm2 startup
```

### Vercel + Supabase
Vercel не поддерживает long-running processes (нужны для polling и cron).  
Используйте Render или Railway.

---

## Структура проекта

```
taskbot/
├── src/
│   ├── index.js       # Entry point — Express + startup
│   ├── db.js          # PostgreSQL queries + migrations
│   ├── telegram.js    # Bot init + message formatters + inline buttons
│   ├── scheduler.js   # Cron — повторные пинги каждые N минут
│   └── routes.js      # REST API /api/*
├── public/
│   └── index.html     # Фронтенд (команда + управленцы)
├── .env.example
├── package.json
└── README.md
```

## API endpoints

| Метод | URL | Описание |
|---|---|---|
| GET | `/api/health` | Проверка работоспособности |
| POST | `/api/auth` | Проверка PIN управленца |
| GET | `/api/employees` | Список сотрудников |
| GET | `/api/tasks?filter=open\|done\|all` | Список задач |
| POST | `/api/tasks` | Создать задачу |
| PATCH | `/api/tasks/:id/resolve` | Закрыть задачу |
| GET | `/api/quotas` | Дневные квоты сотрудников |

---

## Как работают уведомления

1. Сотрудник создаёт задачу → мгновенный пуш в TG всем получателям с кнопкой **✅ Я решил**
2. Каждые N минут (по умолчанию 10) — повторный пинг если задача открыта
3. Управленец нажимает **✅ Я решил** прямо в Telegram → задача закрывается, пинги останавливаются, все получают финальное уведомление
4. Или управленец заходит на сайт → вкладка управленца → жмёт **Я решил**
