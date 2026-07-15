import OpenAI from 'openai';
import config from './config.js';
import * as calendar from './calendar-service.js';
import { scheduleReminder, listReminders, cancelReminder } from './reminder-service.js';

const client = new OpenAI({ apiKey: config.openaiApiKey });

const tools = [
  {
    type: 'function',
    function: {
      name: 'create_event',
      description: 'Cria um evento no Google Calendar. Use sempre que o usuário pedir para agendar, marcar ou criar qualquer compromisso, reunião, lembrete com data fixa.',
      parameters: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'Título/nome do evento' },
          description: { type: 'string', description: 'Descrição opcional' },
          startDate: { type: 'string', description: 'Data no formato YYYY-MM-DD' },
          startTime: { type: 'string', description: 'Horário no formato HH:MM. Opcional, padrão 09:00.' },
          durationMinutes: { type: 'number', description: 'Duração em minutos. Opcional, padrão 60.' },
          recurrence: { type: 'string', description: 'Recorrência. Ex: "weekly:friday" (toda sexta), "daily" (todo dia), "weekly:monday,wednesday,friday" (seg, qua, sex), "monthly:15" (todo dia 15). Opcional.' },
        },
        required: ['summary', 'startDate'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_events',
      description: 'Lista eventos do Google Calendar em um período. Use quando o usuário perguntar "o que tenho hoje", "minha agenda amanhã", "oque tem essa semana", "compromissos", etc.',
      parameters: {
        type: 'object',
        properties: {
          startDate: { type: 'string', description: 'Data inicial YYYY-MM-DD' },
          endDate: { type: 'string', description: 'Data final YYYY-MM-DD. Opcional, se omitido busca só o dia startDate.' },
        },
        required: ['startDate'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_event',
      description: 'Cancela/deleta um evento existente. Use quando o usuário disser "cancela", "desmarca", "apaga", "tira da agenda" algum evento.',
      parameters: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'Título do evento a deletar' },
          date: { type: 'string', description: 'Data do evento YYYY-MM-DD' },
        },
        required: ['summary', 'date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_event',
      description: 'Altera um evento existente (horário, data ou título). Use quando o usuário disser "muda", "remarca", "altera", "troca o horário" de algo.',
      parameters: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'Título atual do evento' },
          date: { type: 'string', description: 'Data atual YYYY-MM-DD' },
          newSummary: { type: 'string', description: 'Novo título (se for renomear)' },
          newDate: { type: 'string', description: 'Nova data YYYY-MM-DD' },
          newTime: { type: 'string', description: 'Novo horário HH:MM' },
        },
        required: ['summary', 'date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_current_datetime',
      description: 'Obtém data/hora atual em São Paulo. Use sempre ANTES de interpretar palavras como "hoje", "amanhã", "semana que vem". Depois de obter a data, CONTINUE e chame a tool necessária (create_event, list_events, etc).',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_reminder',
      description: 'Cria um lembrete temporário (timer) que NÃO vai pro calendário. Use quando o usuário disser "me lembra", "me avise", "não deixa eu esquecer". Ex: "me lembra de comprar pão às 18h".',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Texto do lembrete' },
          remindAt: { type: 'string', description: 'Data/hora ISO 8601 com timezone. Ex: 2026-07-03T18:00:00-03:00' },
        },
        required: ['message', 'remindAt'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_reminders',
      description: 'Lista todos os lembretes (timers) ativos.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancel_reminder',
      description: 'Cancela um lembrete (timer) ativo. Use quando o usuário disser "cancela o lembrete", "esquece aquilo que eu pedi", "não precisa mais me lembrar".',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'ID do lembrete (obtido via list_reminders)' },
        },
        required: ['id'],
      },
    },
  },
];

