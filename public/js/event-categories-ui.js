const BASE_CATEGORY_KEYS = new Set(['examen', 'estudio', 'social', 'presentacion', 'tarea', 'otro']);
const GOOGLE_EVENT_COLORS = Object.freeze([
  { id: 1, label: 'Lavanda', hex: '#a4bdfc' },
  { id: 2, label: 'Menta', hex: '#7ae7bf' },
  { id: 3, label: 'Uva', hex: '#dbadff' },
  { id: 4, label: 'Flamenco', hex: '#ff887c' },
  { id: 5, label: 'Girasol', hex: '#fbd75b' },
  { id: 6, label: 'Mandarina', hex: '#ffb878' },
  { id: 7, label: 'Turquesa', hex: '#46d6db' },
  { id: 8, label: 'Grafito', hex: '#e1e1e1' },
  { id: 9, label: 'Azul cobalto', hex: '#5484ed' },
  { id: 10, label: 'Albahaca', hex: '#51b749' },
  { id: 11, label: 'Tomate', hex: '#dc2127' },
]);
const ALLOWED_COLOR_IDS = new Set(GOOGLE_EVENT_COLORS.map((color) => color.id));
const MAX_CATEGORIES = 12;

let uiSequence = 0;

const state = {
  session: { authenticated: false, integrations: null },
  csrfToken: '',
  categories: [],
  draft: [],
  loaded: false,
  dirty: false,
  saving: false,
  colorEditingId: '',
  colorReturnFocus: null,
};

