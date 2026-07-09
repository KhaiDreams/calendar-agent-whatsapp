import cron from 'node-cron';
import { startTelegramBot } from './telegram-bot.js';
import { generateDailyMessage } from './daily-message.js';
import { setBotContext, loadReminders } from './reminder-service.js';
import { startHealthServer } from './health-server.js';
import config from './config.js';

console.log('═══════════════════════════════════════');
console.log('  Calendar Agent — Assistente Telegram');
console.log('═══════════════════════════════════════\n');

const bot = startTelegramBot();

// Sobe o healthcheck (usado pelo pipeline de deploy pra validar que o bot subiu)
startHealthServer(config.telegramHealthPort, () => ({ status: 'ok', bot: 'telegram', uptime: process.uptime() }));

// Configura o reminder-service com o contexto do Telegram
setBotContext(config.telegramOwnerChatId, bot.telegram.sendMessage.bind(bot.telegram));
console.log('[Reminder] Contexto do bot configurado.');

// Recarrega lembretes salvos em disco (sobrevive a restarts/deploys)
loadReminders();

// Agenda mensagem diária às 7:00 da manhã (horário de Brasília)
cron.schedule('0 7 * * *', async () => {
  console.log('[Cron] Gerando mensagem diária...');
  try {
    const chatId = config.telegramOwnerChatId;
    if (!chatId) {
      console.log('[Cron] Chat ID não configurado, pulando.');
      return;
    }

    const message = await generateDailyMessage();
    await bot.telegram.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    console.log('[Cron] Mensagem diária enviada.');
  } catch (err) {
    console.error('[Cron] Erro ao enviar mensagem diária:', err.message);
  }
}, {
  timezone: 'America/Sao_Paulo',
});

console.log('[Cron] Mensagem diária agendada para 7:00 AM (America/Sao_Paulo)');

// Graceful shutdown
process.once('SIGINT', () => { bot.stop('SIGINT'); process.exit(0); });
process.once('SIGTERM', () => { bot.stop('SIGTERM'); process.exit(0); });