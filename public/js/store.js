const STORAGE_KEY = 'calendaria_events_v2';
const LEGACY_KEY = 'ag_events';
const STORAGE_VERSION = 2;
const CATEGORIES = new Set(['examen', 'estudio', 'social', 'presentacion', 'tarea', 'otro']);
const REMINDERS = new Set([10, 60, 360, 1440, 10080]);

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function normalizeLegacyTime(value) {
  const raw = String(value || '').trim();
  if (/^\d{1,2}:\d{2}$/.test(raw)) {
    const [hours, minutes] = raw.split(':');
    const normalized = `${hours.padStart(2, '0')}:${minutes}`;
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(normalized) ? normalized : '';
  }
  if (/^\d{3,4}$/.test(raw)) {
    const padded = raw.padStart(4, '0');
    const normalized = `${padded.slice(0, 2)}:${padded.slice(2)}`;
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(normalized) ? normalized : '';
  }
  return '';
}

function isEvent(value) {
  return value
    && typeof value === 'object'
    && typeof value.id === 'string'
    && typeof value.title === 'string'
    && value.title.trim().length > 0
    && isValidDate(value.date)
    && /^([01]\d|2[0-3]):[0-5]\d$/.test(value.time)
    && CATEGORIES.has(value.category)
    && Array.isArray(value.reminders);
}

function normalizeStoredEvent(event) {
  const reminders = [...new Set(event.reminders.map(Number))].filter((value) => REMINDERS.has(value));
  return {
    id: event.id,
    title: event.title.trim().slice(0, 120),
    date: event.date,
    time: event.time,
    category: event.category,
    reminders: reminders.length ? reminders : [10],
    googleEventId: typeof event.googleEventId === 'string' ? event.googleEventId : '',
    googleEventUrl: typeof event.googleEventUrl === 'string' ? event.googleEventUrl : '',
    syncStatus: ['local', 'syncing', 'synced', 'failed'].includes(event.syncStatus) ? event.syncStatus : 'local',
    createdAt: typeof event.createdAt === 'string' ? event.createdAt : new Date().toISOString(),
    updatedAt: typeof event.updatedAt === 'string' ? event.updatedAt : new Date().toISOString(),
  };
}

function migrateLegacyEvents() {
  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]');
    if (!Array.isArray(legacy)) return [];

    const migrated = legacy.flatMap((event) => {
      const reminders = Array.isArray(event?.reminders)
        ? event.reminders.map(Number)
        : [Number(event?.reminder || 10)];
      const candidate = {
        id: crypto.randomUUID(),
        title: String(event?.title || '').trim().slice(0, 120),
        date: String(event?.date || ''),
        time: normalizeLegacyTime(event?.time),
        category: String(event?.category || 'otro'),
        reminders,
        googleEventId: String(event?.gcalId || ''),
        googleEventUrl: '',
        syncStatus: event?.synced ? 'synced' : 'local',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      return isEvent(candidate) ? [normalizeStoredEvent(candidate)] : [];
    });

    localStorage.removeItem(LEGACY_KEY);
    return migrated;
  } catch {
    return [];
  }
}

function writeStore(events) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, events }));
}

function readStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!parsed || parsed.version !== STORAGE_VERSION || !Array.isArray(parsed.events)) {
      const migrated = migrateLegacyEvents();
      writeStore(migrated);
      return migrated;
    }
    return parsed.events.filter(isEvent).map(normalizeStoredEvent);
  } catch {
    const migrated = migrateLegacyEvents();
    writeStore(migrated);
    return migrated;
  }
}

let events = readStore();

function persist() {
  writeStore(events);
}

export function listEvents() {
  return [...events].sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
}

export function addEvent(event) {
  const now = new Date().toISOString();
  const stored = normalizeStoredEvent({
    ...event,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  });
  if (!isEvent(stored)) throw new Error('El evento local no es válido');
  events = [...events, stored];
  persist();
  return stored;
}

export function updateEvent(id, patch) {
  let updated = null;
  events = events.map((event) => {
    if (event.id !== id) return event;
    const candidate = normalizeStoredEvent({
      ...event,
      ...patch,
      id: event.id,
      updatedAt: new Date().toISOString(),
    });
    if (!isEvent(candidate)) throw new Error('La actualización local no es válida');
    updated = candidate;
    return updated;
  });
  persist();
  return updated;
}

export function removeEvent(id) {
  const event = events.find((item) => item.id === id) || null;
  events = events.filter((item) => item.id !== id);
  persist();
  return event;
}