const $ = (id) => document.getElementById(id);

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
  const method = String(options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers || {});
  headers.set('X-Time-Zone', timeZone());
  if (options.body != null && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && state.csrfToken) {
    headers.set('X-CSRF-Token', state.csrfToken);
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

function errorMessage(error) {
  if (error?.requestId) return `${error.message} · ID ${error.requestId}`;
  return error?.message || 'Ocurrió un error inesperado';
}

function showToast(message, type = 'info') {
  const region = $('toastRegion');
  if (!region) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type === 'error' ? 'is-error' : type === 'success' ? 'is-success' : ''}`;
  toast.textContent = message;
  region.appendChild(toast);
  window.setTimeout(() => toast.remove(), 5200);
}

function injectStyles() {
  if (document.querySelector('link[data-event-categories-styles]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/event-categories.css?v=1';
  link.dataset.eventCategoriesStyles = 'true';
  document.head.appendChild(link);
}

function createSection() {
  if ($('eventCategoriesSection')) return;
  const shell = document.querySelector('.app-shell');
  if (!shell) return;

  const section = document.createElement('section');
  section.id = 'eventCategoriesSection';
  section.className = 'event-categories-card';
  section.setAttribute('aria-labelledby', 'eventCategoriesTitle');
  section.innerHTML = `
    <div class="event-categories-heading">
      <div class="event-categories-heading-copy">
        <h2 id="eventCategoriesTitle">Categorías de eventos</h2>
        <p class="event-categories-description">Personaliza tus categorías de eventos, eligiendo nombres y colores para las distintas partes de tu vida.</p>
        <p class="event-categories-google-note">El color asignado a cada categoría se mostrará en los eventos que crees en Google Calendar.</p>
      </div>
      <span id="eventCategoriesStatus" class="event-categories-status">Verificando…</span>
    </div>

    <div id="eventCategoriesLocked" class="event-categories-locked">
      <span class="event-categories-lock-icon" aria-hidden="true">✦</span>
      <div>
        <strong id="eventCategoriesLockedTitle">Conecta Google para personalizar tus categorías</strong>
        <p id="eventCategoriesLockedText">Tus categorías se vinculan de forma segura a tu cuenta.</p>
      </div>
    </div>

    <div id="eventCategoriesEditor" class="event-categories-editor is-hidden">
      <div id="eventCategoriesList" class="event-categories-list"></div>
      <p id="eventCategoriesError" class="event-categories-error is-hidden" role="alert"></p>

      <div class="event-categories-toolbar">
        <span id="eventCategoriesToolbarCopy" class="event-categories-toolbar-copy"></span>
        <button id="eventCategoriesAddButton" class="button button-secondary" type="button">+ Añadir categoría</button>
      </div>

      <div class="event-categories-actions">
        <button id="eventCategoriesDiscardButton" class="button button-ghost" type="button">Descartar cambios</button>
        <button id="eventCategoriesSaveButton" class="button button-primary" type="button">Guardar cambios</button>
      </div>
    </div>`;
  shell.appendChild(section);

  const picker = document.createElement('div');
  picker.id = 'eventCategoryColorPicker';
  picker.className = 'event-category-color-picker is-hidden';
  picker.setAttribute('role', 'dialog');
  picker.setAttribute('aria-modal', 'true');
  picker.setAttribute('aria-labelledby', 'eventCategoryColorPickerTitle');
  picker.innerHTML = `
    <div class="event-category-color-panel">
      <div class="event-category-color-header">
        <div>
          <h3 id="eventCategoryColorPickerTitle">Color de la categoría</h3>
          <p>Elige un color compatible con eventos de Google Calendar.</p>
        </div>
        <button id="eventCategoryColorClose" class="event-category-color-close" type="button" aria-label="Cerrar selector de color">×</button>
      </div>
      <div id="eventCategoryColorOptions" class="event-category-color-options"></div>
    </div>`;
  document.body.appendChild(picker);
}

function integrationEnabled(name) {
  return Boolean(state.session.integrations?.[name]);
}

function colorById(id) {
  return GOOGLE_EVENT_COLORS.find((color) => color.id === Number(id)) || GOOGLE_EVENT_COLORS[7];
}

function keyFromName(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-MX')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function isValidKey(value) {
  return String(value || '').length <= 80 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(value || ''));
}

function nextUiId(item) {
  if (item?._uiId) return item._uiId;
  if (item?.id) return `saved:${item.id}`;
  if (item?.key) return `key:${item.key}`;
  uiSequence += 1;
  return `draft:${uiSequence}`;
}

function cloneCategories(items) {
  return items.map((item) => ({
    id: String(item.id || ''),
    name: String(item.name || '').trim(),
    key: String(item.key || '').trim(),
    googleColorId: Number(item.googleColorId),
    position: Number(item.position),
    _uiId: nextUiId(item),
  }));
}

function normalizeCategories(items) {
  if (!Array.isArray(items)) return [];
  return cloneCategories(items)
    .filter((item) => item.name && item.key && isValidKey(item.key) && ALLOWED_COLOR_IDS.has(item.googleColorId))
    .sort((a, b) => a.position - b.position);
}

function categorySavedLabel(count) {
  return count === 1 ? '1 categoría guardada' : `${count} categorías guardadas`;
}

function setStatus(text, kind = '') {
  const status = $('eventCategoriesStatus');
  if (!status) return;
  status.textContent = text;
  status.classList.toggle('is-dirty', kind === 'dirty');
  status.classList.toggle('is-saved', kind === 'saved');
}

function setEditorError(message = '') {
  const error = $('eventCategoriesError');
  if (!error) return;
  error.textContent = message;
  error.classList.toggle('is-hidden', !message);
}

function renderAccess() {
  const authenticated = Boolean(state.session.authenticated);
  const googleConfigured = integrationEnabled('google');
  const locked = $('eventCategoriesLocked');
  const editor = $('eventCategoriesEditor');
  if (!locked || !editor) return;

  if (!authenticated || !googleConfigured) {
    locked.classList.remove('is-hidden');
    editor.classList.add('is-hidden');
    $('eventCategoriesLockedTitle').textContent = googleConfigured
      ? 'Conecta Google para personalizar tus categorías'
      : 'Google OAuth no está disponible';
    $('eventCategoriesLockedText').textContent = googleConfigured
      ? 'Tus categorías se vinculan de forma segura a tu cuenta.'
      : 'Esta función necesita la integración de Google activa.';
    setStatus(authenticated ? 'No disponible' : 'Requiere sesión');
    return;
  }

  locked.classList.add('is-hidden');
  editor.classList.toggle('is-hidden', !state.loaded);
  if (!state.loaded) setStatus('Cargando…');
}

function renderCategoryControls() {
  if (!state.loaded || !state.categories.length) return;

  const categoryOptions = $('categoryOptions');
  if (categoryOptions) {
    const previous = categoryOptions.querySelector('input:checked')?.value || '';
    categoryOptions.replaceChildren();
    for (const category of state.categories) {
      const label = document.createElement('label');
      label.className = 'choice';
      label.dataset.eventTypeChoice = 'true';
      label.style.setProperty('--event-type-color', colorById(category.googleColorId).hex);

      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'category';
      input.value = category.key;
      input.checked = previous === category.key;

      const text = document.createElement('span');
      text.textContent = category.name;
      label.append(input, text);
      categoryOptions.appendChild(label);
    }
  }

  const reviewSelect = $('reviewCategoryInput');
  if (reviewSelect) {
    const previous = reviewSelect.value;
    reviewSelect.replaceChildren();
    for (const category of state.categories) {
      const option = document.createElement('option');
      option.value = category.key;
      option.textContent = category.name;
      reviewSelect.appendChild(option);
    }
    if (previous && state.categories.some((category) => category.key === previous)) reviewSelect.value = previous;
    else reviewSelect.selectedIndex = -1;
  }
}

function updateEditorActions() {
  const add = $('eventCategoriesAddButton');
  const discard = $('eventCategoriesDiscardButton');
  const save = $('eventCategoriesSaveButton');
  if (!add || !discard || !save) return;

  add.disabled = state.saving || state.draft.length >= MAX_CATEGORIES;
  discard.disabled = state.saving || !state.dirty;
  save.disabled = state.saving || !state.dirty;
  save.textContent = state.saving ? 'Guardando…' : 'Guardar cambios';
  $('eventCategoriesToolbarCopy').textContent = `${state.draft.length}/${MAX_CATEGORIES} categorías · Los cambios se aplican a nuevos eventos.`;
}

function markDirty() {
  state.dirty = true;
  setEditorError('');
  setStatus('Cambios sin guardar', 'dirty');
  updateEditorActions();
}

function moveDraft(from, to) {
  if (to < 0 || to >= state.draft.length || from === to) return;
  const [item] = state.draft.splice(from, 1);
  state.draft.splice(to, 0, item);
  markDirty();
  renderEditor();
}

function beginPointerReorder(event, row, draftId) {
  if (state.saving) return;
  if (event.pointerType === 'mouse' && event.button !== 0) return;

  event.preventDefault();
  const handle = event.currentTarget;
  const pointerId = event.pointerId;
  let moved = false;
  row.classList.add('is-dragging');
  document.body.classList.add('is-category-dragging');

  try { handle.setPointerCapture(pointerId); } catch { /* No-op. */ }

  const onMove = (moveEvent) => {
    if (moveEvent.pointerId !== pointerId) return;
    moveEvent.preventDefault();

    if (moveEvent.clientY < 72) window.scrollBy({ top: -14, behavior: 'auto' });
    if (moveEvent.clientY > window.innerHeight - 72) window.scrollBy({ top: 14, behavior: 'auto' });

    const target = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY)?.closest('.event-category-row');
    if (!target || target === row) return;

    const targetId = target.dataset.draftId;
    const from = state.draft.findIndex((category) => category._uiId === draftId);
    const to = state.draft.findIndex((category) => category._uiId === targetId);
    if (from < 0 || to < 0 || from === to) return;

    const [item] = state.draft.splice(from, 1);
    state.draft.splice(to, 0, item);
    const list = $('eventCategoriesList');
    if (from < to) list?.insertBefore(row, target.nextSibling);
    else list?.insertBefore(row, target);
    moved = true;
  };

  const finish = (finishEvent) => {
    if (finishEvent.pointerId !== pointerId) return;
    handle.removeEventListener('pointermove', onMove);
    handle.removeEventListener('pointerup', finish);
    handle.removeEventListener('pointercancel', finish);
    try { handle.releasePointerCapture(pointerId); } catch { /* No-op. */ }
    row.classList.remove('is-dragging');
    document.body.classList.remove('is-category-dragging');
    if (moved) {
      markDirty();
      renderEditor();
    }
  };

  handle.addEventListener('pointermove', onMove);
  handle.addEventListener('pointerup', finish);
  handle.addEventListener('pointercancel', finish);
}

function renderEditor() {
  const list = $('eventCategoriesList');
  if (!list || !state.loaded) return;
  list.replaceChildren();

  state.draft.forEach((category, index) => {
    const row = document.createElement('div');
    row.className = 'event-category-row';
    row.dataset.draftId = category._uiId;

    const handle = document.createElement('button');
    handle.type = 'button';
    handle.className = 'event-category-drag-handle';
    handle.title = 'Arrastra para cambiar el orden';
    handle.setAttribute('aria-label', `Reordenar ${category.name || `categoría ${index + 1}`}`);
    handle.innerHTML = '<svg viewBox="0 0 18 24" aria-hidden="true"><circle cx="5" cy="5" r="1.7"/><circle cx="13" cy="5" r="1.7"/><circle cx="5" cy="12" r="1.7"/><circle cx="13" cy="12" r="1.7"/><circle cx="5" cy="19" r="1.7"/><circle cx="13" cy="19" r="1.7"/></svg>';
    handle.addEventListener('pointerdown', (event) => beginPointerReorder(event, row, category._uiId));
    handle.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveDraft(index, index - 1);
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        moveDraft(index, index + 1);
      }
    });

    const fields = document.createElement('div');
    fields.className = 'event-category-fields';

    const nameField = document.createElement('label');
    nameField.className = 'event-category-field';
    const nameLabel = document.createElement('span');
    nameLabel.className = 'event-category-field-label';
    nameLabel.textContent = 'Nombre';
    const name = document.createElement('input');
    name.type = 'text';
    name.className = 'event-category-name';
    name.maxLength = 40;
    name.value = category.name;
    name.placeholder = 'Ej. Universidad';
    name.setAttribute('aria-label', `Nombre de la categoría ${index + 1}`);
    name.addEventListener('input', () => {
      const current = state.draft.find((item) => item._uiId === category._uiId);
      if (current) current.name = name.value;
      markDirty();
    });
    nameField.append(nameLabel, name);

    const colorField = document.createElement('div');
    colorField.className = 'event-category-field';
    const colorLabel = document.createElement('span');
    colorLabel.className = 'event-category-field-label';
    colorLabel.textContent = 'Color';
    const selectedColor = colorById(category.googleColorId);
    const colorButton = document.createElement('button');
    colorButton.type = 'button';
    colorButton.className = 'event-category-color-trigger';
    colorButton.style.setProperty('--category-color', selectedColor.hex);
    colorButton.setAttribute('aria-label', `Cambiar color de ${category.name || `categoría ${index + 1}`}`);
    colorButton.innerHTML = `
      <span class="event-category-color-swatch" aria-hidden="true"></span>
      <span class="event-category-color-name">${selectedColor.label}</span>
      <svg class="event-category-color-chevron" viewBox="0 0 20 20" aria-hidden="true"><path d="m5 7 5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    colorButton.addEventListener('click', () => openColorPicker(category._uiId, colorButton));
    colorField.append(colorLabel, colorButton);
    fields.append(nameField, colorField);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'event-category-delete';
    remove.title = 'Eliminar categoría';
    remove.setAttribute('aria-label', `Eliminar ${category.name || 'categoría'}`);
    remove.disabled = state.saving || state.draft.length <= 1;
    remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V5h6v2m-8 0 1 13h8l1-13M10 10v7m4-7v7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    remove.addEventListener('click', () => {
      if (state.draft.length <= 1) return;
      state.draft = state.draft.filter((item) => item._uiId !== category._uiId);
      markDirty();
      renderEditor();
    });

    row.append(handle, fields, remove);
    list.appendChild(row);
  });

  if (!state.dirty) setStatus(categorySavedLabel(state.categories.length), 'saved');
  updateEditorActions();
}

