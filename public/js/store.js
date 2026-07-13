const DEPRECATED_STORAGE_KEYS = Object.freeze([
  'calendaria_events_v2',
  'ag_events',
]);

const transientEvents = new Map();

function cloneEvent(event) {
  if (!event) return null;
  return {
    ...event,
    reminders: Array.isArray(event.reminders) ? [...event.reminders] : [],
  };
}

export function purgeDeprecatedLocalEvents(storage = globalThis.localStorage) {
  if (!storage || typeof storage.removeItem !== 'function') return;

  for (const key of DEPRECATED_STORAGE_KEYS) {
    try {
      storage.removeItem(key);
    } catch {
      // Storage may be disabled by the browser. CalendarIA does not depend on it.
    }
  }
}

purgeDeprecatedLocalEvents();

export function listEvents() {
  // Google Calendar is the single source of truth. Transient sync records are
  // intentionally never exposed to the agenda UI.
  return [];
}

export function addEvent(event) {
  if (event?.syncStatus === 'local') {
    throw new Error('Conecta Google para guardar eventos en tu calendario');
  }

  const now = new Date().toISOString();
  const stored = {
    ...event,
    id: crypto.randomUUID(),
    reminders: Array.isArray(event?.reminders) && event.reminders.length
      ? [...event.reminders]
      : [10],
    googleEventId: typeof event?.googleEventId === 'string' ? event.googleEventId : '',
    googleEventUrl: typeof event?.googleEventUrl === 'string' ? event.googleEventUrl : '',
    syncStatus: 'syncing',
    createdAt: now,
    updatedAt: now,
  };

  transientEvents.set(stored.id, stored);
  return cloneEvent(stored);
}

export function updateEvent(id, patch) {
  const current = transientEvents.get(id);
  if (!current) return null;

  const updated = {
    ...current,
    ...patch,
    id: current.id,
    reminders: Array.isArray(patch?.reminders)
      ? [...patch.reminders]
      : [...current.reminders],
    updatedAt: new Date().toISOString(),
  };

  if (updated.syncStatus === 'synced' || updated.syncStatus === 'failed') {
    transientEvents.delete(id);
  } else {
    transientEvents.set(id, updated);
  }

  return cloneEvent(updated);
}

export function removeEvent(id) {
  const event = transientEvents.get(id) || null;
  transientEvents.delete(id);
  return cloneEvent(event);
}
