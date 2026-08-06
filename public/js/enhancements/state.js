export const CATEGORY_META = Object.freeze({
  examen: { label: 'Examen', color: '#dc2127' }, tarea: { label: 'Tarea', color: '#ffb878' }, clase: { label: 'Clase', color: '#5484ed' },
  estudio: { label: 'Estudio', color: '#7ae7bf' }, presentacion: { label: 'Presentación', color: '#fbd75b' }, social: { label: 'Social', color: '#ff887c' }, otro: { label: 'Otro', color: '#e1e1e1' },
});

export const enhancedState = { calendarEvents: [], lastAiEvent: null, editing: null };

// CalendarIA 2.x freezes its category label map inside app-legacy.js. This
// compatibility shim adds the new "clase" category before that map is frozen.
const nativeFreeze = Object.freeze;
Object.freeze = function calendarIaFreeze(value) {
  if (value && typeof value === 'object' && value.examen === 'Examen' && value.tarea === 'Tarea' && value.otro === 'Otro' && !value.clase) value.clase = 'Clase';
  return nativeFreeze(value);
};
queueMicrotask(() => { Object.freeze = nativeFreeze; });

const nativeFetch = window.fetch.bind(window);
window.fetch = async (...args) => {
  const response = await nativeFetch(...args);
  try {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
    const method = String(args[1]?.method || 'GET').toUpperCase();
    if (response.ok && url.includes('/api/calendar/events') && method === 'GET') {
      response.clone().json().then((payload) => { enhancedState.calendarEvents = Array.isArray(payload?.events) ? payload.events : []; window.dispatchEvent(new CustomEvent('calendaria:events')); }).catch(() => {});
    }
    if (response.ok && url.includes('/api/ai/analyze') && method === 'POST') {
      response.clone().json().then((payload) => { enhancedState.lastAiEvent = payload?.event || null; window.dispatchEvent(new CustomEvent('calendaria:proposal')); }).catch(() => {});
    }
  } catch {}
  return response;
};

export function getEvent(id) { return enhancedState.calendarEvents.find((event) => event?.id === id || event?.deleteId === id) || null; }
export function showToast(message, error = false) {
  const region = document.getElementById('toastRegion'); if (!region) return;
  const toast = document.createElement('div'); toast.className = `toast ${error ? 'is-error' : 'is-success'}`; toast.textContent = message; region.appendChild(toast); setTimeout(() => toast.remove(), 5000);
}
export function checkedReminders(group) {
  const fixed = [...document.querySelectorAll(`[data-reminder-group="${group}"] input:checked`)].map((input) => Number(input.value));
  const custom = String(document.getElementById(`${group}CustomReminders`)?.value || '').split(',').map((item) => Number(item.trim())).filter((value) => Number.isInteger(value) && value >= 0);
  return [...new Set([...fixed, ...custom])].sort((a, b) => a - b).slice(0, 5);
}