function renderColorPickerOptions() {
  const container = $('eventCategoryColorOptions');
  if (!container) return;
  container.replaceChildren();
  const category = state.draft.find((item) => item._uiId === state.colorEditingId);
  if (!category) return;

  for (const color of GOOGLE_EVENT_COLORS) {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'event-category-color-option';
    option.classList.toggle('is-selected', color.id === category.googleColorId);
    option.style.setProperty('--category-color', color.hex);
    option.setAttribute('aria-pressed', String(color.id === category.googleColorId));
    option.innerHTML = `
      <span class="event-category-color-option-swatch" aria-hidden="true"></span>
      <span class="event-category-color-option-label">${color.label}</span>
      <span class="event-category-color-option-check" aria-hidden="true">✓</span>`;
    option.addEventListener('click', () => {
      const current = state.draft.find((item) => item._uiId === state.colorEditingId);
      if (!current) return;
      current.googleColorId = color.id;
      markDirty();
      closeColorPicker();
      renderEditor();
    });
    container.appendChild(option);
  }
}

function openColorPicker(draftId, returnFocus) {
  const picker = $('eventCategoryColorPicker');
  if (!picker) return;
  state.colorEditingId = draftId;
  state.colorReturnFocus = returnFocus || null;
  renderColorPickerOptions();
  picker.classList.remove('is-hidden');
  document.body.classList.add('is-color-picker-open');
  window.setTimeout(() => $('eventCategoryColorClose')?.focus(), 0);
}

