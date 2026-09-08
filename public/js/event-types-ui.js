const BASE_CATEGORY_KEYS = new Set(['examen', 'estudio', 'social', 'presentacion', 'tarea', 'otro']);
const EVENT_TYPE_COLORS = Object.freeze([
  { id: 11, label: 'Rojo', hex: '#b81f25' },
  { id: 2, label: 'Verde', hex: '#4fae8a' },
  { id: 6, label: 'Naranja', hex: '#d98b3c' },
  { id: 9, label: 'Azul', hex: '#426fc8' },
  { id: 4, label: 'Coral', hex: '#c96862' },
  { id: 8, label: 'Gris', hex: '#8f949b' },
]);
const ALLOWED_COLOR_IDS = new Set(EVENT_TYPE_COLORS.map((color) => color.id));
const MAX_EVENT_TYPES = 12;

const state = {
  session: { authenticated: false, integrations: null },
  csrfToken: '',
  eventTypes: [],
  draft: [],
  loaded: false,
  dirty: false,
  saving: false,
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
  if (document.querySelector('link[data-event-types-styles]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/event-types.css?v=1';
  link.dataset.eventTypesStyles = 'true';
  document.head.appendChild(link);
}

function createSection() {
  if ($('eventTypesSection')) return;
  const shell = document.querySelector('.app-shell');
  if (!shell) return;

  const section = document.createElement('section');
  section.id = 'eventTypesSection';
  section.className = 'event-types-card';
  section.setAttribute('aria-labelledby', 'eventTypesTitle');
  section.innerHTML = `
    <div class="event-types-heading">
      <div>
        <p class="eyebrow">Personalización</p>
        <h2 id="eventTypesTitle">Tipos de evento</h2>
        <p class="event-types-description">Crea tus propias categorías, cambia su nombre, orden y color. Las preferencias se guardan en Supabase y el color seleccionado se aplica al crear el evento en Google Calendar.</p>
      </div>
      <span id="eventTypesStatus" class="event-types-status">Verificando…</span>
    </div>
    <div id="eventTypesLocked" class="event-types-locked">
      <span class="event-types-lock-icon" aria-hidden="true">✦</span>
      <div><strong id="eventTypesLockedTitle">Conecta Google para personalizar</strong><br><span id="eventTypesLockedText">Tus tipos de evento se asocian de forma segura a tu cuenta.</span></div>
    </div>
    <div id="eventTypesEditor" class="event-types-editor is-hidden">
      <div id="eventTypesList" class="event-types-list"></div>
      <p id="eventTypesError" class="event-types-error is-hidden" role="alert"></p>
      <div class="event-types-toolbar">
        <span id="eventTypesToolbarCopy" class="event-types-toolbar-copy"></span>
        <button id="eventTypesAddButton" class="button button-secondary" type="button">+ Añadir tipo</button>
      </div>
      <div class="event-types-actions">
        <button id="eventTypesDiscardButton" class="button button-ghost" type="button">Descartar cambios</button>
        <button id="eventTypesSaveButton" class="button button-primary" type="button">Guardar cambios</button>
      </div>
    </div>`;
  shell.appendChild(section);
}

function integrationEnabled(name) {
  return Boolean(state.session.integrations?.[name]);
}

function colorById(id) {
  return EVENT_TYPE_COLORS.find((color) => color.id === Number(id)) || EVENT_TYPE_COLORS[5];
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

function cloneEventTypes(items) {
  return items.map((item) => ({
    id: String(item.id || ''),
    name: String(item.name || '').trim(),
    key: String(item.key || '').trim(),
    googleColorId: Number(item.googleColorId),
    position: Number(item.position),
  }));
}

function normalizeEventTypes(items) {
  if (!Array.isArray(items)) return [];
  return cloneEventTypes(items)
    .filter((item) => item.name && item.key && isValidKey(item.key) && ALLOWED_COLOR_IDS.has(item.googleColorId))
    .sort((a, b) => a.position - b.position);
}

function setStatus(text, kind = '') {
  const status = $('eventTypesStatus');
  if (!status) return;
  status.textContent = text;
  status.classList.toggle('is-dirty', kind === 'dirty');
  status.classList.toggle('is-saved', kind === 'saved');
}

function setEditorError(message = '') {
  const error = $('eventTypesError');
  if (!error) return;
  error.textContent = message;
  error.classList.toggle('is-hidden', !message);
}

function renderAccess() {
  const authenticated = Boolean(state.session.authenticated);
  const googleConfigured = integrationEnabled('google');
  const locked = $('eventTypesLocked');
  const editor = $('eventTypesEditor');
  if (!locked || !editor) return;

  if (!authenticated || !googleConfigured) {
    locked.classList.remove('is-hidden');
    editor.classList.add('is-hidden');
    $('eventTypesLockedTitle').textContent = googleConfigured
      ? 'Conecta Google para personalizar'
      : 'Google OAuth no está disponible';
    $('eventTypesLockedText').textContent = googleConfigured
      ? 'Tus tipos de evento se asocian de forma segura a tu cuenta.'
      : 'Esta función necesita la integración de Google activa.';
    setStatus(authenticated ? 'No disponible' : 'Requiere sesión');
    return;
  }

  locked.classList.add('is-hidden');
  editor.classList.toggle('is-hidden', !state.loaded);
  if (!state.loaded) setStatus('Cargando…');
}

function renderCategoryControls() {
  if (!state.loaded || !state.eventTypes.length) return;

  const categoryOptions = $('categoryOptions');
  if (categoryOptions) {
    const previous = categoryOptions.querySelector('input:checked')?.value || '';
    categoryOptions.replaceChildren();
    for (const type of state.eventTypes) {
      const label = document.createElement('label');
      label.className = 'choice';
      label.dataset.eventTypeChoice = 'true';
      label.style.setProperty('--event-type-color', colorById(type.googleColorId).hex);

      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'category';
      input.value = type.key;
      input.checked = previous === type.key;

      const text = document.createElement('span');
      text.textContent = type.name;
      label.append(input, text);
      categoryOptions.appendChild(label);
    }
  }

  const reviewSelect = $('reviewCategoryInput');
  if (reviewSelect) {
    const previous = reviewSelect.value;
    reviewSelect.replaceChildren();
    for (const type of state.eventTypes) {
      const option = document.createElement('option');
      option.value = type.key;
      option.textContent = type.name;
      reviewSelect.appendChild(option);
    }
    if (previous && state.eventTypes.some((type) => type.key === previous)) reviewSelect.value = previous;
    else reviewSelect.selectedIndex = -1;
  }
}

function updateEditorActions() {
  const add = $('eventTypesAddButton');
  const discard = $('eventTypesDiscardButton');
  const save = $('eventTypesSaveButton');
  if (!add || !discard || !save) return;
  add.disabled = state.saving || state.draft.length >= MAX_EVENT_TYPES;
  discard.disabled = state.saving || !state.dirty;
  save.disabled = state.saving || !state.dirty;
  save.textContent = state.saving ? 'Guardando…' : 'Guardar cambios';
  $('eventTypesToolbarCopy').textContent = `${state.draft.length}/${MAX_EVENT_TYPES} tipos · Los cambios no modifican eventos ya existentes.`;
}

function markDirty() {
  state.dirty = true;
  setEditorError('');
  setStatus('Cambios sin guardar', 'dirty');
  updateEditorActions();
}

function renderEditor() {
  const list = $('eventTypesList');
  if (!list || !state.loaded) return;
  list.replaceChildren();

  state.draft.forEach((type, index) => {
    const row = document.createElement('div');
    row.className = 'event-type-row';

    const order = document.createElement('div');
    order.className = 'event-type-order';

    const up = document.createElement('button');
    up.type = 'button';
    up.className = 'event-type-order-button';
    up.textContent = '↑';
    up.title = 'Mover arriba';
    up.setAttribute('aria-label', `Mover ${type.name || 'tipo'} arriba`);
    up.disabled = state.saving || index === 0;
    up.addEventListener('click', () => moveDraft(index, index - 1));

    const down = document.createElement('button');
    down.type = 'button';
    down.className = 'event-type-order-button';
    down.textContent = '↓';
    down.title = 'Mover abajo';
    down.setAttribute('aria-label', `Mover ${type.name || 'tipo'} abajo`);
    down.disabled = state.saving || index === state.draft.length - 1;
    down.addEventListener('click', () => moveDraft(index, index + 1));
    order.append(up, down);

    const name = document.createElement('input');
    name.type = 'text';
    name.className = 'event-type-name';
    name.maxLength = 40;
    name.value = type.name;
    name.placeholder = 'Nombre del tipo';
    name.setAttribute('aria-label', `Nombre del tipo ${index + 1}`);
    name.addEventListener('input', () => {
      state.draft[index].name = name.value;
      markDirty();
    });

    const colorWrap = document.createElement('div');
    colorWrap.className = 'event-type-color-wrap';
    const swatch = document.createElement('span');
    swatch.className = 'event-type-swatch';
    swatch.style.background = colorById(type.googleColorId).hex;
    swatch.style.color = colorById(type.googleColorId).hex;
    swatch.setAttribute('aria-hidden', 'true');

    const color = document.createElement('select');
    color.className = 'event-type-color';
    color.setAttribute('aria-label', `Color de ${type.name || `tipo ${index + 1}`}`);
    for (const optionColor of EVENT_TYPE_COLORS) {
      const option = document.createElement('option');
      option.value = String(optionColor.id);
      option.textContent = optionColor.label;
      color.appendChild(option);
    }
    color.value = String(type.googleColorId);
    color.addEventListener('change', () => {
      state.draft[index].googleColorId = Number(color.value);
      const selectedColor = colorById(color.value);
      swatch.style.background = selectedColor.hex;
      swatch.style.color = selectedColor.hex;
      markDirty();
    });
    colorWrap.append(swatch, color);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'event-type-delete';
    remove.textContent = '×';
    remove.title = 'Eliminar tipo';
    remove.setAttribute('aria-label', `Eliminar ${type.name || 'tipo'}`);
    remove.disabled = state.saving || state.draft.length <= 1;
    remove.addEventListener('click', () => {
      if (state.draft.length <= 1) return;
      state.draft.splice(index, 1);
      markDirty();
      renderEditor();
    });

    row.append(order, name, colorWrap, remove);
    list.appendChild(row);
  });

  if (!state.dirty) setStatus(`${state.eventTypes.length} tipos guardados`, 'saved');
  updateEditorActions();
}

function moveDraft(from, to) {
  if (to < 0 || to >= state.draft.length || from === to) return;
  const [item] = state.draft.splice(from, 1);
  state.draft.splice(to, 0, item);
  markDirty();
  renderEditor();
}

function addDraftType() {
  if (state.draft.length >= MAX_EVENT_TYPES) return;
  const existingNames = new Set(state.draft.map((type) => keyFromName(type.name)));
  let suffix = 1;
  let name = 'Nuevo tipo';
  while (existingNames.has(keyFromName(name))) {
    suffix += 1;
    name = `Nuevo tipo ${suffix}`;
  }
  state.draft.push({
    id: '',
    name,
    key: '',
    googleColorId: 8,
    position: state.draft.length,
  });
  markDirty();
  renderEditor();
  const inputs = document.querySelectorAll('.event-type-name');
  const last = inputs[inputs.length - 1];
  last?.focus();
  last?.select?.();
}

function validateDraft() {
  if (state.draft.length < 1 || state.draft.length > MAX_EVENT_TYPES) {
    throw new Error(`Debes tener entre 1 y ${MAX_EVENT_TYPES} tipos de evento`);
  }

  const names = new Set();
  const keys = new Set();
  return state.draft.map((type, index) => {
    const name = String(type.name || '').replace(/\s+/g, ' ').trim();
    const normalizedName = keyFromName(name);
    const existingKey = String(type.key || '').trim();
    const key = existingKey || normalizedName;
    const googleColorId = Number(type.googleColorId);

    if (!name || name.length > 40 || !normalizedName) throw new Error('Cada tipo necesita un nombre válido de hasta 40 caracteres');
    if (names.has(normalizedName)) throw new Error('No puedes tener dos tipos con el mismo nombre');
    if (!isValidKey(key) || keys.has(key)) throw new Error('No se pudo generar una clave única para uno de los tipos');
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
  let eventTypes;
  try {
    eventTypes = validateDraft();
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
      body: JSON.stringify({ eventTypes }),
    });
    const saved = normalizeEventTypes(result?.eventTypes);
    if (!saved.length) throw new Error('Supabase no devolvió tipos de evento válidos');
    state.eventTypes = saved;
    state.draft = cloneEventTypes(saved);
    state.dirty = false;
    renderCategoryControls();
    renderEditor();
    showToast('Tipos de evento guardados en Supabase', 'success');
  } catch (error) {
    setEditorError(errorMessage(error));
    setStatus('No se pudo guardar');
  } finally {
    state.saving = false;
    updateEditorActions();
  }
}

function discardChanges() {
  state.draft = cloneEventTypes(state.eventTypes);
  state.dirty = false;
  setEditorError('');
  renderEditor();
}

async function loadEventTypes() {
  state.loaded = false;
  renderAccess();
  try {
    const result = await request('/api/preferences/event-types');
    const eventTypes = normalizeEventTypes(result?.eventTypes);
    if (!eventTypes.length) throw new Error('No se encontraron tipos de evento');
    state.eventTypes = eventTypes;
    state.draft = cloneEventTypes(eventTypes);
    state.loaded = true;
    state.dirty = false;
    renderAccess();
    renderCategoryControls();
    renderEditor();
  } catch (error) {
    state.loaded = false;
    renderAccess();
    const editor = $('eventTypesEditor');
    editor?.classList.remove('is-hidden');
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
    state.eventTypes = [];
    state.draft = [];
    state.loaded = false;
    state.dirty = false;
    renderAccess();
    return;
  }

  renderAccess();
  if (reloadPreferences) await loadEventTypes();
}

function selectedReminders(group) {
  return [...document.querySelectorAll(`[data-reminder-group="${group}"] input:checked`)]
    .map((input) => Number(input.value))
    .filter(Number.isInteger)
    .filter((value, index, values) => values.indexOf(value) === index)
    .sort((a, b) => a - b);
}

function eventTypeExists(key) {
  return state.eventTypes.some((type) => type.key === key);
}

function validateEventInput(input) {
  if (!input.title || input.title.length > 120) throw new Error('Escribe un título válido');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error('Selecciona una fecha válida');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time)) throw new Error('Selecciona una hora válida');
  if (!input.category || !eventTypeExists(input.category)) throw new Error('Selecciona un tipo de evento válido');
  return input;
}

function setBusy(button, busy, label) {
  if (!button) return;
  if (!button.dataset.eventTypesDefaultLabel) button.dataset.eventTypesDefaultLabel = button.textContent;
  button.disabled = busy;
  button.textContent = busy ? label : button.dataset.eventTypesDefaultLabel;
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
  $('eventTypesAddButton')?.addEventListener('click', addDraftType);
  $('eventTypesDiscardButton')?.addEventListener('click', discardChanges);
  $('eventTypesSaveButton')?.addEventListener('click', savePreferences);
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
