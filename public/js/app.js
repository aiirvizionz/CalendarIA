import {
  analyzeEvent,
  createGoogleEvent,
  deleteGoogleEvent,
  loadSession,
  logout,
  startGoogleAuth,
} from './api.js';
import { readImage, startAudioCapture } from './media.js';
import { addEvent, listEvents, removeEvent, updateEvent } from './store.js';

const CATEGORY_LABELS = Object.freeze({
  examen: 'Examen',
  estudio: 'Estudio',
  social: 'Social',
  presentacion: 'Presentación',
  tarea: 'Tarea',
  otro: 'Otro',
});
const REMINDER_LABELS = Object.freeze({
  10: '10 min',
  60: '1 hora',
  360: '6 horas',
  1440: '1 día',
  10080: '1 semana',
});

const state = {
  session: { authenticated: false },
  activeTab: 'manual',
  pendingEvent: null,
  image: null,
  audioCapture: null,
  audioProcessing: false,
};

const $ = (id) => document.getElementById(id);

function localDateValue(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type === 'error' ? 'is-error' : type === 'success' ? 'is-success' : ''}`;
  toast.textContent = message;
  $('toastRegion').appendChild(toast);
  window.setTimeout(() => toast.remove(), 4200);
}

function errorMessage(error) {
  if (error?.requestId) return `${error.message} · ID ${error.requestId}`;
  return error?.message || 'Ocurrió un error inesperado';
}

function setButtonBusy(button, busy, busyLabel) {
  if (!button.dataset.defaultLabel) button.dataset.defaultLabel = button.textContent;
  button.disabled = busy;
  button.textContent = busy ? busyLabel : button.dataset.defaultLabel;
}

function selectedReminders(group) {
  const values = [...document.querySelectorAll(`[data-reminder-group="${group}"] input:checked`)]
    .map((input) => Number(input.value));
  return values.length ? values : [10];
}

function formatEventDate(event) {
  const parsed = new Date(`${event.date}T${event.time}:00`);
  if (Number.isNaN(parsed.getTime())) return `${event.date} · ${event.time}`;
  return new Intl.DateTimeFormat('es-MX', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

function updateAuthUI() {
  const authenticated = Boolean(state.session.authenticated);
  $('authButtonText').textContent = authenticated ? 'Cerrar sesión' : 'Conectar Google';
  $('userChip').classList.toggle('is-hidden', !authenticated);
  $('authGateAi').classList.toggle('is-hidden', authenticated);
  $('authGateAudio').classList.toggle('is-hidden', authenticated);
  $('analyzeButton').disabled = !authenticated;
  $('recordButton').disabled = !authenticated;

  if (authenticated) {
    $('userName').textContent = state.session.user?.name || state.session.user?.email || '';
    const picture = state.session.user?.picture || '';
    $('userAvatar').src = picture;
    $('userAvatar').alt = state.session.user?.name ? `Foto de ${state.session.user.name}` : 'Foto de perfil';
  } else {
    $('userName').textContent = '';
    $('userAvatar').removeAttribute('src');
    $('userAvatar').alt = '';
  }
}

function setActiveTab(tab) {
  state.activeTab = tab;
  const map = { manual: 'panelManual', ai: 'panelAi', audio: 'panelAudio' };
  document.querySelectorAll('[data-tab]').forEach((button) => {
    const active = button.dataset.tab === tab;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
  });
  Object.entries(map).forEach(([key, panelId]) => {
    $(panelId).classList.toggle('is-hidden', key !== tab);
  });
  $('reviewPanel').classList.add('is-hidden');
}

function renderEvents() {
  const events = listEvents();
  const list = $('eventsList');
  list.replaceChildren();
  $('eventCount').textContent = String(events.length);
  $('emptyState').classList.toggle('is-hidden', events.length > 0);

  for (const event of events) {
    const fragment = $('eventTemplate').content.cloneNode(true);
    const card = fragment.querySelector('.event-card');
    card.dataset.eventId = event.id;
    fragment.querySelector('.event-title').textContent = event.title;
    fragment.querySelector('.event-date').textContent = formatEventDate(event);
    fragment.querySelector('.event-category').textContent = CATEGORY_LABELS[event.category] || event.category;
    fragment.querySelector('.event-reminders').textContent = `Aviso: ${event.reminders.map((value) => REMINDER_LABELS[value] || `${value} min`).join(', ')}`;

    const syncBadge = fragment.querySelector('.sync-badge');
    const syncLabels = { local: 'Local', syncing: 'Sincronizando…', synced: 'Google ✓', failed: 'Error de sync' };
    syncBadge.textContent = syncLabels[event.syncStatus] || 'Local';

    fragment.querySelector('.delete-event').addEventListener('click', () => handleDeleteEvent(event));
    list.appendChild(fragment);
  }
}

async function saveEvent(event) {
  const shouldSync = state.session.authenticated;
  const stored = addEvent({
    ...event,
    reminders: event.reminders || [10],
    googleEventId: '',
    googleEventUrl: '',
    syncStatus: shouldSync ? 'syncing' : 'local',
  });
  renderEvents();

  if (!shouldSync) {
    showToast('Evento guardado en este dispositivo', 'success');
    return stored;
  }

  try {
    const result = await createGoogleEvent(event);
    const synced = updateEvent(stored.id, {
      googleEventId: result.googleEventId,
      googleEventUrl: result.htmlLink,
      syncStatus: 'synced',
    });
    renderEvents();
    showToast('Evento guardado en Google Calendar', 'success');
    return synced;
  } catch (error) {
    updateEvent(stored.id, { syncStatus: 'failed' });
    renderEvents();
    showToast(errorMessage(error), 'error');
    return stored;
  }
}

async function handleDeleteEvent(event) {
  if (event.googleEventId) {
    if (!state.session.authenticated) {
      showToast('Inicia sesión para eliminar también el evento de Google Calendar', 'error');
      return;
    }
    try {
      await deleteGoogleEvent(event.googleEventId);
    } catch (error) {
      showToast(errorMessage(error), 'error');
      return;
    }
  }

  removeEvent(event.id);
  renderEvents();
  showToast('Evento eliminado', 'success');
}

function eventFromManualForm() {
  const form = new FormData($('manualForm'));
  return {
    title: String(form.get('title') || '').trim(),
    date: String(form.get('date') || ''),
    time: String(form.get('time') || ''),
    category: String(form.get('category') || ''),
    reminders: selectedReminders('manual'),
  };
}

function validateClientEvent(event) {
  if (!event.title || event.title.length > 120) throw new Error('Escribe un título válido');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(event.date)) throw new Error('Selecciona una fecha válida');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(event.time)) throw new Error('Selecciona una hora válida');
  if (!CATEGORY_LABELS[event.category]) throw new Error('Selecciona una categoría válida');
  return event;
}

function showReview(event) {
  state.pendingEvent = event;
  $('reviewEventTitle').textContent = event.title;
  $('reviewEventDate').textContent = new Intl.DateTimeFormat('es-MX', { dateStyle: 'full' }).format(new Date(`${event.date}T00:00:00`));
  $('reviewEventTime').textContent = event.time;
  $('reviewEventCategory').textContent = CATEGORY_LABELS[event.category] || event.category;
  $('panelManual').classList.add('is-hidden');
  $('panelAi').classList.add('is-hidden');
  $('panelAudio').classList.add('is-hidden');
  $('reviewPanel').classList.remove('is-hidden');
  $('reviewTitle').focus?.();
}

function clearImage() {
  if (state.image?.previewUrl) URL.revokeObjectURL(state.image.previewUrl);
  state.image = null;
  $('imageInput').value = '';
  $('imagePreview').classList.add('is-hidden');
  $('imagePreview').removeAttribute('src');
  $('removeImageButton').classList.add('is-hidden');
  $('dropTitle').textContent = 'Suelta una captura aquí';
  $('dropDescription').textContent = 'JPG, PNG o WebP · máximo 4 MB';
}

async function processImage(file) {
  try {
    clearImage();
    state.image = await readImage(file);
    $('imagePreview').src = state.image.previewUrl;
    $('imagePreview').classList.remove('is-hidden');
    $('removeImageButton').classList.remove('is-hidden');
    $('dropTitle').textContent = 'Imagen lista para analizar';
    $('dropDescription').textContent = file.name;
  } catch (error) {
    showToast(errorMessage(error), 'error');
  }
}

async function runAnalysis(input, button = null) {
  if (!state.session.authenticated) {
    showToast('Inicia sesión con Google para usar Gemini', 'error');
    return;
  }

  if (button) setButtonBusy(button, true, 'Analizando…');
  try {
    const result = await analyzeEvent(input);
    showReview(result.event);
  } catch (error) {
    showToast(errorMessage(error), 'error');
  } finally {
    if (button) setButtonBusy(button, false, '');
  }
}

function resetVoiceUI() {
  state.audioCapture = null;
  state.audioProcessing = false;
  $('recordButton').classList.remove('is-recording');
  $('recordButton').setAttribute('aria-label', 'Comenzar grabación');
  $('recordIcon').textContent = '●';
  $('voiceWave').classList.remove('is-active');
  $('voiceTitle').textContent = 'Cuéntame qué necesitas agendar';
  $('voiceDescription').textContent = 'Menciona el evento, la fecha y la hora. Pulsa el botón para empezar.';
}

async function beginRecording() {
  if (!state.session.authenticated) {
    showToast('Inicia sesión con Google para analizar voz', 'error');
    return;
  }
  try {
    state.audioCapture = await startAudioCapture();
    $('recordButton').classList.add('is-recording');
    $('recordButton').setAttribute('aria-label', 'Detener grabación');
    $('recordIcon').textContent = '■';
    $('voiceWave').classList.add('is-active');
    $('voiceTitle').textContent = 'Te estoy escuchando';
    $('voiceDescription').textContent = 'Pulsa de nuevo para terminar. La grabación se detiene automáticamente al minuto.';

    const capture = state.audioCapture;
    capture.result
      .then(async (audio) => {
        if (state.audioProcessing) return;
        state.audioProcessing = true;
        $('voiceTitle').textContent = 'Interpretando tu evento…';
        $('voiceDescription').textContent = 'Gemini está extrayendo fecha, hora y categoría.';
        $('voiceWave').classList.remove('is-active');
        await runAnalysis({ audio });
      })
      .catch((error) => showToast(errorMessage(error), 'error'))
      .finally(resetVoiceUI);
  } catch (error) {
    resetVoiceUI();
    showToast(errorMessage(error), 'error');
  }
}

function bindTabs() {
  const tabs = [...document.querySelectorAll('[data-tab]')];
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => setActiveTab(tab.dataset.tab));
    tab.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const delta = event.key === 'ArrowRight' ? 1 : -1;
      const next = tabs[(index + delta + tabs.length) % tabs.length];
      setActiveTab(next.dataset.tab);
      next.focus();
    });
  });
}

function bindEvents() {
  $('authButton').addEventListener('click', async () => {
    if (!state.session.authenticated) return startGoogleAuth();
    try {
      await logout();
      state.session = { authenticated: false };
      updateAuthUI();
      showToast('Sesión de Google cerrada', 'success');
    } catch (error) {
      showToast(errorMessage(error), 'error');
    }
  });

  $('manualForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const manualEvent = validateClientEvent(eventFromManualForm());
      await saveEvent(manualEvent);
      $('manualTitle').value = '';
    } catch (error) {
      showToast(errorMessage(error), 'error');
    }
  });

  $('aiText').addEventListener('input', () => {
    $('aiCharacterCount').textContent = `${$('aiText').value.length}/3000`;
  });

  $('imageInput').addEventListener('change', (event) => processImage(event.target.files?.[0]));
  $('removeImageButton').addEventListener('click', clearImage);

  for (const eventName of ['dragenter', 'dragover']) {
    $('dropZone').addEventListener(eventName, (event) => {
      event.preventDefault();
      $('dropZone').classList.add('is-dragging');
    });
  }
  for (const eventName of ['dragleave', 'drop']) {
    $('dropZone').addEventListener(eventName, (event) => {
      event.preventDefault();
      $('dropZone').classList.remove('is-dragging');
    });
  }
  $('dropZone').addEventListener('drop', (event) => processImage(event.dataTransfer?.files?.[0]));

  $('aiForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = $('aiText').value.trim();
    if (!text && !state.image) {
      showToast('Escribe un evento o agrega una imagen', 'error');
      return;
    }
    await runAnalysis({
      text,
      image: state.image ? { mimeType: state.image.mimeType, data: state.image.data } : undefined,
    }, $('analyzeButton'));
  });

  $('recordButton').addEventListener('click', () => {
    if (state.audioCapture) state.audioCapture.stop();
    else beginRecording();
  });

  $('cancelReviewButton').addEventListener('click', () => {
    state.pendingEvent = null;
    setActiveTab(state.activeTab);
  });

  $('confirmReviewButton').addEventListener('click', async () => {
    if (!state.pendingEvent) return;
    const button = $('confirmReviewButton');
    setButtonBusy(button, true, 'Guardando…');
    try {
      await saveEvent({ ...state.pendingEvent, reminders: selectedReminders('review') });
      state.pendingEvent = null;
      $('aiText').value = '';
      $('aiCharacterCount').textContent = '0/3000';
      clearImage();
      setActiveTab(state.activeTab);
    } finally {
      setButtonBusy(button, false, '');
    }
  });
}

async function initialize() {
  $('manualDate').value = localDateValue();
  bindTabs();
  bindEvents();
  renderEvents();

  try {
    state.session = await loadSession();
  } catch (error) {
    showToast(errorMessage(error), 'error');
  }
  updateAuthUI();

  const params = new URLSearchParams(window.location.search);
  const authResult = params.get('auth');
  if (authResult) {
    window.history.replaceState(null, '', window.location.pathname);
    showToast(authResult === 'success' ? 'Google conectado correctamente' : 'No se pudo conectar Google', authResult === 'success' ? 'success' : 'error');
  }
}

initialize();
