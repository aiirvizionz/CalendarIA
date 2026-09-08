import { allocateUniqueKey, isValidKey, keyFromName } from './category-key.mjs';

const GOOGLE_EVENT_COLORS = Object.freeze([
  { id: 1, label: 'Lavanda' },
  { id: 2, label: 'Menta' },
  { id: 3, label: 'Uva' },
  { id: 4, label: 'Flamenco' },
  { id: 5, label: 'Girasol' },
  { id: 6, label: 'Mandarina' },
  { id: 7, label: 'Turquesa' },
  { id: 8, label: 'Grafito' },
  { id: 9, label: 'Azul cobalto' },
  { id: 10, label: 'Albahaca' },
  { id: 11, label: 'Tomate' },
]);

const COLOR_BY_LABEL = new Map(GOOGLE_EVENT_COLORS.map((color) => [color.label, color.id]));
const RESTORE_SCROLL_KEY = 'calendaria:event-categories-scroll';

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
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...options,
  });
  const payload = await readJson(response);
  if (!response.ok) {
    const error = new Error(payload?.error?.message || `La solicitud falló (${response.status})`);
    error.requestId = payload?.error?.requestId || '';
    throw error;
  }
  return payload;
}

function setError(message = '') {
  const element = document.getElementById('eventCategoriesError');
  if (!element) return;
  element.textContent = message;
  element.classList.toggle('is-hidden', !message);
}

function formatError(error) {
  return error?.requestId ? `${error.message} · ID ${error.requestId}` : (error?.message || 'No se pudieron guardar las categorías');
}

function savedCategoryForRow(row, savedById, savedByKey) {
  const draftId = String(row.dataset.draftId || '');
  if (draftId.startsWith('saved:')) return savedById.get(draftId.slice(6)) || null;
  if (draftId.startsWith('key:')) return savedByKey.get(draftId.slice(4)) || null;
  return null;
}

function collectCategoryPayload(savedCategories) {
  const rows = [...document.querySelectorAll('.event-category-row')];
  if (!rows.length) throw new Error('No hay categorías para guardar');

  const savedById = new Map(savedCategories.map((item) => [String(item?.id || ''), item]));
  const savedByKey = new Map(savedCategories.map((item) => [String(item?.key || ''), item]));
  const explicitKeys = new Set();
  const rowMetadata = rows.map((row) => {
    const saved = savedCategoryForRow(row, savedById, savedByKey);
    const existingKey = String(saved?.key || '').trim();
    if (existingKey) {
      if (!isValidKey(existingKey) || explicitKeys.has(existingKey)) {
        throw new Error('Una categoría guardada tiene una clave interna inválida');
      }
      explicitKeys.add(existingKey);
    }
    return { row, existingKey };
  });

  const usedKeys = new Set(explicitKeys);
  const names = new Set();

  return rowMetadata.map(({ row, existingKey }, index) => {
    const name = String(row.querySelector('.event-category-name')?.value || '').replace(/\s+/g, ' ').trim();
    const normalizedName = keyFromName(name);
    if (!name || name.length > 40 || !normalizedName) {
      throw new Error('Cada categoría necesita un nombre válido de hasta 40 caracteres');
    }
    if (names.has(normalizedName)) throw new Error('No puedes tener dos categorías con el mismo nombre');
    names.add(normalizedName);

    let key = existingKey;
    if (!key) {
      key = allocateUniqueKey(normalizedName, usedKeys);
      if (!key || !isValidKey(key)) throw new Error('No se pudo generar una clave única para una de las categorías');
      usedKeys.add(key);
    }

    const colorLabel = String(row.querySelector('.event-category-color-name')?.textContent || '').trim();
    const googleColorId = COLOR_BY_LABEL.get(colorLabel);
    if (!googleColorId) throw new Error('Selecciona un color válido para cada categoría');

    return {
      name,
      key,
      googleColorId,
      position: index,
    };
  });
}

async function saveCategories(button) {
  if (button.dataset.safeSaveBusy === 'true') return;
  button.dataset.safeSaveBusy = 'true';
  const originalLabel = button.textContent;
  const status = document.getElementById('eventCategoriesStatus');
  button.disabled = true;
  button.textContent = 'Guardando…';
  if (status) status.textContent = 'Guardando…';
  setError('');

  try {
    const session = await request('/api/session');
    if (!session?.authenticated || !session?.csrfToken) throw new Error('Tu sesión expiró. Vuelve a conectar Google.');

    const current = await request('/api/preferences/event-types');
    const savedCategories = Array.isArray(current?.eventTypes) ? current.eventTypes : [];
    const eventTypes = collectCategoryPayload(savedCategories);

    await request('/api/preferences/event-types', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': session.csrfToken,
        'X-Time-Zone': timeZone(),
      },
      body: JSON.stringify({ eventTypes }),
    });

    if (status) status.textContent = eventTypes.length === 1 ? '1 categoría guardada' : `${eventTypes.length} categorías guardadas`;
    button.textContent = 'Guardado';
    try { sessionStorage.setItem(RESTORE_SCROLL_KEY, String(window.scrollY)); } catch { /* Ignore storage restrictions. */ }
    window.setTimeout(() => window.location.reload(), 300);
  } catch (error) {
    setError(formatError(error));
    if (status) status.textContent = 'No se pudo guardar';
    button.disabled = false;
    button.textContent = originalLabel || 'Guardar cambios';
    delete button.dataset.safeSaveBusy;
  }
}

document.addEventListener('click', (event) => {
  const button = event.target.closest?.('#eventCategoriesSaveButton');
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  saveCategories(button);
}, true);

try {
  const savedScroll = sessionStorage.getItem(RESTORE_SCROLL_KEY);
  if (savedScroll != null) {
    sessionStorage.removeItem(RESTORE_SCROLL_KEY);
    window.requestAnimationFrame(() => window.scrollTo({ top: Number(savedScroll) || 0, behavior: 'auto' }));
  }
} catch {
  // Storage is optional; saving categories does not depend on it.
}
