'use strict';

const crypto = require('crypto');
const config = require('../config');
const { addMinutesToLocalDateTime } = require('../lib/event');

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const GOOGLE_CALENDAR_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const OAUTH_SCOPES = ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/calendar.events'];
const DEFAULT_TIMEOUT_MS = 15000;
const CALENDAR_PAGE_SIZE = 2500;
const MAX_CALENDAR_EVENTS = 5000;

function normalizeModelSafeText(value) {
  return String(value || '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim();
}

function normalizeEventTitle(value) {
  return normalizeModelSafeText(value)
    .normalize('NFKC')
    .toLocaleLowerCase('es-MX')
    .replace(/\s+/g, ' ')
    .trim();
}

function createPkcePair() {
  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

function createAuthorizationRequest() {
  const state = crypto.randomBytes(32).toString('base64url');
  const { verifier, challenge } = createPkcePair();
  const redirectUri = `${config.appBaseUrl}/api/auth/google/callback`;
  const params = new URLSearchParams({
    client_id: config.googleClientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: OAUTH_SCOPES.join(' '),
    include_granted_scopes: 'true',
    access_type: 'offline',
    prompt: 'consent',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });

  return {
    url: `${GOOGLE_AUTH_URL}?${params.toString()}`,
    state,
    verifier,
    expiresAt: Date.now() + 10 * 60 * 1000,
  };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function readGoogleResponse(response, fallbackMessage) {
  const raw = await response.text();
  let payload = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message = normalizeModelSafeText(payload?.error_description || payload?.error?.message || fallbackMessage);
    const error = new Error(message || fallbackMessage);
    error.statusCode = response.status === 401 ? 401 : 502;
    error.code = response.status === 401 ? 'GOOGLE_AUTH_EXPIRED' : 'GOOGLE_API_ERROR';
    throw error;
  }
  return payload;
}

async function exchangeAuthorizationCode(code, verifier) {
  const redirectUri = `${config.appBaseUrl}/api/auth/google/callback`;
  const response = await fetchWithTimeout(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.googleClientId,
      client_secret: config.googleClientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }),
  });
  return readGoogleResponse(response, 'No se pudo completar la autorización con Google');
}

