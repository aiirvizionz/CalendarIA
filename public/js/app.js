import {
  analyzeEvent,
  createGoogleEvent,
  deleteGoogleEvent,
  listGoogleEvents,
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

const RECURRENCE_LABELS = Object.freeze({
  daily: { single: 'diaria', plural: 'días' },
  weekly: { single: 'semanal', plural: 'semanas' },
  monthly: { single: 'mensual', plural: 'meses' },
  yearly: { single: 'anual', plural: 'años' },
  custom: { single: 'personalizada', plural: 'periodos' },
});

const state = {
  session: { authenticated: false, integrations: null },
  activeTab: 'manual',
  pendingEvent: null,
  image: null,
  audioCapture: null,
  audioProcessing: false,
  calendarEvents: [],
  calendarEventsLoaded: false,
  eventsLoading: false,
};

const $ = (id) => document.getElementById(id);

function normalizeComparableText(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase('es-MX')
    .replace(/\s+/g, ' ')
    .trim();
}

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
  window.setTimeout(() => toast.remove(), 5200);
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

function reminderLabel(value) {
  return REMINDER_LABELS[value] || `${value} min`;
}

function formatLocalEventDate(event) {
  const parsed = new Date(`${event.date}T${event.time}:00`);
  if (Number.isNaN(parsed.getTime())) return `${event.date} · ${event.time}`;
  return new Intl.DateTimeFormat('es-MX', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

function formatGoogleEventDate(event) {
  if (event.startDateTime) {
    const parsed = new Date(event.startDateTime);
    if (!Number.isNaN(parsed.getTime())) {
      return new Intl.DateTimeFormat('es-MX', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(parsed);
    }
  }

  if (event.startDate) {
    const parsed = new Date(`${event.startDate}T00:00:00`);
    if (!Number.isNaN(parsed.getTime())) {
      const date = new Intl.DateTimeFormat('es-MX', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }).format(parsed);
      return `${date} · Todo el día`;
    }
  }

  return 'Fecha no disponible';
}

function googleEventTimestamp(event) {
  const value = event.startDateTime || (event.startDate ? `${event.startDate}T00:00:00` : '');
  const timestamp = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(timestamp) ? timestamp : Number.MAX_SAFE_INTEGER;
}

function localEventTimestamp(event) {
  const timestamp = new Date(`${event.date}T${event.time}:00`).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.MAX_SAFE_INTEGER;
}

function localEventStillActive(event) {
  const start = localEventTimestamp(event);
  return Number.isFinite(start) && start + (60 * 60 * 1000) > Date.now();
}

function localEventContentKey(event) {
  return `${normalizeComparableText(event.title)}|${event.date}|${event.time}`;
}

function recurrenceLabel(recurrence) {
  if (!recurrence) return '';
  const definition = RECURRENCE_LABELS[recurrence.frequency] || RECURRENCE_LABELS.custom;
  const interval = Number(recurrence.interval) || 1;
  return interval === 1
    ? `Recurrente · ${definition.single}`
    : `Recurrente · cada ${interval} ${definition.plural}`;
}

function compareAgendaItems(a, b) {
  const aTime = a.source === 'google' ? googleEventTimestamp(a.event) : localEventTimestamp(a.event);
  const bTime = b.source === 'google' ? googleEventTimestamp(b.event) : localEventTimestamp(b.event);
  return aTime - bTime;
}

function integrationEnabled(name) {
  return Boolean(state.session.integrations?.[name]);
}

function setAuthGate(gateId, title, description, hidden) {
  const gate = $(gateId);
  gate.classList.toggle('is-hidden', hidden);
  if (hidden) return;
  gate.querySelector('strong').textContent = title;
  gate.querySelector('p').textContent = description;
}

function showAvatarFallback(name) {
  const fallback = $('userAvatarFallback');
  fallback.textContent = String(name || '?').trim().charAt(0) || '?';
  fallback.classList.remove('is-hidden');
  $('userAvatar').classList.add('is-hidden');
}

function updateAvatar() {
  const name = state.session.user?.name || state.session.user?.email || '';
  const picture = state.session.user?.picture || '';
  const avatar = $('userAvatar');

  avatar.onerror = () => showAvatarFallback(name);
  avatar.onload = () => {
    avatar.classList.remove('is-hidden');
    $('userAvatarFallback').classList.add('is-hidden');
  };

  if (!picture) {
    avatar.removeAttribute('src');
    avatar.alt = '';
    showAvatarFallback(name);
    return;
  }

  showAvatarFallback(name);
  avatar.alt = name ? `Foto de ${name}` : 'Foto de perfil';
  avatar.src = picture;
}

function updateAuthUI() {
  const statusKnown = state.session.integrations !== null;
  const authenticated = Boolean(state.session.authenticated);
  const googleConfigured = integrationEnabled('google');
  const geminiConfigured = integrationEnabled('gemini');
  const aiAvailable = authenticated && geminiConfigured;

  $('authButton').disabled = !statusKnown || (!authenticated && !googleConfigured);
  $('authButtonText').textContent = !statusKnown
    ? 'Verificando…'
    : authenticated
      ? 'Cerrar sesión'
      : googleConfigured
        ? 'Conectar Google'
        : 'Google no configurado';

  $('userChip').classList.toggle('is-hidden', !authenticated);
  $('analyzeButton').disabled = !aiAvailable;
  $('recordButton').disabled = !aiAvailable;
  $('refreshEventsButton').disabled = !authenticated || !googleConfigured || state.eventsLoading;
  $('refreshEventsButton').classList.toggle('is-loading', state.eventsLoading);

  let gateTitle = 'Inicia sesión para usar Gemini';
  let gateDescription = 'Así protegemos la cuota de la API y asociamos límites de uso a una sesión real.';
  if (!statusKnown) {
    gateTitle = 'Verificando integraciones';
    gateDescription = 'CalendarIA está comprobando la disponibilidad del servidor.';
  } else if (!googleConfigured) {
    gateTitle = 'Google OAuth no está configurado';
    gateDescription = 'La creación manual sigue disponible. La IA y la sincronización se habilitarán cuando el servidor configure Google OAuth.';
  } else if (!geminiConfigured) {
    gateTitle = 'Gemini no está configurado';
    gateDescription = 'La creación manual y Google Calendar siguen disponibles, pero el análisis con IA está temporalmente deshabilitado.';
  }

  setAuthGate('authGateAi', gateTitle, gateDescription, aiAvailable);
  setAuthGate(
    'authGateAudio',
    gateTitle.replace('usar Gemini', 'analizar voz'),
    gateDescription,
    aiAvailable,
  );

  if (authenticated) {
    const name = state.session.user?.name || state.session.user?.email || '';
    $('userName').textContent = name;
    updateAvatar();
  } else {
    $('userName').textContent = '';
    $('userAvatar').removeAttribute('src');
    $('userAvatar').alt = '';
    $('userAvatar').classList.add('is-hidden');
    $('userAvatarFallback').textContent = '';
    $('userAvatarFallback').classList.add('is-hidden');
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

function agendaItems() {
  const googleItems = state.calendarEvents.map((event) => ({
    source: 'google',
    key: `google:${event.id}`,
    event,
  }));
  const remoteIds = new Set(
    state.calendarEvents.flatMap((event) => [event.id, event.deleteId].filter(Boolean)),
  );
  const seenLocalContent = new Set();

  const localItems = listEvents()
    .filter((event) => localEventStillActive(event))
    .filter((event) => {
      if (state.calendarEventsLoaded && event.googleEventId && remoteIds.has(event.googleEventId)) return false;
      const key = localEventContentKey(event);
      if (seenLocalContent.has(key)) return false;
      seenLocalContent.add(key);
      return true;
    })
    .map((event) => ({
      source: 'local',
      key: `local:${event.id}`,
      event,
    }));

  return [...googleItems, ...localItems].sort(compareAgendaItems);
}

function googleReminderText(event) {
  if (event.reminders.length) {
    return `Aviso: ${event.reminders.map(reminderLabel).join(', ')}`;
  }
  return event.useDefaultReminders ? 'Avisos de Google' : 'Sin aviso';
}

function renderEvents() {
  const items = agendaItems();
  const list = $('eventsList');
  list.replaceChildren();
  $('eventCount').textContent = String(items.length);
  $('emptyState').classList.toggle('is-hidden', items.length > 0 || state.eventsLoading);

  for (const item of items) {
    const fragment = $('eventTemplate').content.cloneNode(true);
    const card = fragment.querySelector('.event-card');
    const event = item.event;
    card.dataset.eventId = item.key;
    fragment.querySelector('.event-title').textContent = event.title;

    const sourceBadge = fragment.querySelector('.sync-badge');
    const category = fragment.querySelector('.event-category');
    const reminders = fragment.querySelector('.event-reminders');
    const openLink = fragment.querySelector('.open-event');

    if (item.source === 'google') {
      fragment.querySelector('.event-date').textContent = formatGoogleEventDate(event);
      sourceBadge.textContent = 'Google';
      category.textContent = event.recurring ? recurrenceLabel(event.recurrence) : 'Calendario';
      reminders.textContent = googleReminderText(event);
      if (event.htmlLink) {
        openLink.href = event.htmlLink;
        openLink.classList.remove('is-hidden');
      }
    } else {
      fragment.querySelector('.event-date').textContent = formatLocalEventDate(event);
      const syncLabels = {
        local: 'Local',
        syncing: 'Sincronizando…',
        synced: 'Google ✓',
        failed: 'Error de sync',
      };
      sourceBadge.textContent = syncLabels[event.syncStatus] || 'Local';
      category.textContent = CATEGORY_LABELS[event.category] || event.category;
      reminders.textContent = `Aviso: ${event.reminders.map(reminderLabel).join(', ')}`;
      if (event.googleEventUrl) {
        openLink.href = event.googleEventUrl;
        openLink.classList.remove('is-hidden');
      }
    }

    fragment.querySelector('.delete-event').addEventListener('click', () => handleDeleteEvent(item));
    list.appendChild(fragment);
  }
}

async function refreshGoogleEvents({ silent = false } = {}) {
  if (!state.session.authenticated || !integrationEnabled('google')) {
    state.calendarEvents = [];
    state.calendarEventsLoaded = false;
    renderEvents();
    return;
  }

  state.eventsLoading = true;
  updateAuthUI();
  renderEvents();

  try {
    const result = await listGoogleEvents();
    state.calendarEvents = Array.isArray(result?.events) ? result.events : [];
    state.calendarEventsLoaded = true;
    renderEvents();
    if (!silent) showToast('Google Calendar actualizado', 'success');
  } catch (error) {
    if (!silent) showToast(errorMessage(error), 'error');
  } finally {
    state.eventsLoading = false;
    updateAuthUI();
    renderEvents();
  }
}

async function saveEvent(event) {
  const shouldSync = state.session.authenticated && integrationEnabled('google');
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
    await refreshGoogleEvents({ silent: true });
    showToast(
      result.duplicate
        ? 'Ese evento ya existía en Google Calendar; no se creó una copia.'
        : 'Evento guardado en Google Calendar',
      'success',
    );
    return synced;
  } catch (error) {
    updateEvent(stored.id, { syncStatus: 'failed' });
    renderEvents();
    showToast(errorMessage(error), 'error');
    return stored;
  }
}

function removeLocalCopies(...googleEventIds) {
  const ids = new Set(googleEventIds.filter(Boolean));
  if (!ids.size) return;
  for (const localEvent of listEvents()) {
    if (ids.has(localEvent.googleEventId)) removeEvent(localEvent.id);
  }
}

async function handleDeleteEvent(item) {
  if (item.source === 'google') {
    const targetId = item.event.deleteId || item.event.id;
    const subject = item.event.recurring ? 'la serie recurrente' : 'el evento';
    const confirmed = window.confirm(`¿Eliminar ${subject} “${item.event.title}” de Google Calendar?`);
    if (!confirmed) return;

    try {
      await deleteGoogleEvent(targetId);
      removeLocalCopies(item.event.id, targetId);
      state.calendarEvents = state.calendarEvents.filter((event) => (event.deleteId || event.id) !== targetId);
      renderEvents();
      showToast(item.event.recurring ? 'Serie recurrente eliminada de Google Calendar' : 'Evento eliminado de Google Calendar', 'success');
      await refreshGoogleEvents({ silent: true });
    } catch (error) {
      showToast(errorMessage(error), 'error');
    }
    return;
  }

  const event = item.event;
  if (event.googleEventId) {
    if (!state.session.authenticated || !integrationEnabled('google')) {
      showToast('Google Calendar no está disponible para eliminar la copia sincronizada', 'error');
      return;
    }
    try {
      await deleteGoogleEvent(event.googleEventId);
      state.calendarEvents = state.calendarEvents.filter((calendarEvent) => calendarEvent.id !== event.googleEventId);
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
  $('reviewEventDate').textContent = new Intl.DateTimeFormat('es-MX', { dateStyle: 'full' })
    .format(new Date(`${event.date}T00:00:00`));
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
  if (!file) return;
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
  if (!integrationEnabled('gemini')) {
    showToast('Gemini no está configurado en el servidor', 'error');
    return;
  }
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
  if (!integrationEnabled('gemini')) {
    showToast('Gemini no está configurado en el servidor', 'error');
    return;
  }
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
    if (!state.session.authenticated) {
      if (!integrationEnabled('google')) {
        showToast('Google OAuth no está configurado en el servidor', 'error');
        return;
      }
      startGoogleAuth();
      return;
    }

    try {
      await logout();
      state.session = {
        authenticated: false,
        integrations: state.session.integrations,
      };
      state.calendarEvents = [];
      state.calendarEventsLoaded = false;
      updateAuthUI();
      renderEvents();
      showToast('Sesión de Google cerrada', 'success');
    } catch (error) {
      showToast(errorMessage(error), 'error');
    }
  });

  $('refreshEventsButton').addEventListener('click', () => refreshGoogleEvents());

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
  updateAuthUI();

  try {
    state.session = await loadSession();
  } catch (error) {
    showToast(errorMessage(error), 'error');
  }
  updateAuthUI();

  if (state.session.authenticated && integrationEnabled('google')) {
    await refreshGoogleEvents({ silent: true });
  }

  const params = new URLSearchParams(window.location.search);
  const authResult = params.get('auth');
  if (authResult) {
    window.history.replaceState(null, '', window.location.pathname);
    showToast(
      authResult === 'success' ? 'Google conectado correctamente' : 'No se pudo conectar Google',
      authResult === 'success' ? 'success' : 'error',
    );
  }
}

initialize();