function closeColorPicker() {
  const picker = $('eventCategoryColorPicker');
  if (!picker || picker.classList.contains('is-hidden')) return;
  picker.classList.add('is-hidden');
  document.body.classList.remove('is-color-picker-open');
  state.colorEditingId = '';
  const focusTarget = state.colorReturnFocus;
  state.colorReturnFocus = null;
  window.setTimeout(() => focusTarget?.focus?.(), 0);
}

function nextAvailableColorId() {
  const used = new Set(state.draft.map((category) => category.googleColorId));
  return GOOGLE_EVENT_COLORS.find((color) => !used.has(color.id))?.id || 9;
}

function addDraftCategory() {
  if (state.draft.length >= MAX_CATEGORIES) return;
  const existingNames = new Set(state.draft.map((category) => keyFromName(category.name)));
  let suffix = 1;
  let name = 'Nueva categoría';
  while (existingNames.has(keyFromName(name))) {
    suffix += 1;
    name = `Nueva categoría ${suffix}`;
  }

  uiSequence += 1;
  state.draft.push({
    id: '',
    name,
    key: '',
    googleColorId: nextAvailableColorId(),
    position: state.draft.length,
    _uiId: `draft:${uiSequence}`,
  });
  markDirty();
  renderEditor();

  const inputs = document.querySelectorAll('.event-category-name');
  const last = inputs[inputs.length - 1];
  last?.focus();
  last?.select?.();
}