async function refreshAccessToken(refreshToken) {
  if (!refreshToken) {
    const error = new Error('La sesión de Google expiró');
    error.statusCode = 401;
    error.code = 'GOOGLE_AUTH_EXPIRED';
    throw error;
  }

  const response = await fetchWithTimeout(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.googleClientId,
      client_secret: config.googleClientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  return readGoogleResponse(response, 'No se pudo renovar la sesión de Google');
}

async function getUserInfo(accessToken) {
  const response = await fetchWithTimeout(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return readGoogleResponse(response, 'No se pudo obtener el perfil de Google');
}

async function ensureAccessToken(session) {
  if (session.accessToken && Number(session.accessTokenExpiresAt) > Date.now() + 60_000) {
    return { accessToken: session.accessToken, session, refreshed: false };
  }

  const tokens = await refreshAccessToken(session.refreshToken);
  const updatedSession = {
    ...session,
    accessToken: tokens.access_token,
    accessTokenExpiresAt: Date.now() + Number(tokens.expires_in || 3600) * 1000,
  };
  return { accessToken: updatedSession.accessToken, session: updatedSession, refreshed: true };
}

function buildCalendarEvent(event, timeZone) {
  const end = addMinutesToLocalDateTime(event.date, event.time, 60);
  return {
    summary: event.title,
    description: `Categoría: ${event.category}\nCreado con CalendarIA.`,
    start: { dateTime: `${event.date}T${event.time}:00`, timeZone },
    end: { dateTime: `${end.date}T${end.time}:00`, timeZone },
    reminders: {
      useDefault: false,
      overrides: event.reminders.map((minutes) => ({ method: 'popup', minutes })),
    },
  };
}

function parseRecurrenceRule(lines) {
  if (!Array.isArray(lines)) return null;
  const rrule = lines.find((line) => typeof line === 'string' && line.startsWith('RRULE:'));
  if (!rrule) return null;

  const fields = Object.fromEntries(
    rrule.slice('RRULE:'.length)
      .split(';')
      .map((field) => field.split('=', 2))
      .filter(([key, value]) => key && value),
  );
  const frequencyMap = {
    DAILY: 'daily',
    WEEKLY: 'weekly',
    MONTHLY: 'monthly',
    YEARLY: 'yearly',
  };
  const interval = Number.parseInt(fields.INTERVAL || '1', 10);
  return {
    frequency: frequencyMap[fields.FREQ] || 'custom',
    interval: Number.isInteger(interval) && interval > 0 ? interval : 1,
  };
}

function calendarEventStartTimestamp(event) {
  if (event?.start?.dateTime) {
    const timestamp = Date.parse(event.start.dateTime);
    return Number.isFinite(timestamp) ? timestamp : Number.MAX_SAFE_INTEGER;
  }
  if (event?.start?.date) {
    const timestamp = Date.parse(`${event.start.date}T00:00:00Z`);
    return Number.isFinite(timestamp) ? timestamp : Number.MAX_SAFE_INTEGER;
  }
  return Number.MAX_SAFE_INTEGER;
}

function calendarEventEndTimestamp(event) {
  if (event?.end?.dateTime) {
    const timestamp = Date.parse(event.end.dateTime);
    return Number.isFinite(timestamp) ? timestamp : Number.MIN_SAFE_INTEGER;
  }
  if (event?.end?.date) {
    const timestamp = Date.parse(`${event.end.date}T00:00:00Z`);
    return Number.isFinite(timestamp) ? timestamp : Number.MIN_SAFE_INTEGER;
  }
  return calendarEventStartTimestamp(event);
}

function eventStartIdentity(event) {
  if (event?.start?.dateTime) {
    const timestamp = Date.parse(event.start.dateTime);
    return Number.isFinite(timestamp) ? `time:${new Date(timestamp).toISOString()}` : `time:${event.start.dateTime}`;
  }
  return event?.start?.date ? `date:${event.start.date}` : 'date:unknown';
}

function eventContentKey(event) {
  return `${normalizeEventTitle(event?.summary)}|${eventStartIdentity(event)}`;
}

function normalizeCalendarEvent(event, recurrence = null) {
  const start = event?.start || {};
  const reminders = Array.isArray(event?.reminders?.overrides)
    ? event.reminders.overrides
      .map((reminder) => Number(reminder?.minutes))
      .filter((minutes) => Number.isInteger(minutes) && minutes >= 0)
    : [];
  const recurringEventId = typeof event?.recurringEventId === 'string' ? event.recurringEventId : '';

  return {
    id: String(event?.id || ''),
    deleteId: recurringEventId || String(event?.id || ''),
    title: normalizeModelSafeText(event?.summary) || 'Sin título',
    startDateTime: typeof start.dateTime === 'string' ? start.dateTime : '',
    startDate: typeof start.date === 'string' ? start.date : '',
    timeZone: typeof start.timeZone === 'string' ? start.timeZone : '',
    htmlLink: typeof event?.htmlLink === 'string' ? event.htmlLink : '',
    eventType: typeof event?.eventType === 'string' ? event.eventType : 'default',
    reminders,
    useDefaultReminders: Boolean(event?.reminders?.useDefault),
    creatorSelf: Boolean(event?.creator?.self),
    organizerSelf: Boolean(event?.organizer?.self),
    recurringEventId,
    recurring: Boolean(recurringEventId),
    recurrence: recurringEventId ? recurrence || { frequency: 'custom', interval: 1 } : null,
  };
}

function selectUpcomingOwnedEvents(expandedEvents, recurrenceById = new Map(), nowMs = Date.now()) {
  const sorted = [...(Array.isArray(expandedEvents) ? expandedEvents : [])]
    .filter((event) => event?.status !== 'cancelled'
      && event?.id
      && (event.eventType || 'default') === 'default'
      && event?.creator?.self === true
      && calendarEventEndTimestamp(event) > nowMs)
    .sort((a, b) => calendarEventStartTimestamp(a) - calendarEventStartTimestamp(b));

  const events = [];
  const seenSeries = new Set();
  const seenContent = new Set();

  for (const event of sorted) {
    const seriesId = typeof event.recurringEventId === 'string' ? event.recurringEventId : '';
    if (seriesId && seenSeries.has(seriesId)) continue;

    const contentKey = eventContentKey(event);
    if (seenContent.has(contentKey)) continue;

    if (seriesId) seenSeries.add(seriesId);
    seenContent.add(contentKey);
    events.push(normalizeCalendarEvent(event, seriesId ? recurrenceById.get(seriesId) || null : null));
  }
  return events;
}

async function listCalendarPages(accessToken, query, maxEvents = MAX_CALENDAR_EVENTS) {
  const events = [];
  let pageToken = '';

  do {
    const params = new URLSearchParams(query);
    if (pageToken) params.set('pageToken', pageToken);
    const response = await fetchWithTimeout(`${GOOGLE_CALENDAR_URL}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const payload = await readGoogleResponse(response, 'No se pudieron obtener los eventos de Google Calendar');

    for (const event of Array.isArray(payload?.items) ? payload.items : []) {
      events.push(event);
      if (events.length >= maxEvents) break;
    }
    pageToken = events.length < maxEvents ? String(payload?.nextPageToken || '') : '';
  } while (pageToken);

  return events;
}

async function listCalendarEvents(accessToken, timeZone) {
  const nowMs = Date.now();
  const expandedEvents = await listCalendarPages(accessToken, {
    singleEvents: 'true',
    orderBy: 'startTime',
    showDeleted: 'false',
    eventTypes: 'default',
    timeMin: new Date(nowMs).toISOString(),
    timeZone,
    maxResults: String(CALENDAR_PAGE_SIZE),
  });

  const recurringIds = new Set(
    expandedEvents
      .filter((event) => event?.creator?.self === true && typeof event?.recurringEventId === 'string')
      .map((event) => event.recurringEventId),
  );
  const recurrenceById = new Map();

  if (recurringIds.size) {
    const masters = await listCalendarPages(accessToken, {
      singleEvents: 'false',
      showDeleted: 'false',
      eventTypes: 'default',
      maxResults: String(CALENDAR_PAGE_SIZE),
    });

    for (const event of masters) {
      if (!recurringIds.has(event?.id) || event?.creator?.self !== true) continue;
      recurrenceById.set(event.id, parseRecurrenceRule(event.recurrence));
      if (recurrenceById.size >= recurringIds.size) break;
    }
  }

  return selectUpcomingOwnedEvents(expandedEvents, recurrenceById, nowMs);
}

function localEventDateTime(event, timeZone) {
  const start = event?.start?.dateTime;
  if (!start) return null;
  const parsed = new Date(start);
  if (Number.isNaN(parsed.getTime())) return null;

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(parsed);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { date: `${values.year}-${values.month}-${values.day}`, time: `${values.hour}:${values.minute}` };
}

function utcSearchWindow(date) {
  const [year, month, day] = String(date).split('-').map(Number);
  return {
    timeMin: new Date(Date.UTC(year, month - 1, day - 1)).toISOString(),
    timeMax: new Date(Date.UTC(year, month - 1, day + 2)).toISOString(),
  };
}

async function findDuplicateCalendarEvent(accessToken, event, timeZone) {
  const targetKey = `${normalizeEventTitle(event.title)}|${event.date}|${event.time}`;
  const window = utcSearchWindow(event.date);
  const candidates = await listCalendarPages(accessToken, {
    singleEvents: 'true',
    orderBy: 'startTime',
    showDeleted: 'false',
    eventTypes: 'default',
    timeMin: window.timeMin,
    timeMax: window.timeMax,
    timeZone,
    maxResults: String(CALENDAR_PAGE_SIZE),
  }, CALENDAR_PAGE_SIZE);

  return candidates.find((candidate) => {
    if (candidate?.creator?.self !== true || (candidate?.eventType || 'default') !== 'default') return false;
    const local = localEventDateTime(candidate, timeZone);
    if (!local) return false;
    return `${normalizeEventTitle(candidate.summary)}|${local.date}|${local.time}` === targetKey;
  }) || null;
}

async function createCalendarEvent(accessToken, event, timeZone) {
  const duplicate = await findDuplicateCalendarEvent(accessToken, event, timeZone);
  if (duplicate) return { event: duplicate, duplicate: true };

  const response = await fetchWithTimeout(GOOGLE_CALENDAR_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildCalendarEvent(event, timeZone)),
  });
  const created = await readGoogleResponse(response, 'No se pudo crear el evento en Google Calendar');
  return { event: created, duplicate: false };
}

async function updateCalendarEvent(accessToken, googleEventId, event, timeZone) {
  const url = `${GOOGLE_CALENDAR_URL}/${encodeURIComponent(googleEventId)}`;
  const response = await fetchWithTimeout(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildCalendarEvent(event, timeZone)),
  });
  return readGoogleResponse(response, 'No se pudo actualizar el evento en Google Calendar');
}

async function deleteCalendarEvent(accessToken, googleEventId) {
  const url = `${GOOGLE_CALENDAR_URL}/${encodeURIComponent(googleEventId)}`;
  const response = await fetchWithTimeout(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (response.status === 204 || response.status === 410) return;
  await readGoogleResponse(response, 'No se pudo eliminar el evento de Google Calendar');
}

async function revokeToken(token) {
  if (!token) return;
  try {
    await fetchWithTimeout(GOOGLE_REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }),
    }, 5000);
  } catch {
    // Logout must still clear the server session if Google is unavailable.
  }
}

module.exports = {
  createAuthorizationRequest,
  createCalendarEvent,
  deleteCalendarEvent,
  ensureAccessToken,
  eventContentKey,
  exchangeAuthorizationCode,
  findDuplicateCalendarEvent,
  getUserInfo,
  listCalendarEvents,
  normalizeCalendarEvent,
  parseRecurrenceRule,
  revokeToken,
  selectUpcomingOwnedEvents,
  updateCalendarEvent,
};