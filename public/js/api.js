let csrfToken = '';

function timeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`El servidor devolvió una respuesta inválida (${response.status})`);
  }
}

async function request(url, options = {}) {
  const method = options.method || 'GET';
  const headers = new Headers(options.headers || {});
  headers.set('X-Time-Zone', timeZone());
  if (options.body != null && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase()) && csrfToken) {
    headers.set('X-CSRF-Token', csrfToken);
  }

  const response = await fetch(url, {
    ...options,
    method,
    headers,
    credentials: 'same-origin',
  });
  const payload = await readJson(response);

  if (!response.ok) {
    const error = new Error(payload?.error?.message || `La solicitud falló (${response.status})`);
    error.code = payload?.error?.code || 'REQUEST_FAILED';
    error.requestId = payload?.error?.requestId || '';
    error.status = response.status;
    throw error;
  }

  return payload;
}

export async function loadSession() {
  const session = await request('/api/session');
  csrfToken = session?.csrfToken || '';
  return session;
}

export function startGoogleAuth() {
  window.location.assign('/api/auth/google/start');
}

export async function logout() {
  await request('/api/auth/logout', { method: 'POST' });
  csrfToken = '';
}

export async function analyzeEvent(input) {
  return request('/api/ai/analyze', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function createGoogleEvent(event) {
  return request('/api/calendar/events', {
    method: 'POST',
    body: JSON.stringify(event),
  });
}

export async function updateGoogleEvent(googleEventId, event) {
  return request(`/api/calendar/events/${encodeURIComponent(googleEventId)}`, {
    method: 'PATCH',
    body: JSON.stringify(event),
  });
}

export async function deleteGoogleEvent(googleEventId) {
  return request(`/api/calendar/events/${encodeURIComponent(googleEventId)}`, {
    method: 'DELETE',
  });
}