function validateDraft() {
  if (state.draft.length < 1 || state.draft.length > MAX_CATEGORIES) {
    throw new Error(`Debes tener entre 1 y ${MAX_CATEGORIES} categorías`);
  }

  const names = new Set();
  const keys = new Set();
  return state.draft.map((category, index) => {
    const name = String(category.name || '').replace(/\s+/g, ' ').trim();
    const normalizedName = keyFromName(name);
    const existingKey = String(category.key || '').trim();
    const key = existingKey || normalizedName;
    const googleColorId = Number(category.googleColorId);

    if (!name || name.length > 40 || !normalizedName) throw new Error('Cada categoría necesita un nombre válido de hasta 40 caracteres');
    if (names.has(normalizedName)) throw new Error('No puedes tener dos categorías con el mismo nombre');
    if (!isValidKey(key) || keys.has(key)) throw new Error('No se pudo generar una clave única para una de las categorías');
    if (!ALLOWED_COLOR_IDS.has(googleColorId)) throw new Error('Selecciona un color válido');
    names.add(normalizedName);
    keys.add(key);

    return {
      name,
      key: existingKey,
      googleColorId,
      position: index,
    };
  });
}

async function savePreferences() {
  let categories;
  try {
    categories = validateDraft();
  } catch (error) {
    setEditorError(errorMessage(error));
    return;
  }

  state.saving = true;
  setEditorError('');
  setStatus('Guardando…');
  updateEditorActions();

  try {
    const result = await request('/api/preferences/event-types', {
      method: 'PUT',
      body: JSON.stringify({ eventTypes: categories }),
    });
    const saved = normalizeCategories(result?.eventTypes);
    if (!saved.length) throw new Error('No se pudieron recuperar las categorías guardadas');
    state.categories = saved;
    state.draft = cloneCategories(saved);
    state.dirty = false;
    renderCategoryControls();
    renderEditor();
    showToast('Categorías guardadas', 'success');
  } catch (error) {
    setEditorError(errorMessage(error));
    setStatus('No se pudo guardar');
  } finally {
    state.saving = false;
    updateEditorActions();
  }
}

