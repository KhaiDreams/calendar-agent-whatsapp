import { config } from 'dotenv';

// Carrega .env se existir (apenas desenvolvimento local)
try {
  config();
} catch {}

const required = (key, defaultValue) => {
  const value = process.env[key] || defaultValue;
  if (!value) {
    throw new Error(`Variável de ambiente obrigatória: ${key}`);
  }
  return value;
};

export default {
  // OpenAI
  openaiApiKey: required('OPENAI_API_KEY'),

  // Google Calendar — caminho pro JSON da service account
  googleServiceAccountPath: required('GOOGLE_SERVICE_ACCOUNT_PATH', './service-account.json'),

  // Porta do healthcheck do bot do Telegram (usado pelo pipeline de deploy)
  telegramHealthPort: parseInt(process.env.TELEGRAM_HEALTH_PORT || '3002', 10),

  // OpenAI model
  openaiModel: process.env.OPENAI_MODEL || 'gpt-5.4-mini',

  // Google Calendar — ID do calendário do dono (ex: seuemail@gmail.com)
  googleCalendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',

  // Telegram
  telegramBotToken: required('TELEGRAM_BOT_TOKEN'),
  // Chat ID do dono do bot no Telegram (preenchido automaticamente na primeira mensagem)
  telegramOwnerChatId: process.env.TELEGRAM_OWNER_CHAT_ID ? parseInt(process.env.TELEGRAM_OWNER_CHAT_ID, 10) : null,

  // Número máximo de mensagens no histórico por conversa
  maxHistory: parseInt(process.env.MAX_HISTORY || '20', 10),
};
