/**
 * Serviço de lembretes com timer.
 * Guarda reminders em memória (setTimeout) e espelha em disco (data/reminders.json)
 * pra sobreviver a restarts/deploys do PM2.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const DATA_PATH = new URL('../data/reminders.json', import.meta.url).pathname;

const reminders = new Map();

/**
 * @param {Object} ctx - Telegram context (ou null se chamado internamente)
 * @param {Function} sendFn - Função que envia mensagem
 * @param {string} chatId - Chat ID do Telegram
 */
let botCtx = { sendFn: null, chatId: null };

export function setBotContext(chatId, sendFn) {
  botCtx.chatId = chatId;
  botCtx.sendFn = sendFn;
}

function persist() {
  try {
    mkdirSync(dirname(DATA_PATH), { recursive: true });
    const data = [...reminders.entries()].map(([id, r]) => ({
      id,
      message: r.message,
      remindAt: r.remindAt.toISOString(),
    }));
    writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('[Reminder] Erro ao salvar em disco:', err.message);
  }
}

/**
 * Agenda um lembrete
 * @param {string} id - ID único
 * @param {string} message - Texto do lembrete
 * @param {Date} remindAt - Data/hora pra disparar
 */
export function scheduleReminder(id, message, remindAt, { skipPersist = false } = {}) {
  // Cancela existente se já tiver
  cancelReminder(id, { skipPersist: true });

  const now = Date.now();
  const delay = remindAt.getTime() - now;

  if (delay <= 0) {
    console.log(`[Reminder] Ignorado: ${id} já passou (${remindAt.toISOString()})`);
    return false;
  }

  const timeout = setTimeout(async () => {
    console.log(`[Reminder] Disparando: ${id} — "${message}"`);
    reminders.delete(id);
    persist();

    if (botCtx.sendFn && botCtx.chatId) {
      try {
        await botCtx.sendFn(botCtx.chatId, `🔔 *Lembrete:* ${message}`);
      } catch (err) {
        console.error('[Reminder] Erro ao enviar:', err.message);
      }
    }
  }, delay);

  reminders.set(id, { timeout, message, remindAt });
  console.log(`[Reminder] Agendado: "${message}" para ${remindAt.toISOString()} (em ${Math.round(delay / 60000)} min)`);

  if (!skipPersist) persist();

  return true;
}

/**
 * Cancela um lembrete
 */
export function cancelReminder(id, { skipPersist = false } = {}) {
  const existing = reminders.get(id);
  if (existing) {
    clearTimeout(existing.timeout);
    reminders.delete(id);
    console.log(`[Reminder] Cancelado: ${id}`);
    if (!skipPersist) persist();
    return true;
  }
  return false;
}

/**
 * Lista lembretes ativos
 */
export function listReminders() {
  const result = [];
  for (const [id, r] of reminders) {
    result.push({ id, message: r.message, remindAt: r.remindAt.toISOString() });
  }
  return result;
}

/**
 * Recarrega lembretes salvos em disco. Chamar uma vez no startup, depois de setBotContext.
 * Lembretes cujo horário já passou durante o downtime são disparados na hora, com aviso de atraso.
 */
export async function loadReminders() {
  if (!existsSync(DATA_PATH)) return;

  let saved = [];
  try {
    saved = JSON.parse(readFileSync(DATA_PATH, 'utf-8'));
  } catch (err) {
    console.error('[Reminder] Erro ao ler lembretes salvos:', err.message);
    return;
  }

  for (const { id, message, remindAt } of saved) {
    const date = new Date(remindAt);
    if (date.getTime() > Date.now()) {
      scheduleReminder(id, message, date, { skipPersist: true });
    } else if (botCtx.sendFn && botCtx.chatId) {
      try {
        await botCtx.sendFn(botCtx.chatId, `🔔 *Lembrete atrasado (bot estava offline):* ${message}`);
      } catch (err) {
        console.error('[Reminder] Erro ao enviar lembrete atrasado:', err.message);
      }
    }
  }

  persist();
  console.log(`[Reminder] ${saved.length} lembrete(s) recarregados do disco.`);
}