function discardChanges() {
  state.draft = cloneCategories(state.categories);
  state.dirty = false;
  setEditorError('');
  renderEditor();
}

async function loadCategories() {
  state.loaded = false;
  renderAccess();
  try {
    const result = await request('/api/preferences/event-types');
    const categories = normalizeCategories(result?.eventTypes);
    if (!categories.length) throw new Error('No se encontraron categorías');
    state.categories = categories;
    state.draft = cloneCategories(categories);
    state.loaded = true;
    state.dirty = false;
    renderAccess();
    renderCategoryControls();
    renderEditor();
  } catch (error) {
    state.loaded = false;
    renderAccess();
    $('eventCategoriesEditor')?.classList.remove('is-hidden');
    setEditorError(errorMessage(error));
    setStatus('Error de sincronización');
  }
}

async function syncSession({ reloadPreferences = true } = {}) {
  try {
    const session = await request('/api/session');
    state.session = session || { authenticated: false, integrations: null };
    state.csrfToken = session?.csrfToken || '';
  } catch {
    state.session = { authenticated: false, integrations: null };
    state.csrfToken = '';
  }

  if (!state.session.authenticated || !integrationEnabled('google')) {
    state.categories = [];
    state.draft = [];
    state.loaded = false;
    state.dirty = false;
    renderAccess();
    return;
  }

  renderAccess();
  if (reloadPreferences) await loadCategories();
}

function selectedReminders(group) {
  return [...document.querySelectorAll(`[data-reminder-group="${group}"] input:checked`)]
    .map((input) => Number(input.value))
    .filter(Number.isInteger)
    .filter((value, index, values) => values.indexOf(value) === index)
    .sort((a, b) => a - b);
}

function categoryExists(key) {
  return state.categories.some((category) => category.key === key);
}

function validateEventInput(input) {
  if (!input.title || input.title.length > 120) throw new Error('Escribe un título válido');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error('Selecciona una fecha válida');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time)) throw new Error('Selecciona una hora válida');
  if (!input.category || !categoryExists(input.category)) throw new Error('Selecciona una categoría válida');
  return input;
}

