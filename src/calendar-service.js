import { google } from 'googleapis';
import { readFileSync } from 'fs';
import config from './config.js';

let calendar = null;

function getClient() {
  if (calendar) return calendar;

  const credentials = JSON.parse(
    readFileSync(config.googleServiceAccountPath, 'utf-8')
  );

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });

  calendar = google.calendar({ version: 'v3', auth });
  return calendar;
}

/**
 * Cria um evento no Google Calendar
 */
/**
 * Converte string de recorrência amigável pra RRULE do Google Calendar
 * Ex: "weekly:friday" → "RRULE:FREQ=WEEKLY;BYDAY=FR"
 *     "daily" → "RRULE:FREQ=DAILY"
 *     "weekly:monday,wednesday" → "RRULE:FREQ=WEEKLY;BYDAY=MO,WE"
 *     "monthly:15" → "RRULE:FREQ=MONTHLY;BYMONTHDAY=15"
 */
function parseRecurrence(recurrence) {
  if (!recurrence) return null;

  const lower = recurrence.toLowerCase().trim();

  if (lower === 'daily') return ['RRULE:FREQ=DAILY'];

  if (lower.startsWith('weekly')) {
    const days = lower.replace('weekly:', '').split(',').map(d => {
      const map = { 'domingo': 'SU', 'dom': 'SU', 'segunda': 'MO', 'seg': 'MO', 'terça': 'TU', 'ter': 'TU', 'quarta': 'WE', 'qua': 'WE', 'quinta': 'TH', 'qui': 'TH', 'sexta': 'FR', 'sex': 'FR', 'sábado': 'SA', 'sab': 'SA' };
      return map[d.trim()] || d.trim().toUpperCase().slice(0, 2);
    }).join(',');
    return [`RRULE:FREQ=WEEKLY;BYDAY=${days}`];
  }

  if (lower.startsWith('monthly')) {
    const day = lower.replace('monthly:', '').trim();
    return [`RRULE:FREQ=MONTHLY;BYMONTHDAY=${day}`];
  }

  return null;
}

/**
 * Soma dias a uma string YYYY-MM-DD usando aritmética de calendário em UTC.
 * Não usa timezone de wall-clock (Date.UTC só serve aqui pra calcular
 * virada de dia/mês/ano, nunca pra interpretar horário local).
 */
function addDaysToDateString(dateStr, days) {
  if (days === 0) return dateStr;
  const [y, m, d] = dateStr.split('-').map(Number);
  const utcDate = new Date(Date.UTC(y, m - 1, d));
  utcDate.setUTCDate(utcDate.getUTCDate() + days);
  return utcDate.toISOString().split('T')[0];
}

export async function createEvent({ summary, description, startDate, startTime, durationMinutes, recurrence }) {
  const cal = getClient();

  const startDateTime = startTime
    ? `${startDate}T${startTime}:00`
    : `${startDate}T09:00:00`;

  const MINUTES_PER_DAY = 24 * 60;
  const dur = durationMinutes || 60;
  const [sH, sM] = (startTime || '09:00').split(':').map(Number);
  const endTotalMinutes = sH * 60 + sM + dur;
  const dayOffset = Math.floor(endTotalMinutes / MINUTES_PER_DAY);
  const endMinutesInDay = endTotalMinutes % MINUTES_PER_DAY;
  const endH = String(Math.floor(endMinutesInDay / 60)).padStart(2, '0');
  const endM = String(endMinutesInDay % 60).padStart(2, '0');
  const endDate = addDaysToDateString(startDate, dayOffset);
  const endDateTime = `${endDate}T${endH}:${endM}:00`;

  const event = {
    summary,
    description: description || '',
    start: { dateTime: startDateTime, timeZone: 'America/Sao_Paulo' },
    end: { dateTime: endDateTime, timeZone: 'America/Sao_Paulo' },
  };

  const rrule = parseRecurrence(recurrence);
  if (rrule) event.recurrence = rrule;

  const response = await cal.events.insert({
    calendarId: config.googleCalendarId,
    requestBody: event,
  });

  return response.data;
}

/**
 * Lista eventos em um período
 */
export async function listEvents({ startDate, endDate }) {
  const cal = getClient();

  const response = await cal.events.list({
    calendarId: config.googleCalendarId,
    timeMin: new Date(`${startDate}T00:00:00-03:00`).toISOString(),
    timeMax: endDate
      ? new Date(`${endDate}T23:59:59-03:00`).toISOString()
      : new Date(`${startDate}T23:59:59-03:00`).toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  });

  return response.data.items || [];
}

/**
 * Deleta um evento pelo ID
 */
export async function deleteEvent(eventId) {
  const cal = getClient();
  await cal.events.delete({
    calendarId: config.googleCalendarId,
    eventId,
  });
  return true;
}

/**
 * Atualiza um evento existente
 */
export async function updateEvent(eventId, updates) {
  const cal = getClient();

  const event = {};
  if (updates.summary) event.summary = updates.summary;
  if (updates.description) event.description = updates.description;
  if (updates.startDate || updates.startTime) {
    const startTime = updates.startTime || '09:00';
    const startDateTime = `${updates.startDate || ''}T${startTime}:00`;
    event.start = { dateTime: startDateTime, timeZone: 'America/Sao_Paulo' };

    // Mesma aritmética de minutos/dia do createEvent — NUNCA usar
    // `new Date(stringSemOffset)` aqui: o horário acima é "hora de parede"
    // em São Paulo sem offset explícito, e o Date nativo do Node
    // interpretaria como hora local do SERVIDOR (ex: UTC na EC2), o que
    // desloca o horário calculado em até 3h.
    if (updates.durationMinutes) {
      const MINUTES_PER_DAY = 24 * 60;
      const [sH, sM] = startTime.split(':').map(Number);
      const endTotalMinutes = sH * 60 + sM + updates.durationMinutes;
      const dayOffset = Math.floor(endTotalMinutes / MINUTES_PER_DAY);
      const endMinutesInDay = endTotalMinutes % MINUTES_PER_DAY;
      const endH = String(Math.floor(endMinutesInDay / 60)).padStart(2, '0');
      const endM = String(endMinutesInDay % 60).padStart(2, '0');
      const endDate = addDaysToDateString(updates.startDate || '', dayOffset);
      event.end = { dateTime: `${endDate}T${endH}:${endM}:00`, timeZone: 'America/Sao_Paulo' };
    }
  }

  const response = await cal.events.patch({
    calendarId: config.googleCalendarId,
    eventId,
    requestBody: event,
  });

  return response.data;
}

/**
 * Busca eventos nos próximos N minutos (usado pelo lembrete)
 */
export async function getUpcomingEvents(minutesAhead = 30) {
  const cal = getClient();
  const now = new Date();
  const end = new Date(now.getTime() + minutesAhead * 60000);

  const response = await cal.events.list({
    calendarId: 'primary',
    timeMin: now.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  });

  return response.data.items || [];
}