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

function normalizeModelSafeText(value) {
  return String(value || '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim();
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

async function createCalendarEvent(accessToken, event, timeZone) {
  const response = await fetchWithTimeout(GOOGLE_CALENDAR_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildCalendarEvent(event, timeZone)),
  });

  return readGoogleResponse(response, 'No se pudo crear el evento en Google Calendar');
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
    // Logout must still clear the local encrypted session if Google is unavailable.
  }
}

module.exports = {
  createAuthorizationRequest,
  createCalendarEvent,
  deleteCalendarEvent,
  ensureAccessToken,
  exchangeAuthorizationCode,
  getUserInfo,
  revokeToken,
  updateCalendarEvent,
};