function setBusy(button, busy, label) {
  if (!button) return;
  if (!button.dataset.eventCategoriesDefaultLabel) button.dataset.eventCategoriesDefaultLabel = button.textContent;
  button.disabled = busy;
  button.textContent = busy ? label : button.dataset.eventCategoriesDefaultLabel;
}

function scheduleAgendaRefresh() {
  window.setTimeout(() => {
    const button = $('refreshEventsButton');
    if (button && !button.disabled) button.click();
  }, 350);
}

async function saveCustomEvent(input, button, busyLabel) {
  setBusy(button, true, busyLabel);
  try {
    const result = await request('/api/calendar/events', {
      method: 'POST',
      body: JSON.stringify(validateEventInput(input)),
    });
    showToast(
      result?.duplicate
        ? 'Ese evento ya existía en Google Calendar; no se creó una copia.'
        : 'Evento guardado en Google Calendar',
      'success',
    );
    scheduleAgendaRefresh();
    return true;
  } catch (error) {
    showToast(errorMessage(error), 'error');
    return false;
  } finally {
    setBusy(button, false, '');
  }
}

async function handleManualSubmit(event) {
  if (!state.loaded || !state.session.authenticated) return;
  const category = document.querySelector('#categoryOptions input:checked')?.value || '';
  if (!category || BASE_CATEGORY_KEYS.has(category)) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  const saved = await saveCustomEvent({
    title: $('manualTitle')?.value.trim() || '',
    date: $('manualDate')?.value || '',
    time: $('manualTime')?.value || '',
    category,
    reminders: selectedReminders('manual'),
  }, $('manualSubmitButton'), 'Guardando…');
  if (saved && $('manualTitle')) $('manualTitle').value = '';
}

async function handleReviewConfirm(event) {
  if (!state.loaded || !state.session.authenticated) return;
  const category = $('reviewCategoryInput')?.value || '';
  if (!category || BASE_CATEGORY_KEYS.has(category)) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  const saved = await saveCustomEvent({
    title: $('reviewTitleInput')?.value.trim() || '',
    date: $('reviewDateInput')?.value || '',
    time: $('reviewTimeInput')?.value || '',
    category,
    reminders: selectedReminders('review'),
  }, $('confirmReviewButton'), 'Guardando…');

  if (!saved) return;
  if ($('aiText')) $('aiText').value = '';
  if ($('aiCharacterCount')) $('aiCharacterCount').textContent = '0/3000';
  if ($('removeImageButton') && !$('removeImageButton').classList.contains('is-hidden')) {
    $('removeImageButton').click();
  }
  $('reviewCategoryInput').selectedIndex = -1;
  document.querySelector('.tab.is-active')?.click();
}

function bindEvents() {
  $('eventCategoriesAddButton')?.addEventListener('click', addDraftCategory);
  $('eventCategoriesDiscardButton')?.addEventListener('click', discardChanges);
  $('eventCategoriesSaveButton')?.addEventListener('click', savePreferences);
  $('eventCategoryColorClose')?.addEventListener('click', closeColorPicker);
  $('eventCategoryColorPicker')?.addEventListener('click', (event) => {
    if (event.target === $('eventCategoryColorPicker')) closeColorPicker();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeColorPicker();
  });
  $('manualForm')?.addEventListener('submit', handleManualSubmit, true);
  $('confirmReviewButton')?.addEventListener('click', handleReviewConfirm, true);
  $('authButton')?.addEventListener('click', () => {
    window.setTimeout(() => syncSession({ reloadPreferences: true }), 900);
  });
}

async function initialize() {
  injectStyles();
  createSection();
  bindEvents();
  renderAccess();
  await syncSession({ reloadPreferences: true });
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initialize, { once: true });
} else {
  queueMicrotask(initialize);
}
