const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const DEFAULT_EVENT_TYPES = Object.freeze([
  { name: 'Examen', name_key: 'examen', google_color_id: 11, position: 0 },
  { name: 'Estudio', name_key: 'estudio', google_color_id: 2, position: 1 },
  { name: 'Tarea', name_key: 'tarea', google_color_id: 6, position: 2 },
  { name: 'Presentación', name_key: 'presentacion', google_color_id: 9, position: 3 },
  { name: 'Social', name_key: 'social', google_color_id: 4, position: 4 },
  { name: 'Otro', name_key: 'otro', google_color_id: 8, position: 5 },
]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function readSecretKey() {
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (raw) {
    try {
      const keys = JSON.parse(raw);
      if (keys?.default) return String(keys.default);
    } catch {
      // Fall back to the legacy key below.
    }
  }
  return String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
}

function adminHeaders(extra: Record<string, string> = {}) {
  const key = readSecretKey();
  if (!key) throw new Error('SUPABASE_ADMIN_KEY_MISSING');
  const headers: Record<string, string> = {
    apikey: key,
    'Content-Type': 'application/json',
    ...extra,
  };
  if (!key.startsWith('sb_secret_')) headers.Authorization = `Bearer ${key}`;
  return headers;
}

async function rest(path: string, init: RequestInit = {}) {
  const baseUrl = String(Deno.env.get('SUPABASE_URL') || '').replace(/\/+$/, '');
  if (!baseUrl) throw new Error('SUPABASE_URL_MISSING');
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
    ...init,
    headers: adminHeaders(init.headers as Record<string, string> | undefined),
  });
  const raw = await response.text();
  let payload: unknown = null;
  try { payload = raw ? JSON.parse(raw) : null; } catch { payload = raw; }
  if (!response.ok) {
    console.error(JSON.stringify({ event: 'event_types_db_error', status: response.status }));
    throw new Error(`SUPABASE_REST_${response.status}`);
  }
  return payload;
}

async function googleIdentity(req: Request) {
  const authorization = String(req.headers.get('authorization') || '');
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${match[1]}` },
  });
  if (!response.ok) return null;
  const profile = await response.json();
  const sub = typeof profile?.sub === 'string' ? profile.sub.trim() : '';
  if (!sub || sub.length > 255) return null;
  return { sub };
}

function nameKey(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-MX')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function validateReplacement(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 12) {
    throw new Error('INVALID_EVENT_TYPES');
  }

  const seen = new Set<string>();
  return value.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('INVALID_EVENT_TYPE');
    const item = entry as Record<string, unknown>;
    const name = String(item.name || '').replace(/\s+/g, ' ').trim();
    const key = nameKey(name);
    const googleColorId = Number(item.googleColorId);
    const position = item.position == null ? index : Number(item.position);

    if (!name || name.length > 40 || !key || seen.has(key)) throw new Error('INVALID_EVENT_TYPE_NAME');
    if (!Number.isInteger(googleColorId) || googleColorId < 1 || googleColorId > 11) throw new Error('INVALID_GOOGLE_COLOR');
    if (!Number.isInteger(position) || position < 0 || position > 99) throw new Error('INVALID_POSITION');
    seen.add(key);

    return { name, name_key: key, google_color_id: googleColorId, position };
  });
}

async function ensureDefaults(googleSub: string) {
  const encodedSub = encodeURIComponent(googleSub);
  await rest('user_event_preferences?on_conflict=google_sub', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify({ google_sub: googleSub }),
  });

  const current = await rest(`event_types?google_sub=eq.${encodedSub}&select=id&limit=1`) as unknown[];
  if (Array.isArray(current) && current.length) return;

  const rows = DEFAULT_EVENT_TYPES.map((entry) => ({ google_sub: googleSub, ...entry }));
  await rest('event_types?on_conflict=google_sub,name_key', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  });
}

async function listEventTypes(googleSub: string) {
  await ensureDefaults(googleSub);
  const encodedSub = encodeURIComponent(googleSub);
  const rows = await rest(`event_types?google_sub=eq.${encodedSub}&select=id,name,name_key,google_color_id,position&order=position.asc,created_at.asc`) as Array<Record<string, unknown>>;
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    id: String(row.id || ''),
    name: String(row.name || ''),
    key: String(row.name_key || ''),
    googleColorId: Number(row.google_color_id),
    position: Number(row.position),
  }));
}

async function replaceEventTypes(googleSub: string, eventTypes: unknown) {
  const rows = validateReplacement(eventTypes);
  const encodedSub = encodeURIComponent(googleSub);
  await rest(`event_types?google_sub=eq.${encodedSub}`, { method: 'DELETE' });
  await rest('user_event_preferences?on_conflict=google_sub', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify({ google_sub: googleSub }),
  });
  await rest('event_types', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(rows.map((entry) => ({ google_sub: googleSub, ...entry }))),
  });
  return listEventTypes(googleSub);
}

Deno.serve(async (req: Request) => {
  try {
    const identity = await googleIdentity(req);
    if (!identity) return json({ error: { code: 'GOOGLE_AUTH_REQUIRED', message: 'Valid Google access token required' } }, 401);

    if (req.method === 'GET') {
      return json({ eventTypes: await listEventTypes(identity.sub) });
    }

    if (req.method === 'PUT') {
      let body: Record<string, unknown>;
      try { body = await req.json(); } catch { return json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } }, 400); }
      try {
        const eventTypes = await replaceEventTypes(identity.sub, body?.eventTypes);
        return json({ eventTypes });
      } catch (error) {
        if (String(error?.message || '').startsWith('INVALID_')) {
          return json({ error: { code: String(error.message), message: 'Invalid event type preferences' } }, 400);
        }
        throw error;
      }
    }

    if (req.method === 'DELETE') {
      const encodedSub = encodeURIComponent(identity.sub);
      await rest(`user_event_preferences?google_sub=eq.${encodedSub}`, { method: 'DELETE' });
      return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
    }

    return json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' } }, 405);
  } catch (error) {
    console.error(JSON.stringify({ event: 'event_types_function_error', message: String(error?.message || error) }));
    return json({ error: { code: 'INTERNAL_ERROR', message: 'Unexpected error' } }, 500);
  }
});
