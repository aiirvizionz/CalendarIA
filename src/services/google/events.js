'use strict';

const { fetchWithTimeout, readGoogleResponse } = require('./auth');
const { buildCalendarEvent, normalizeCalendarEvent, normalizeTitle, parseRecurrenceRule, selectUpcomingOwnedEvents } = require('./shape');

const URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const PAGE_SIZE = 250;

async function listPages(accessToken, query, maxEvents = 1000) {
  const events = []; let pageToken = '';
  do {
    const params = new URLSearchParams(query); if (pageToken) params.set('pageToken', pageToken);
    const response = await fetchWithTimeout(`${URL}?${params}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    const payload = await readGoogleResponse(response, 'No se pudieron obtener los eventos de Google Calendar');
    for (const event of Array.isArray(payload?.items) ? payload.items : []) { events.push(event); if (events.length >= maxEvents) break; }
    pageToken = events.length < maxEvents ? String(payload?.nextPageToken || '') : '';
  } while (pageToken);
  return events;
}

async function listCalendarEvents(accessToken, timeZone) {
  const now = Date.now(); const timeMax = new Date(now + 366 * 86400000).toISOString();
  const expanded = await listPages(accessToken, {
    singleEvents: 'true', orderBy: 'startTime', showDeleted: 'false', eventTypes: 'default', timeMin: new Date(now).toISOString(), timeMax, timeZone, maxResults: String(PAGE_SIZE),
    fields: 'items(id,summary,description,location,colorId,status,eventType,creator,organizer,start,end,reminders,htmlLink,recurringEventId,extendedProperties),nextPageToken',
  });
  const ids = new Set(expanded.filter((event) => event?.creator?.self === true && typeof event?.recurringEventId === 'string').map((event) => event.recurringEventId));
  const recurrenceById = new Map();
  if (ids.size) {
    const masters = await listPages(accessToken, { singleEvents: 'false', showDeleted: 'false', eventTypes: 'default', maxResults: String(PAGE_SIZE), fields: 'items(id,creator,recurrence),nextPageToken' });
    for (const event of masters) if (ids.has(event?.id) && event?.creator?.self === true) recurrenceById.set(event.id, parseRecurrenceRule(event.recurrence));
  }
  return selectUpcomingOwnedEvents(expanded, recurrenceById, now);
}

function localEventDateTime(event, timeZone) {
  if (!event?.start?.dateTime) return null;
  const parsed = new Date(event.start.dateTime); if (Number.isNaN(parsed.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(parsed);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { date: `${values.year}-${values.month}-${values.day}`, time: `${values.hour}:${values.minute}` };
}

async function findDuplicateCalendarEvent(accessToken, event, timeZone) {
  const [year, month, day] = event.date.split('-').map(Number);
  const candidates = await listPages(accessToken, { singleEvents: 'true', orderBy: 'startTime', showDeleted: 'false', eventTypes: 'default', timeMin: new Date(Date.UTC(year, month - 1, day - 1)).toISOString(), timeMax: new Date(Date.UTC(year, month - 1, day + 2)).toISOString(), timeZone, maxResults: String(PAGE_SIZE) }, PAGE_SIZE);
  const target = `${normalizeTitle(event.title)}|${event.date}|${event.allDay ? 'all-day' : event.time}`;
  return candidates.find((candidate) => {
    if (candidate?.creator?.self !== true || (candidate?.eventType || 'default') !== 'default') return false;
    if (event.allDay && candidate?.start?.date) return `${normalizeTitle(candidate.summary)}|${candidate.start.date}|all-day` === target;
    const local = localEventDateTime(candidate, timeZone);
    return local ? `${normalizeTitle(candidate.summary)}|${local.date}|${local.time}` === target : false;
  }) || null;
}

async function createCalendarEvent(accessToken, event, timeZone) {
  const duplicate = await findDuplicateCalendarEvent(accessToken, event, timeZone); if (duplicate) return { event: duplicate, duplicate: true };
  const response = await fetchWithTimeout(URL, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(buildCalendarEvent(event, timeZone)) });
  return { event: await readGoogleResponse(response, 'No se pudo crear el evento en Google Calendar'), duplicate: false };
}

async function updateCalendarEvent(accessToken, id, event, timeZone) {
  const response = await fetchWithTimeout(`${URL}/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(buildCalendarEvent(event, timeZone)) });
  return readGoogleResponse(response, 'No se pudo actualizar el evento en Google Calendar');
}

async function deleteCalendarEvent(accessToken, id) {
  const response = await fetchWithTimeout(`${URL}/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } });
  if (response.status === 204 || response.status === 410) return;
  await readGoogleResponse(response, 'No se pudo eliminar el evento de Google Calendar');
}

module.exports = { createCalendarEvent, deleteCalendarEvent, findDuplicateCalendarEvent, listCalendarEvents, updateCalendarEvent, listPages };
