import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import * as calendar from './calendar-service.js';
import { complete } from './openai-service.js';

const verses = JSON.parse(readFileSync(new URL('./bible-verses.json', import.meta.url), 'utf-8'));
const VERSE_HISTORY_PATH = new URL('../data/verse-history.json', import.meta.url).pathname;
const TZ = 'America/Sao_Paulo';

// Evita repetir um versículo até metade da lista ter sido usada
const VERSE_HISTORY_SIZE = Math.floor(verses.length / 2);

function readVerseHistory() {
  if (!existsSync(VERSE_HISTORY_PATH)) return [];
  try {
    return JSON.parse(readFileSync(VERSE_HISTORY_PATH, 'utf-8'));
  } catch {
    return [];
  }
}

/**
 * Retorna um versículo aleatório, evitando os usados recentemente
 */
export function getRandomVerse() {
  const history = readVerseHistory();
  const available = verses.filter((v) => !history.includes(v.ref));
  const pool = available.length > 0 ? available : verses;
  const verse = pool[Math.floor(Math.random() * pool.length)];

  try {
    mkdirSync(dirname(VERSE_HISTORY_PATH), { recursive: true });
    writeFileSync(VERSE_HISTORY_PATH, JSON.stringify([...history, verse.ref].slice(-VERSE_HISTORY_SIZE)));
  } catch (err) {
    console.error('[Daily] Erro ao salvar histórico de versículos:', err.message);
  }

  return verse;
}

/**
 * Formata a agenda do dia em texto, sempre no fuso de São Paulo
 * (a EC2 roda em UTC — sem timeZone explícito os horários saem errados)
 */
function formatAgenda(events) {
  if (!events || events.length === 0) return null;
  return events
    .map((e) => {
      const start = e.start?.dateTime || e.start?.date;
      const time = start && start.includes('T')
        ? new Date(start).toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
        : 'dia todo';
      return `• ${time} — ${e.summary}`;
    })
    .join('\n');
}

const DAILY_PROMPT = `Você escreve a mensagem diária de bom dia de um assistente de agenda RANZINZA pro dono dele — um velho amigo rabugento que resmunga mas se importa.

Você recebe: o dia da semana/data, um versículo bíblico (Tradução do Novo Mundo) e a agenda do dia.

REGRAS:
- Português brasileiro informal. Tom ranzinza, sarcástico, mas nunca cruel.
- Estrutura: saudação com o dia, o versículo citado EXATAMENTE como fornecido (com a referência), a agenda do dia, e um fecho provocativo curto.
- TODOS os eventos da agenda aparecem, com os horários copiados EXATAMENTE como fornecidos. Nunca invente nem altere horário.
- Se a agenda estiver vazia, debocha do dia livre.
- Estilo diferente a cada dia: nunca use bordões fixos tipo "Se é que pode ser bom" ou "Vai fazer algo útil ou vai enrolar de novo?".
- Pode usar ☀️ 📖 📅 pra marcar as seções, e *asteriscos* pra negrito.
- No máximo 10 linhas. Responda SÓ com a mensagem, nada mais.`;

/**
 * Gera a mensagem diária: versículo + agenda do dia + personalidade ranzinza.
 * Usa o modelo pra variar o texto a cada dia; se a chamada falhar,
 * cai num template fixo pra mensagem nunca deixar de chegar.
 * @returns {string}
 */
export async function generateDailyMessage() {
  const now = new Date();
  const today = now.toLocaleDateString('en-CA', { timeZone: TZ });
  const weekday = now.toLocaleDateString('pt-BR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });

  const verse = getRandomVerse();

  let agendaText = null;
  try {
    const events = await calendar.listEvents({ startDate: today });
    agendaText = formatAgenda(events);
  } catch (err) {
    console.error('[Daily] Erro ao buscar agenda:', err.message);
  }

  try {
    const message = await complete({
      system: DAILY_PROMPT,
      user: [
        `Dia: ${weekday}`,
        `Versículo (${verse.ref}): "${verse.text}"`,
        `Agenda de hoje:`,
        agendaText || '(vazia)',
      ].join('\n'),
    });
    if (message && message.trim()) return message.trim();
  } catch (err) {
    console.error('[Daily] Erro ao gerar mensagem com IA, usando template:', err.message);
  }

  // Fallback: template fixo (mensagem nunca deixa de chegar)
  return [
    `☀️ *Bom dia.* ${weekday}. Se é que pode ser bom.`,
    ``,
    `📖 *${verse.ref}*: "${verse.text}"`,
    ``,
    `📅 *Hoje você tem:*`,
    agendaText || 'Nada. Pelo menos você descansa.',
    ``,
    `Vai fazer algo útil ou vai enrolar de novo?`,
  ].join('\n');
}
