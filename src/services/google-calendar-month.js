'use strict';

const { normalizeCalendarEvent } = require('./google');

const GOOGLE_CALENDAR_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const DEFAULT_TIMEOUT_MS = 15000;
const PAGE_SIZE = 2500;
const MAX_EVENTS = 5000;

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function readGoogleResponse(response) {
  const raw = await response.text();
  let payload = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message = String(payload?.error?.message || 'No se pudieron obtener los eventos del mes').trim();
    const error = new Error(message || 'No se pudieron obtener los eventos del mes');
    error.statusCode = response.status === 401 ? 401 : 502;
    error.code = response.status === 401 ? 'GOOGLE_AUTH_EXPIRED' : 'GOOGLE_API_ERROR';
    throw error;
  }
  return payload;
}

function calendarMonthWindow(month) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(month || ''));
  if (!match) return null;

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const start = new Date(Date.UTC(year, monthIndex, 1));
  const end = new Date(Date.UTC(year, monthIndex + 1, 1));

  // One-day margins keep timezone edge events visible in the leading/trailing
  // cells of the monthly grid without changing Google Calendar as source of truth.
  start.setUTCDate(start.getUTCDate() - 1);
  end.setUTCDate(end.getUTCDate() + 1);
  return { timeMin: start.toISOString(), timeMax: end.toISOString() };
}

function eventStartTimestamp(event) {
  const value = event?.start?.dateTime || (event?.start?.date ? `${event.start.date}T00:00:00Z` : '');
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Number.MAX_SAFE_INTEGER;
}

function selectCalendarMonthEvents(items) {
  return [...(Array.isArray(items) ? items : [])]
    .filter((event) => event?.status !== 'cancelled'
      && event?.id
      && (event.eventType || 'default') === 'default'
      && event?.creator?.self === true)
    .sort((a, b) => eventStartTimestamp(a) - eventStartTimestamp(b))
    .map((event) => normalizeCalendarEvent(event));
}

async function listCalendarMonthEvents(accessToken, timeZone, month) {
  const window = calendarMonthWindow(month);
  if (!window) {
    const error = new Error('El mes solicitado no es válido');
    error.statusCode = 400;
    error.code = 'INVALID_CALENDAR_MONTH';
    throw error;
  }

  const items = [];
  let pageToken = '';
  do {
    const params = new URLSearchParams({
      singleEvents: 'true',
      orderBy: 'startTime',
      showDeleted: 'false',
      eventTypes: 'default',
      timeMin: window.timeMin,
      timeMax: window.timeMax,
      timeZone,
      maxResults: String(PAGE_SIZE),
    });
    if (pageToken) params.set('pageToken', pageToken);

    const response = await fetchWithTimeout(`${GOOGLE_CALENDAR_URL}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const payload = await readGoogleResponse(response);
    for (const event of Array.isArray(payload?.items) ? payload.items : []) {
      items.push(event);
      if (items.length >= MAX_EVENTS) break;
    }
    pageToken = items.length < MAX_EVENTS ? String(payload?.nextPageToken || '') : '';
  } while (pageToken);

  // singleEvents=true makes Google expand recurring series into every real
  // occurrence inside the requested range, including edited instances.
  return selectCalendarMonthEvents(items);
}

module.exports = {
  calendarMonthWindow,
  listCalendarMonthEvents,
  selectCalendarMonthEvents,
};
