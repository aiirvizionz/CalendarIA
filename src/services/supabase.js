'use strict';

const config = require('../config');

const DEFAULT_TIMEOUT_MS = 10_000;

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeEventTypes(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => ({
      id: String(entry?.id || ''),
      name: String(entry?.name || '').trim(),
      key: String(entry?.key || '').trim(),
      googleColorId: Number(entry?.googleColorId),
      position: Number(entry?.position),
    }))
    .filter((entry) => entry.name
      && entry.key
      && Number.isInteger(entry.googleColorId)
      && entry.googleColorId >= 1
      && entry.googleColorId <= 11
      && Number.isInteger(entry.position));
}

async function requestEventTypes(accessToken, { method = 'GET', eventTypes } = {}) {
  if (!config.supabaseUrl || !accessToken) return [];

  const response = await fetchWithTimeout(`${config.supabaseUrl}/functions/v1/event-types`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(eventTypes ? { 'Content-Type': 'application/json' } : {}),
    },
    body: eventTypes ? JSON.stringify({ eventTypes }) : undefined,
  });

  const raw = await response.text();
  let payload = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const error = new Error('No se pudieron obtener las preferencias de tipos de evento');
    error.statusCode = response.status === 401 ? 401 : 502;
    error.code = response.status === 401 ? 'SUPABASE_GOOGLE_AUTH_REQUIRED' : 'SUPABASE_EVENT_TYPES_ERROR';
    throw error;
  }

  return normalizeEventTypes(payload?.eventTypes);
}

async function listEventTypes(accessToken) {
  return requestEventTypes(accessToken);
}

async function replaceEventTypes(accessToken, eventTypes) {
  return requestEventTypes(accessToken, { method: 'PUT', eventTypes });
}

async function deleteEventTypes(accessToken) {
  if (!config.supabaseUrl || !accessToken) return;
  const response = await fetchWithTimeout(`${config.supabaseUrl}/functions/v1/event-types`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok && response.status !== 404) {
    const error = new Error('No se pudieron eliminar las preferencias de tipos de evento');
    error.statusCode = response.status === 401 ? 401 : 502;
    error.code = response.status === 401 ? 'SUPABASE_GOOGLE_AUTH_REQUIRED' : 'SUPABASE_EVENT_TYPES_ERROR';
    throw error;
  }
}

async function resolveEventTypeColor(accessToken, category) {
  if (!config.supabaseUrl || !accessToken) return '';
  try {
    const eventTypes = await listEventTypes(accessToken);
    const match = eventTypes.find((eventType) => eventType.key === String(category || ''));
    return match ? String(match.googleColorId) : '';
  } catch (error) {
    console.warn(JSON.stringify({
      event: 'supabase_event_types_fallback',
      code: error?.code || 'SUPABASE_EVENT_TYPES_ERROR',
    }));
    return '';
  }
}

module.exports = {
  deleteEventTypes,
  listEventTypes,
  normalizeEventTypes,
  replaceEventTypes,
  resolveEventTypeColor,
};
