# Calendar Agent 🤖

Personal AI assistant that manages your Google Calendar via **Telegram** and **WhatsApp**. Built with Node.js, OpenAI and Baileys.

## Features

- 📅 **Create, list, update and delete** Google Calendar events via natural language
- 🔄 **Recurring events** ("every friday at 10am", "daily", "weekly mon/wed/fri")
- ⚠️ **Conflict detection** — warns if you already have something scheduled
- ⏰ **Reminders** (timers, not calendar) — "remind me at 6pm to buy bread"
- ☀️ **Daily message** every 7am with Bible verse (TNM) + agenda summary
- 😠 **Ranzinza personality** — direct, grumpy, no nonsense
- 🧠 **GPT-5.4-mini** loop agentic — understands context, chains tools automatically

## Requirements

| Service | What you need | Cost |
|---------|--------------|------|
| [OpenAI API key](https://platform.openai.com/api-keys) | Credits for GPT-5.4-mini | ~$3-5/month |
| [Telegram Bot Token](https://t.me/BotFather) | Create a bot, get the token | Free |
| [Google Cloud Project](https://console.cloud.google.com) | Service account + Calendar API | Free |
| [Google Calendar](https://calendar.google.com) | Your personal calendar | Free |
| [AWS Account](https://aws.amazon.com) (optional) | EC2 to host 24/7 | ~$6/month or free tier |

## Quick Start (local)

### 1. Clone and install

```bash
git clone git@github.com:KhaiDreams/calendar-agent-whatsapp.git
cd calendar-agent-whatsapp
npm install
```

### 2. Google Calendar setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project → Enable **Google Calendar API**
3. Go to **Credentials** → **Create Service Account** → name `calendar-agent`
4. Download the **JSON key** → save as `service-account.json` in the project folder
5. Open [Google Calendar](https://calendar.google.com) → **Settings** → **Share with specific people**
6. Add the service account email (`calendar-agent@your-project.iam.gserviceaccount.com`) with **Make changes to events**

### 3. Telegram Bot

1. Open Telegram, search **@BotFather**
2. Send `/newbot` → choose a name and username
3. Copy the **token** (format: `123456:ABC-DEF1234ghikl`)

### 4. Configure .env

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Required
OPENAI_API_KEY=sk-proj-your-key-here
GOOGLE_SERVICE_ACCOUNT_PATH=./service-account.json
TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234ghikl
OWNER_NUMBER=5511999999999    # your WhatsApp number (for WhatsApp mode)
```

### 5. Run

```bash
# Telegram only
npm run telegram

# WhatsApp only (experimental - may have issues)
npm run whatsapp

# Both together (via PM2)
pm2 start src/telegram-index.js --name telegram
pm2 start src/whatsapp-index.js --name whatsapp
```

First time running Telegram: send any message to your bot → it will register you as the owner.