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
  reconcileTimer: null,
};

const $ = (id) => document.getElementById(id);

function purgeLegacyLocalEvents() {
  for (const key of ['calendaria_events_v2', 'ag_events']) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // CalendarIA no depende de almacenamiento local; fallar al limpiar no bloquea la aplicación.
    }
  }
}

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

function setSelectedReminders(group, reminders = [10]) {
  const selected = new Set((Array.isArray(reminders) ? reminders : [10]).map(Number));
  document.querySelectorAll(`[data-reminder-group="${group}"] input`).forEach((input) => {
    input.checked = selected.has(Number(input.value));
  });
}

function reminderLabel(value) {
  return REMINDER_LABELS[value] || `${value} min`;
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

function recurrenceLabel(recurrence) {
  if (!recurrence) return '';
  const definition = RECURRENCE_LABELS[recurrence.frequency] || RECURRENCE_LABELS.custom;
  const interval = Number(recurrence.interval) || 1;
  return interval === 1
    ? `Recurrente · ${definition.single}`
    : `Recurrente · cada ${interval} ${definition.plural}`;
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
    gateDescription = 'La IA y la creación de eventos requieren Google Calendar en este despliegue.';
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
  return [...state.calendarEvents]
    .filter((event) => event?.id)
    .sort((a, b) => googleEventTimestamp(a) - googleEventTimestamp(b));
}

function googleReminderText(event) {
  if (Array.isArray(event.reminders) && event.reminders.length) {
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

  for (const event of items) {
    const fragment = $('eventTemplate').content.cloneNode(true);
    const card = fragment.querySelector('.event-card');
    card.dataset.eventId = event.id;
    fragment.querySelector('.event-title').textContent = event.title;
    fragment.querySelector('.event-date').textContent = formatGoogleEventDate(event);
    fragment.querySelector('.sync-badge').textContent = 'Google';
    fragment.querySelector('.event-category').textContent = event.recurring
      ? recurrenceLabel(event.recurrence)
      : 'Calendario';
    fragment.querySelector('.event-reminders').textContent = googleReminderText(event);

    const openLink = fragment.querySelector('.open-event');
    if (event.htmlLink) {
      openLink.href = event.htmlLink;
      openLink.classList.remove('is-hidden');
    }

    fragment.querySelector('.delete-event').addEventListener('click', () => handleDeleteEvent(event));
    list.appendChild(fragment);
  }
}

function eventIdentity(event) {
  return event?.deleteId || event?.id || '';
}

function mergeCalendarEvent(event) {
  if (!event?.id) return;
  const identity = eventIdentity(event);
  state.calendarEvents = state.calendarEvents.filter((candidate) => {
    if (candidate.id === event.id) return false;
    if (identity && eventIdentity(candidate) === identity) return false;
    const sameTitle = normalizeComparableText(candidate.title) === normalizeComparableText(event.title);
    return !(sameTitle && googleEventTimestamp(candidate) === googleEventTimestamp(event));
  });
  state.calendarEvents.push(event);
  state.calendarEventsLoaded = true;
  renderEvents();
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

function scheduleCalendarReconciliation() {
  if (state.reconcileTimer) window.clearTimeout(state.reconcileTimer);
  state.reconcileTimer = window.setTimeout(() => {
    state.reconcileTimer = null;
    refreshGoogleEvents({ silent: true });
  }, 1400);
}

async function saveEvent(event) {
  if (!state.session.authenticated || !integrationEnabled('google')) {
    throw new Error('Conecta Google para guardar eventos en tu calendario');
  }

  const result = await createGoogleEvent(event);
  if (result?.event?.id) mergeCalendarEvent(result.event);
  else scheduleCalendarReconciliation();

  showToast(
    result?.duplicate
      ? 'Ese evento ya existía en Google Calendar; no se creó una copia.'
      : 'Evento guardado en Google Calendar',
    'success',
  );
  scheduleCalendarReconciliation();
  return result;
}

async function handleDeleteEvent(event) {
  const targetId = event.deleteId || event.id;
  const subject = event.recurring ? 'la serie recurrente' : 'el evento';
  const confirmed = window.confirm(`¿Eliminar ${subject} “${event.title}” de Google Calendar?`);
  if (!confirmed) return;

  try {
    await deleteGoogleEvent(targetId);
    state.calendarEvents = state.calendarEvents.filter((candidate) => eventIdentity(candidate) !== targetId);
    renderEvents();
    showToast(event.recurring ? 'Serie recurrente eliminada de Google Calendar' : 'Evento eliminado de Google Calendar', 'success');
    scheduleCalendarReconciliation();
  } catch (error) {
    showToast(errorMessage(error), 'error');
  }
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

function eventFromReviewForm() {
  return {
    title: $('reviewTitleInput').value.trim(),
    date: $('reviewDateInput').value,
    time: $('reviewTimeInput').value,
    category: $('reviewCategoryInput').value,
    reminders: selectedReminders('review'),
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
  state.pendingEvent = { ...event };
  $('reviewTitleInput').value = event.title || '';
  $('reviewDateInput').value = event.date || '';
  $('reviewTimeInput').value = event.time || '';
  $('reviewCategoryInput').value = CATEGORY_LABELS[event.category] ? event.category : 'otro';
  setSelectedReminders('review', event.reminders || [10]);
  $('panelManual').classList.add('is-hidden');
  $('panelAi').classList.add('is-hidden');
  $('panelAudio').classList.add('is-hidden');
  $('reviewPanel').classList.remove('is-hidden');
  $('reviewTitle').focus?.();
}

function focusReviewControl(targetId) {
  const control = $(targetId);
  if (!control) return;
  control.focus();
  if (typeof control.showPicker === 'function') {
    try { control.showPicker(); } catch { /* El navegador puede exigir interacción específica. */ }
  } else if (typeof control.select === 'function' && control.type === 'text') {
    control.select();
  }
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
    $('dropTitle').textContent = 'Optimizando imagen…';
    state.image = await readImage(file);
    $('imagePreview').src = state.image.previewUrl;
    $('imagePreview').classList.remove('is-hidden');
    $('removeImageButton').classList.remove('is-hidden');
    $('dropTitle').textContent = 'Imagen lista para analizar';
    $('dropDescription').textContent = state.image.description || file.name;
  } catch (error) {
    clearImage();
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
      state.session = { authenticated: false, integrations: state.session.integrations };
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
    const button = $('manualSubmitButton');
    setButtonBusy(button, true, 'Guardando…');
    try {
      const manualEvent = validateClientEvent(eventFromManualForm());
      await saveEvent(manualEvent);
      $('manualTitle').value = '';
    } catch (error) {
      showToast(errorMessage(error), 'error');
    } finally {
      setButtonBusy(button, false, '');
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

  document.querySelectorAll('[data-review-target]').forEach((button) => {
    button.addEventListener('click', () => focusReviewControl(button.dataset.reviewTarget));
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
      const reviewed = validateClientEvent(eventFromReviewForm());
      await saveEvent(reviewed);
      state.pendingEvent = null;
      $('aiText').value = '';
      $('aiCharacterCount').textContent = '0/3000';
      clearImage();
      setActiveTab(state.activeTab);
    } catch (error) {
      showToast(errorMessage(error), 'error');
    } finally {
      setButtonBusy(button, false, '');
    }
  });
}

async function initialize() {
  purgeLegacyLocalEvents();
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