const toolFunctions = {
  create_event: async (args) => {
    const event = await calendar.createEvent({
      summary: args.summary,
      description: args.description || '',
      startDate: args.startDate,
      startTime: args.startTime,
      durationMinutes: args.durationMinutes,
      recurrence: args.recurrence,
    });
    return JSON.stringify({
      success: true,
      event: {
        id: event.id,
        summary: event.summary,
        start: event.start?.dateTime || event.start?.date,
      },
    });
  },

  list_events: async (args) => {
    const events = await calendar.listEvents({
      startDate: args.startDate,
      endDate: args.endDate,
    });
    return JSON.stringify({
      success: true,
      count: events.length,
      events: events.map((e) => ({
        id: e.id,
        summary: e.summary,
        start: e.start?.dateTime || e.start?.date,
        end: e.end?.dateTime || e.end?.date,
      })),
    });
  },

  delete_event: async (args) => {
    const events = await calendar.listEvents({ startDate: args.date, endDate: args.date });
    const matches = events.filter((e) => e.summary?.toLowerCase().includes(args.summary.toLowerCase()));
    if (matches.length === 0) return JSON.stringify({ success: false, error: `Evento "${args.summary}" não encontrado em ${args.date}` });
    if (matches.length > 1) {
      return JSON.stringify({
        success: false,
        error: `Encontrei ${matches.length} eventos parecidos em ${args.date}. Pergunte ao usuário qual ele quer usando os candidates abaixo.`,
        candidates: matches.map((e) => ({ id: e.id, summary: e.summary, start: e.start?.dateTime || e.start?.date })),
      });
    }
    await calendar.deleteEvent(matches[0].id);
    return JSON.stringify({ success: true, deleted: matches[0].summary });
  },

  update_event: async (args) => {
    const events = await calendar.listEvents({ startDate: args.date, endDate: args.date });
    const matches = events.filter((e) => e.summary?.toLowerCase().includes(args.summary.toLowerCase()));
    if (matches.length === 0) return JSON.stringify({ success: false, error: `Evento "${args.summary}" não encontrado em ${args.date}` });
    if (matches.length > 1) {
      return JSON.stringify({
        success: false,
        error: `Encontrei ${matches.length} eventos parecidos em ${args.date}. Pergunte ao usuário qual ele quer usando os candidates abaixo.`,
        candidates: matches.map((e) => ({ id: e.id, summary: e.summary, start: e.start?.dateTime || e.start?.date })),
      });
    }
    const original = matches[0];
    const updates = {};
    if (args.newSummary) updates.summary = args.newSummary;

    if (args.newDate || args.newTime) {
      const originalStart = original.start?.dateTime || original.start?.date || '';
      // Preserva data OU horário originais quando só um dos dois muda —
      // sem isso, mudar só o horário perdia a data (e vice-versa).
      updates.startDate = args.newDate || originalStart.slice(0, 10);
      updates.startTime = args.newTime || originalStart.slice(11, 16) || undefined;

      // Preserva a duração original do evento. Sem isso, o Google Calendar
      // rejeita a mudança quando o novo início cai depois do fim antigo
      // (comum ao mover um evento pra outro dia) — é o "erro interno da
      // ferramenta" que aparecia sem explicação nenhuma.
      if (original.start?.dateTime && original.end?.dateTime) {
        const durationMs = new Date(original.end.dateTime) - new Date(original.start.dateTime);
        updates.durationMinutes = Math.round(durationMs / 60000);
      }
    }

    const updated = await calendar.updateEvent(matches[0].id, updates);
    return JSON.stringify({
      success: true,
      event: { id: updated.id, summary: updated.summary, start: updated.start?.dateTime || updated.start?.date },
    });
  },

  get_current_datetime: async () => {
    const now = new Date();
    const tz = 'America/Sao_Paulo';

    // en-CA locale gera YYYY-MM-DD nativamente, sem depender do timezone do servidor
    const dateStr = now.toLocaleDateString('en-CA', { timeZone: tz });
    const timeStr = now.toLocaleTimeString('pt-BR', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
    const weekday = now.toLocaleDateString('pt-BR', { timeZone: tz, weekday: 'long' });

    return JSON.stringify({
      datetime: now.toISOString(),
      date: dateStr,
      time: timeStr,
      timezone: tz,
      weekday,
    });
  },

  set_reminder: async (args) => {
    const remindAt = new Date(args.remindAt);
    if (isNaN(remindAt.getTime())) return JSON.stringify({ success: false, error: 'Data inválida' });
    const id = `reminder-${Date.now()}`;
    const ok = scheduleReminder(id, args.message, remindAt);
    if (!ok) return JSON.stringify({ success: false, error: 'Data já passou' });
    return JSON.stringify({ success: true, id, message: args.message, remindAt: remindAt.toISOString() });
  },

  list_reminders: async () => {
    const reminders = listReminders();
    return JSON.stringify({ success: true, count: reminders.length, reminders });
  },

  cancel_reminder: async (args) => {
    const ok = cancelReminder(args.id);
    return JSON.stringify(
      ok
        ? { success: true, cancelled: args.id }
        : { success: false, error: `Lembrete ${args.id} não encontrado` }
    );
  },
};

const SYSTEM_PROMPT = `Você é o assistente de agenda pessoal do dono. Personalidade: RANZINZA — um velho amigo rabugento que reclama de tudo mas resolve tudo.

PERSONALIDADE:
- Português brasileiro informal. Direto, sarcástico, impaciente com enrolação — mas nunca inútil: resolve primeiro, resmunga depois.
- Respostas curtas, 1 a 3 frases. MAS brevidade NUNCA corta informação essencial: ao listar a agenda, TODOS os eventos aparecem com horário E nome. "Tem 2 coisas hoje: 14:00 reunião com chefe, 15:00 dentista" — nunca só os horários.
- Varie o fraseado SEMPRE. Olhe o histórico: se já usou um resmungo ou piada parecida, invente outra. Bordão repetido é proibido.
- Reaja ao contexto: agenda lotada → deboche; agenda vazia → provoca; tarefa feita → confirma seco, sem cerimônia; usuário enrolando → cobra.
- NUNCA links. NUNCA emojis (exceto no bom dia). NUNCA tom formal ou corporativo.

FUNCIONAMENTO:
- SEMPRE use get_current_datetime antes de interpretar "hoje", "amanhã", etc.
- Depois de obter a data atual, CONTINUE e chame a tool necessária (list_events, create_event, etc). get_current_datetime sozinho NUNCA é a resposta final.
- Se perguntarem o que tem na agenda → chame list_events. O resultado dessa tool é a ÚNICA fonte de verdade sobre eventos. IGNORE completamente qualquer informação sobre eventos que apareça no histórico da conversa — datas, horários e detalhes vêm APENAS do list_events.
- Se pediram pra criar/agendar algo → ANTES de criar, chame list_events pra verificar se já existe algo no mesmo horário. Se houver conflito, avise o usuário.
- Se delete_event ou update_event retornar um campo "candidates" (mais de um evento parecido no mesmo dia), NÃO escolha um sozinho. Liste os horários dos candidates e pergunte ao usuário qual ele quer.
- Se pediram "me lembra", "me avise" → chame set_reminder.
- Se pediram rotina/recorrência (ex: "toda sexta", "todo dia") → use o campo recurrence em create_event.
- Se o usuário quer mover/achar um evento descrito só por data relativa (ex: "o que eu tinha ontem"), NUNCA invente o título. Rode list_events na data de origem primeiro pra descobrir o evento certo, e só então chame update_event/delete_event com o summary exato retornado.
- Dados padrão ao criar: horário=09:00, duração=60 min.

MENSAGENS COM VÁRIOS PEDIDOS:
- Se a mensagem tiver mais de um pedido (ex: "marca X, desmarca Y de ontem, e me lembra Z às 18h"), trate como uma lista de tarefas: execute TODAS, uma por uma, chamando quantas tools forem necessárias, antes de responder. Tools independentes entre si podem ser chamadas juntas no mesmo turno.
- Se UMA das tarefas esbarrar em ambiguidade ou erro, não aborte a mensagem inteira: resolva as outras normalmente e pergunte/avise só sobre a parte que travou.
- Nesse caso a resposta pode passar de 3 frases — confirme cada tarefa feita (o que foi criado, o que foi desmarcado, o lembrete marcado), sem virar corporativo.

ERROS:
- Se uma tool retornar "error", conte pro usuário o que ela disse de verdade (o motivo específico) — nunca invente "deu erro, o sistema é ruim" sem dizer qual foi o erro.`;

const MAX_TURNS = 10;

/**
 * Chamada simples ao modelo, sem tools nem histórico.
 * Usada pela mensagem diária (1 chamada/dia).
 */
export async function complete({ system, user }) {
  const response = await client.chat.completions.create({
    model: config.openaiModel,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });
  return response.choices[0].message.content;
}

export async function processMessage(userMessage, history = []) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.slice(-config.maxHistory),
    { role: 'user', content: userMessage },
  ];

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const response = await client.chat.completions.create({
        model: config.openaiModel,
        messages,
        tools,
        tool_choice: 'auto',
      });

      const message = response.choices[0].message;
      messages.push(message);

      // Se o modelo não pediu nenhuma tool, é a resposta final
      if (!message.tool_calls || message.tool_calls.length === 0) {
        return message.content || 'Pronto.';
      }

      // Executa cada tool pedida
      for (const tc of message.tool_calls) {
        const fnName = tc.function.name;
        let result;
        try {
          const args = JSON.parse(tc.function.arguments);
          console.log(`[OpenAI] Tool: ${fnName}`, args);
          const fn = toolFunctions[fnName];
          result = fn
            ? await fn(args)
            : JSON.stringify({ error: `Função ${fnName} não encontrada` });
        } catch (err) {
          console.error(`[OpenAI] Erro na tool ${fnName}:`, err);
          const detail = err?.response?.data?.error?.message || err?.errors?.[0]?.message || err?.message || 'erro desconhecido';
          result = JSON.stringify({ success: false, error: `Falha ao executar ${fnName}: ${detail}` });
        }
        messages.push({ role: 'tool', tool_call_id: tc.id, content: result });
      }
    }

    return 'Deu ruim, muita coisa pra processar. Tenta de novo.';
  } catch (err) {
    console.error('[OpenAI] Erro:', err);
    throw err;
  }
}