import { readImage } from './media.js';

const GOOGLE_EVENT_COLORS = Object.freeze({
  1: '#a4bdfc',
  2: '#7ae7bf',
  3: '#dbadff',
  4: '#ff887c',
  5: '#fbd75b',
  6: '#ffb878',
  7: '#46d6db',
  8: '#e1e1e1',
  9: '#5484ed',
  10: '#51b749',
  11: '#dc2127',
});

const state = {
  mode: 'single',
  file: null,
  events: [],
  eventTypes: [],
  saving: false,
};

const $ = (id) => document.getElementById(id);

async function analyzeWithApi(input) {
  const { analyzeEvent } = await import('./api.js');
  return analyzeEvent(input);
}

async function createWithApi(event) {
  const { createGoogleEvent } = await import('./api.js');
  return createGoogleEvent(event);
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

function errorMessage(error) {
  if (error?.requestId) return `${error.message} · ID ${error.requestId}`;
  return error?.message || 'Ocurrió un error inesperado';
}

function injectStyles() {
  if (document.querySelector('link[data-multi-event-styles]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/multi-event.css?v=2';
  link.dataset.multiEventStyles = 'true';
  document.head.appendChild(link);

  if (!document.querySelector('link[data-multi-event-polish]')) {
    const polish = document.createElement('link');
    polish.rel = 'stylesheet';
    polish.href = '/ux-polish.css?v=1';
    polish.dataset.multiEventPolish = 'true';
    document.head.appendChild(polish);
  }
}

function createModeControl() {
  if ($('imageAnalysisMode')) return;
  const dropZone = $('dropZone');
  if (!dropZone) return;

  const control = document.createElement('div');
  control.id = 'imageAnalysisMode';
  control.className = 'image-analysis-mode is-hidden';
  control.innerHTML = `
    <div class="image-analysis-mode-copy">
      <strong>Modo de análisis de imagen</strong>
      <span>Elige si Gemini debe crear un evento o detectar varios.</span>
    </div>
    <div class="image-analysis-mode-buttons" role="group" aria-label="Cantidad de eventos a extraer de la imagen">
      <button id="singleImageEventButton" class="image-analysis-mode-button is-active" type="button" aria-pressed="true">
        <span class="image-analysis-mode-icon" aria-hidden="true">1</span>
        <span><strong>Un evento</strong><small>Extrae el evento principal</small></span>
      </button>
      <button id="multipleImageEventsButton" class="image-analysis-mode-button" type="button" aria-pressed="false">
        <span class="image-analysis-mode-icon" aria-hidden="true">≡</span>
        <span><strong>Múltiples eventos</strong><small>Tablas, listas y varias fechas</small></span>
      </button>
    </div>`;
  dropZone.insertAdjacentElement('afterend', control);
}

function createReviewPanel() {
  if ($('multiReviewPanel')) return;
  const panelWrap = document.querySelector('.panel-wrap');
  if (!panelWrap) return;

  const panel = document.createElement('section');
  panel.id = 'multiReviewPanel';
  panel.className = 'review-panel multi-review-panel is-hidden';
  panel.setAttribute('aria-live', 'polite');
  panel.setAttribute('aria-labelledby', 'multiReviewTitle');
  panel.innerHTML = `
    <div class="review-heading multi-review-heading">
      <div>
        <p class="eyebrow">Revisión humana</p>
        <h2 id="multiReviewTitle" tabindex="-1">Revisa los eventos encontrados</h2>
        <p id="multiReviewSummary" class="multi-review-summary"></p>
      </div>
      <span class="ai-badge">Gemini</span>
    </div>
    <div id="multiReviewList" class="multi-review-list"></div>
    <div class="multi-review-actions">
      <button id="cancelMultiReviewButton" class="button button-ghost" type="button">Volver</button>
      <button id="saveMultiEventsButton" class="button button-primary" type="button">Guardar eventos</button>
    </div>`;
  panelWrap.appendChild(panel);
}

function setAnalyzeButtonLabel() {
  const button = $('analyzeButton');
  if (!button) return;
  const label = state.mode === 'multiple' ? 'Analizar múltiples eventos ✦' : 'Analizar con Gemini ✦';
  button.dataset.defaultLabel = label;
  if (!button.disabled) button.textContent = label;
}

function setMode(mode) {
  state.mode = mode === 'multiple' ? 'multiple' : 'single';
  const single = $('singleImageEventButton');
  const multiple = $('multipleImageEventsButton');
  if (single) {
    single.classList.toggle('is-active', state.mode === 'single');
    single.setAttribute('aria-pressed', String(state.mode === 'single'));
  }
  if (multiple) {
    multiple.classList.toggle('is-active', state.mode === 'multiple');
    multiple.setAttribute('aria-pressed', String(state.mode === 'multiple'));
  }
  setAnalyzeButtonLabel();
}

function setModeVisibility(visible) {
  $('imageAnalysisMode')?.classList.toggle('is-hidden', !visible);
  if (!visible) setMode('single');
}

function normalizedEventTypes(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((type, index) => ({
      name: String(type?.name || '').trim(),
      key: String(type?.key || '').trim(),
      googleColorId: Number(type?.googleColorId),
      position: Number.isFinite(Number(type?.position)) ? Number(type.position) : index,
    }))
    .filter((type) => type.name && type.key && Number.isInteger(type.googleColorId))
    .sort((a, b) => a.position - b.position);
}

function categoryByKey(key) {
  return state.eventTypes.find((type) => type.key === key) || state.eventTypes[0] || null;
}

function categoryColor(key) {
  const category = categoryByKey(key);
  return GOOGLE_EVENT_COLORS[category?.googleColorId] || '#8f949b';
}

function hideComposerPanels() {
  document.querySelectorAll('.panel').forEach((panel) => panel.classList.add('is-hidden'));
  $('reviewPanel')?.classList.add('is-hidden');
}

function closeMultiReview({ returnToAi = true } = {}) {
  $('multiReviewPanel')?.classList.add('is-hidden');
  state.events = [];
  if (returnToAi) $('tabAi')?.click();
}

function validateEvent(event) {
  const title = String(event.title || '').trim();
  const date = String(event.date || '');
  const time = String(event.time || '');
  const category = String(event.category || '');

  if (!title || title.length > 120) throw new Error('Cada evento necesita un título válido');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Revisa la fecha de “${title}”`);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error(`Revisa la hora de “${title}”`);
  if (!state.eventTypes.some((type) => type.key === category)) throw new Error(`Selecciona una categoría válida para “${title}”`);

  return {
    title,
    date,
    time,
    category,
    reminders: Array.isArray(event.reminders) ? event.reminders : [],
  };
}

function updateSaveButton() {
  const button = $('saveMultiEventsButton');
  if (!button) return;
  const pending = state.events.filter((event) => event.include && !event.saved).length;
  button.disabled = state.saving || pending === 0;
  if (!state.saving) button.textContent = pending === 1 ? 'Guardar 1 evento' : `Guardar ${pending} eventos`;
}

function renderMultiReview() {
  const list = $('multiReviewList');
  if (!list) return;
  list.replaceChildren();

  const total = state.events.length;
  const pending = state.events.filter((event) => !event.saved).length;
  $('multiReviewSummary').textContent = total === 1
    ? 'Gemini encontró 1 evento. Revísalo antes de guardarlo.'
    : `Gemini encontró ${total} eventos. Puedes excluir filas o editar cada evento antes de guardarlos.`;

  state.events.forEach((event, index) => {
    const card = document.createElement('article');
    card.className = 'multi-review-event';
    card.classList.toggle('is-excluded', !event.include);
    card.classList.toggle('is-saved', Boolean(event.saved));

    const header = document.createElement('div');
    header.className = 'multi-review-event-header';
    const include = document.createElement('label');
    include.className = 'multi-review-include';
    include.innerHTML = `<input type="checkbox" ${event.include ? 'checked' : ''} ${event.saved ? 'disabled' : ''}><span>${event.saved ? 'Guardado' : `Evento ${index + 1}`}</span>`;
    include.querySelector('input').addEventListener('change', (changeEvent) => {
      event.include = changeEvent.target.checked;
      card.classList.toggle('is-excluded', !event.include);
      updateSaveButton();
    });
    header.appendChild(include);

    const fields = document.createElement('div');
    fields.className = 'multi-review-fields';

    const titleField = document.createElement('label');
    titleField.className = 'multi-review-field multi-review-title-field';
    titleField.innerHTML = '<span>Título</span>';
    const title = document.createElement('input');
    title.type = 'text';
    title.maxLength = 120;
    title.value = event.title || '';
    title.disabled = Boolean(event.saved);
    title.addEventListener('input', () => { event.title = title.value; });
    titleField.appendChild(title);

    const dateField = document.createElement('label');
    dateField.className = 'multi-review-field';
    dateField.innerHTML = '<span>Fecha</span>';
    const date = document.createElement('input');
    date.type = 'date';
    date.value = event.date || '';
    date.disabled = Boolean(event.saved);
    date.addEventListener('change', () => { event.date = date.value; });
    dateField.appendChild(date);

    const timeField = document.createElement('label');
    timeField.className = 'multi-review-field';
    timeField.innerHTML = '<span>Hora</span>';
    const time = document.createElement('input');
    time.type = 'time';
    time.value = event.time || '';
    time.disabled = Boolean(event.saved);
    time.addEventListener('change', () => { event.time = time.value; });
    timeField.appendChild(time);

    const categoryField = document.createElement('label');
    categoryField.className = 'multi-review-field multi-review-category-field';
    categoryField.innerHTML = '<span>Categoría</span>';
    const categoryControl = document.createElement('div');
    categoryControl.className = 'multi-review-category-control';
    const swatch = document.createElement('span');
    swatch.className = 'multi-review-category-swatch';
    swatch.style.background = categoryColor(event.category);
    const category = document.createElement('select');
    category.disabled = Boolean(event.saved);
    for (const type of state.eventTypes) {
      const option = document.createElement('option');
      option.value = type.key;
      option.textContent = type.name;
      category.appendChild(option);
    }
    if (state.eventTypes.some((type) => type.key === event.category)) category.value = event.category;
    else if (state.eventTypes[0]) {
      category.value = state.eventTypes[0].key;
      event.category = state.eventTypes[0].key;
    }
    category.addEventListener('change', () => {
      event.category = category.value;
      swatch.style.background = categoryColor(event.category);
    });
    categoryControl.append(swatch, category);
    categoryField.appendChild(categoryControl);

    fields.append(titleField, dateField, timeField, categoryField);
    card.append(header, fields);
    list.appendChild(card);
  });

  if (pending === 0 && total > 0) {
    $('multiReviewSummary').textContent = 'Todos los eventos de esta revisión ya fueron guardados.';
  }
  updateSaveButton();
}

function showMultiReview(events, eventTypes) {
  state.eventTypes = normalizedEventTypes(eventTypes);
  if (!state.eventTypes.length) throw new Error('No se pudieron cargar tus categorías actuales');

  state.events = events.map((event, index) => ({
    id: `multi-${Date.now()}-${index}`,
    title: String(event?.title || ''),
    date: String(event?.date || ''),
    time: String(event?.time || ''),
    category: String(event?.category || ''),
    reminders: Array.isArray(event?.reminders) ? [...event.reminders] : [],
    include: true,
    saved: false,
  }));

  hideComposerPanels();
  renderMultiReview();
  $('multiReviewPanel')?.classList.remove('is-hidden');
  $('multiReviewTitle')?.focus?.();
}

async function analyzeMultipleEvents(event) {
  if (state.mode !== 'multiple') return;
  event.preventDefault();
  event.stopImmediatePropagation();

  if (!state.file) {
    showToast('Agrega una imagen para extraer múltiples eventos', 'error');
    return;
  }

  const button = $('analyzeButton');
  if (button) {
    button.disabled = true;
    button.textContent = 'Buscando eventos…';
  }

  let image = null;
  try {
    image = await readImage(state.file);
    const result = await analyzeWithApi({
      mode: 'multiple',
      text: $('aiText')?.value.trim() || '',
      image: { mimeType: image.mimeType, data: image.data },
    });
    const events = Array.isArray(result?.event) ? result.event : [];
    if (!events.length) throw new Error('Gemini no encontró eventos en la imagen');
    showMultiReview(events, result?.eventTypes);
  } catch (error) {
    showToast(errorMessage(error), 'error');
  } finally {
    if (image?.previewUrl) URL.revokeObjectURL(image.previewUrl);
    if (button) {
      button.disabled = false;
      setAnalyzeButtonLabel();
    }
  }
}

async function saveMultipleEvents() {
  if (state.saving) return;
  const pending = state.events.filter((event) => event.include && !event.saved);
  if (!pending.length) return;

  let validated;
  try {
    validated = pending.map((event) => ({ source: event, event: validateEvent(event) }));
  } catch (error) {
    showToast(errorMessage(error), 'error');
    return;
  }

  state.saving = true;
  updateSaveButton();
  const button = $('saveMultiEventsButton');
  let savedCount = 0;
  const failures = [];

  for (let index = 0; index < validated.length; index += 1) {
    const item = validated[index];
    if (button) button.textContent = `Guardando ${index + 1}/${validated.length}…`;
    try {
      await createWithApi(item.event);
      item.source.saved = true;
      item.source.include = false;
      savedCount += 1;
    } catch (error) {
      failures.push(error);
    }
  }

  state.saving = false;
  renderMultiReview();

  if (savedCount > 0) {
    window.setTimeout(() => $('refreshEventsButton')?.click(), 250);
  }

  if (!failures.length) {
    showToast(savedCount === 1 ? 'Evento guardado en Google Calendar' : `${savedCount} eventos guardados en Google Calendar`, 'success');
    if ($('aiText')) $('aiText').value = '';
    if ($('aiCharacterCount')) $('aiCharacterCount').textContent = '0/3000';
    if ($('removeImageButton') && !$('removeImageButton').classList.contains('is-hidden')) $('removeImageButton').click();
    state.file = null;
    setModeVisibility(false);
    closeMultiReview({ returnToAi: true });
    return;
  }

  showToast(
    savedCount
      ? `Se guardaron ${savedCount} eventos; ${failures.length} no pudieron guardarse. Puedes reintentar solo los pendientes.`
      : `No se pudieron guardar los eventos: ${errorMessage(failures[0])}`,
    'error',
  );
}

function bindImageTracking() {
  $('imageInput')?.addEventListener('change', (event) => {
    state.file = event.target.files?.[0] || null;
    setModeVisibility(Boolean(state.file));
  }, { capture: true });

  $('dropZone')?.addEventListener('drop', (event) => {
    state.file = event.dataTransfer?.files?.[0] || null;
    setModeVisibility(Boolean(state.file));
  }, { capture: true });

  $('removeImageButton')?.addEventListener('click', () => {
    state.file = null;
    setModeVisibility(false);
  });

  const remove = $('removeImageButton');
  if (remove) {
    new MutationObserver(() => {
      const hasImage = !remove.classList.contains('is-hidden') && Boolean(state.file);
      setModeVisibility(hasImage);
    }).observe(remove, { attributes: true, attributeFilter: ['class'] });
  }
}

function bindEvents() {
  $('singleImageEventButton')?.addEventListener('click', () => setMode('single'));
  $('multipleImageEventsButton')?.addEventListener('click', () => setMode('multiple'));
  $('aiForm')?.addEventListener('submit', analyzeMultipleEvents, true);
  $('cancelMultiReviewButton')?.addEventListener('click', () => closeMultiReview({ returnToAi: true }));
  $('saveMultiEventsButton')?.addEventListener('click', saveMultipleEvents);

  document.querySelectorAll('[data-tab]').forEach((tab) => {
    tab.addEventListener('click', () => $('multiReviewPanel')?.classList.add('is-hidden'));
  });

  bindImageTracking();
}

function initialize() {
  injectStyles();
  createModeControl();
  createReviewPanel();
  bindEvents();
  setMode('single');
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initialize, { once: true });
} else {
  initialize();
}
