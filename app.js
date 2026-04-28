/*=============================================================================
   AgendaAI (Modo Gemini) — Lógica de aplicación
============================================================================= */

/* ── Configuración de APIs (Reemplaza con tus datos) ────────────────────── */
let GOOGLE_CLIENT_ID = '';

const OAUTH_REDIRECT_URI = `${window.location.origin}/`;
const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/calendar.events';

/* ── Estado global ──────────────────────────────────────────────────────── */
let events = JSON.parse(localStorage.getItem('ag_events') || '[]');
let selectedCategory = 'examen';
let pendingAI = null;
let pendingAudioAI = null;
let googleToken = null;

var pendingImage = null;
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let speechRecognition = null;
let speechTranscript = '';
let speechShouldAnalyze = false;
let audioMode = 'media';

const CAT_LABELS = { examen: 'Examen', estudio: 'Estudio', social: 'Social', presentacion: 'Presentación', tarea: 'Tarea', otro: 'Otro' };
const REMINDER_DEFAULTS = ['10', '60', '360', '1440', '10080'];

/* ── Google OAuth & Calendar ────────────────────────────────────────────── */
function handleGCalBtn() {
  if (googleToken) {
    disconnectGoogle();
  } else {
    // Si no hay Client ID configurado, avisamos al usuario
    if (!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID.includes('TU_CLIENT_ID')) {
      showToast('Falta configurar GOOGLE_AUTH_API_KEY en .env');
      return;
    }
    startOAuth(); // Inicia sesión directamente
  }
}

function startOAuth() {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: OAUTH_REDIRECT_URI,
    response_type: 'token',
    scope: GOOGLE_SCOPES,
    include_granted_scopes: 'true',
    state: 'gcal_auth',
  });
  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

function setGoogleConnected(token) {
  googleToken = token;
  const btn = document.getElementById('gcalBtn');
  btn.classList.add('connected');
  document.getElementById('gcalBtnText').textContent = 'Conectado ✓';
  showToast('Google Calendar conectado');
  events.filter(ev => !ev.synced).forEach(syncEvent);
}

function disconnectGoogle() {
  googleToken = null;
  document.getElementById('gcalBtn').classList.remove('connected');
  document.getElementById('gcalBtnText').textContent = 'Vincular Calendar';
  showToast('Sesión cerrada');
}

async function syncEvent(ev) {
  if (!googleToken) return;

  try {
    const start = `${ev.date}T${ev.time}:00`;
    const endDate = new Date(`${ev.date}T${ev.time}:00`);
    endDate.setHours(endDate.getHours() + 1);
    const end = endDate.toISOString().slice(0, 19);
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    // Lógica de Recordatorios
    const reminderValues = Array.isArray(ev.reminders) && ev.reminders.length
      ? ev.reminders
      : (ev.reminder ? [ev.reminder] : ['60']);

    const reminders = {
      useDefault: false,
      overrides: reminderValues.map((minutes) => ({ method: 'popup', minutes: parseInt(minutes, 10) || 60 }))
    };

    const reminderDescription = reminderValues.map((minutes) => `${getReminderLabel(parseInt(minutes, 10) || 60)} antes`).join(', ');

    const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: { Authorization: `Bearer ${googleToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary: ev.title,
        description: `Categoría: ${CAT_LABELS[ev.category]}\nAviso: ${reminderDescription || 'Sin recordatorio'}\nCreado con AgendaAI Gemini.`,
        start: { dateTime: start, timeZone },
        end: { dateTime: end, timeZone },
        reminders: reminders
      }),
    });

    if (response.ok) {
      const idx = events.findIndex(e => e.id === ev.id);
      if (idx !== -1) { events[idx].synced = true; saveEvents(); renderEvents(); }
      showToast('Guardado en Google Calendar');
    } else {
      showToast('Error de sincronización');
    }
  } catch (error) {
    showToast('Guardado solo localmente');
  }
}

/* ── Panel Manual ───────────────────────────────────────────────────────── */
function setTab(tab) {
  ['panelManual', 'panelAI', 'panelAudio'].forEach((id, i) => {
    document.getElementById(id).style.display = (['manual','ai','audio'][i] === tab) ? 'block' : 'none';
  });
  ['tabManual', 'tabAI', 'tabAudio'].forEach((id, i) => {
    document.getElementById(id).classList.toggle('active', ['manual','ai','audio'][i] === tab);
  });
}

function pickCat(el) {
  selectedCategory = el.dataset.cat;
  document.querySelectorAll('#manChips .chip').forEach(c => {
    c.className = 'chip';
    if (c.dataset.cat === selectedCategory) c.classList.add(`sel-${selectedCategory}`);
  });
}

function addManual() {
  const title = document.getElementById('mTitle').value.trim();
  const date  = document.getElementById('mDate').value;
  const time  = document.getElementById('mTime').value;
  const reminders = getSelectedReminderValues('manualReminderGroup');

  if (!title || !date || !time) return showToast('Llena todos los campos');

  pushEvent({
    id: Date.now(),
    title,
    date,
    time: normalizeTimeValue(time),
    category: selectedCategory,
    reminders: reminders.length ? reminders : ['10'],
    reminder: (reminders[0] || '10'),
    synced: false
  });
  document.getElementById('mTitle').value = '';
}

/* ── Integración GEMINI API (Texto, Imagen, Audio) ──────────────────────── */
async function callGeminiAPI(partsContent) {
  const today = new Date().toISOString().split('T')[0];
  const dow   = new Date().toLocaleDateString('es-MX', { weekday: 'long' });

  const systemPrompt = `Eres un asistente de agenda. Extrae la información del evento del texto, imagen o audio proporcionado. Hoy es ${dow} ${today}. 
Responde SOLO con un JSON válido usando este esquema exacto:
{"titulo":"...","fecha":"YYYY-MM-DD","hora":"HH:MM","categoria":"examen|estudio|social|presentacion|tarea|otro"}
No uses markdown. Si no hay hora exacta, asume: examen=08:00, estudio=16:00, social=18:00, otro=09:00.`;

  const response = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemPrompt,
      partsContent,
    })
  });

  const data = await readJsonResponse(response);
  if (!response.ok) throw new Error((data && data.error) || `Error en Gemini (${response.status})`);
  if (!data || !data.rawText) throw new Error('El servidor devolvio una respuesta vacia de Gemini');

  try {
    return JSON.parse((data.rawText || '').trim());
  } catch (err) {
    throw new Error("Gemini no devolvió un formato válido.");
  }
}

async function loadRuntimeConfig() {
  const response = await fetch('/api/config');
  const data = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error((data && data.error) || `No se pudo cargar la configuracion (${response.status})`);
  }

  GOOGLE_CLIENT_ID = (data && data.googleClientId) || '';
}

async function readJsonResponse(response) {
  const raw = await response.text();

  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Respuesta invalida del servidor (${response.status})`);
  }
}

/* ── Panel IA (Texto + Imagen) ──────────────────────────────────────────── */
function handleFileInput(e) {
  const file = e.target.files[0];
  loadImage(file);
}

function handleImageDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  const files = e.dataTransfer.files;
  if (files.length > 0) {
    loadImage(files[0]);
  }
}

function loadImage(file) {
  if (!file || !file.type.startsWith('image/')) {
    showToast('Por favor selecciona una imagen válida');
    return;
  }
  const reader = new FileReader();
  reader.onload = (ev) => {
    pendingImage = { base64: ev.target.result.split(',')[1], mimeType: file.type };
    document.getElementById('imgPreview').src = ev.target.result;
    document.getElementById('imgPreviewWrap').style.display = 'flex';
    document.getElementById('imgDropInner').style.display = 'none';
  };
  reader.onerror = () => {
    showToast('Error al cargar la imagen');
  };
  reader.readAsDataURL(file);
}

function removeImage() {
  pendingImage = null;
  const preview = document.getElementById('imgPreview');
  preview.src = '';
  document.getElementById('imgPreviewWrap').style.display = 'none';
  document.getElementById('imgDropInner').style.display = 'flex';
  document.getElementById('imgFile').value = '';
}

async function analyzeAI() {
  const text = document.getElementById('aiText').value.trim();
  if (!text && !pendingImage) return showToast('Escribe algo o adjunta imagen');

  const btn = document.getElementById('aiBtn');
  btn.disabled = true; btn.textContent = 'Pensando...';

  try {
    const parts = [];
    if (text) parts.push({ text: `Extrae el evento de aquí: ${text}` });
    if (pendingImage) parts.push({ inline_data: { mime_type: pendingImage.mimeType, data: pendingImage.base64 } });

    const parsed = await callGeminiAPI(parts);
    pendingAI = { id: Date.now(), title: parsed.titulo, date: parsed.fecha, time: normalizeTimeValue(parsed.hora), category: parsed.categoria, synced: false };
    
    renderAIResult(parsed, 'aiRows', 'aiResult');
  } catch (error) {
    showToast(error.message);
  } finally {
    btn.disabled = false; btn.innerHTML = 'Analizar con Gemini';
  }
}

function renderAIResult(parsed, rowsId, resultId) {
  document.getElementById(rowsId).innerHTML = `
    <div class="ai-row"><span class="ai-row-key">Título</span> <span>${parsed.titulo}</span></div>
    <div class="ai-row"><span class="ai-row-key">Fecha</span> <span>${parsed.fecha}</span></div>
    <div class="ai-row"><span class="ai-row-key">Hora</span> <span>${parsed.hora}</span></div>
    <div class="ai-row"><span class="ai-row-key">Categoría</span> <span>${CAT_LABELS[parsed.categoria] || parsed.categoria}</span></div>
  `;
  document.getElementById(resultId).classList.add('show');
}

function confirmAI() {
  if (!pendingAI) return;
  const selected = getSelectedReminderValues('aiReminderGroup');
  pendingAI.reminders = selected.length ? selected : ['10'];
  pendingAI.reminder = pendingAI.reminders[0];
  pushEvent(pendingAI);
  pendingAI = null;
  document.getElementById('aiText').value = '';
  resetReminderGroup('aiReminderGroup');
  removeImage();
  document.getElementById('aiResult').classList.remove('show');
}
function dismissAI() {
  pendingAI = null;
  document.getElementById('aiRows').innerHTML = '';
  document.getElementById('aiResult').classList.remove('show');
  document.getElementById('aiText').value = '';
  resetReminderGroup('aiReminderGroup');
  removeImage();
}

/* ── Panel Audio (Directo a Gemini) ─────────────────────────────────────── */
async function toggleRecording() {
  if (isRecording) stopRecording();
  else startRecording();
}

async function startRecording() {
  const SpeechRecognitionAPI = getSpeechRecognitionConstructor();
  if (SpeechRecognitionAPI) {
    startSpeechRecognition(SpeechRecognitionAPI);
    return;
  }

  try {
    audioMode = 'media';
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    audioChunks = [];

    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      await analyzeAudioDirectly();
    };

    mediaRecorder.start();
    isRecording = true;
    document.getElementById('audioBtn').classList.add('recording');
    document.getElementById('audioBtnIcon').textContent = '⏹';
    document.getElementById('audioLabel').textContent = 'Escuchando...';
    document.getElementById('audioSub').textContent = 'Grabando audio para analizarlo con Gemini';
  } catch (err) {
    showToast('Error de micrófono. Revisa permisos.');
  }
}

function stopRecording() {
  if (speechRecognition) {
    speechShouldAnalyze = true;
    try {
      speechRecognition.stop();
    } catch (error) {
      finalizeSpeechState();
    }
    isRecording = false;
    document.getElementById('audioBtn').classList.remove('recording');
    document.getElementById('audioBtnIcon').textContent = '⏺';
    document.getElementById('audioLabel').textContent = 'Procesando voz...';
    document.getElementById('audioSub').textContent = 'Transformando tu voz en evento';
    return;
  }

  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
  isRecording = false;
  document.getElementById('audioBtn').classList.remove('recording');
  document.getElementById('audioBtnIcon').textContent = '⏺';
  document.getElementById('audioLabel').textContent = 'Procesando audio...';
  document.getElementById('audioSub').textContent = 'Analizando el archivo de audio';
}

function getSpeechRecognitionConstructor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function startSpeechRecognition(RecognitionAPI) {
  try {
    audioMode = 'speech';
    speechTranscript = '';
    speechShouldAnalyze = true;
    speechRecognition = new RecognitionAPI();
    speechRecognition.lang = 'es-MX';
    speechRecognition.continuous = true;
    speechRecognition.interimResults = true;

    speechRecognition.onresult = (event) => {
      let finalText = '';
      let interimText = '';

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += transcript;
        else interimText += transcript;
      }

      if (finalText) speechTranscript += `${finalText} `;
      const currentText = `${speechTranscript}${interimText}`.trim();
      document.getElementById('audioLabel').textContent = currentText ? 'Escuchando...' : 'Escuchando...';
      document.getElementById('audioSub').textContent = currentText ? truncateText(currentText, 90) : 'Habla con naturalidad y menciona fecha, hora y título';
    };

    speechRecognition.onerror = (event) => {
      speechShouldAnalyze = false;
      finalizeSpeechState();
      showToast(`No se pudo reconocer la voz: ${event.error || 'error'}`);
    };

    speechRecognition.onend = async () => {
      const text = speechTranscript.trim();
      const shouldAnalyze = speechShouldAnalyze && !!text;
      finalizeSpeechState();

      if (shouldAnalyze) {
        try {
          await analyzeAudioTranscript(text);
        } catch (error) {
          showToast(error.message);
        }
      }
    };

    speechRecognition.start();
    isRecording = true;
    document.getElementById('audioBtn').classList.add('recording');
    document.getElementById('audioBtnIcon').textContent = '⏹';
    document.getElementById('audioLabel').textContent = 'Escuchando...';
    document.getElementById('audioSub').textContent = 'Habla con naturalidad y pulsa de nuevo para terminar';
  } catch (error) {
    speechShouldAnalyze = false;
    finalizeSpeechState();
    showToast('No se pudo iniciar el dictado por voz');
  }
}

function finalizeSpeechState() {
  speechRecognition = null;
  isRecording = false;
  document.getElementById('audioBtn').classList.remove('recording');
  document.getElementById('audioBtnIcon').textContent = '⏺';
}

async function analyzeAudioDirectly() {
  const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
  const reader = new FileReader();
  
  reader.readAsDataURL(audioBlob);
  reader.onloadend = async () => {
    const base64Audio = reader.result.split(',')[1];
    
    try {
      const parts = [
        { text: 'Escucha este audio y extrae los detalles del evento que menciono. Responde con el esquema JSON solicitado.' },
        { inline_data: { mime_type: 'audio/webm', data: base64Audio } }
      ];

      const parsed = await callGeminiAPI(parts);
      pendingAudioAI = { id: Date.now(), title: parsed.titulo, date: parsed.fecha, time: normalizeTimeValue(parsed.hora), category: parsed.categoria, synced: false };
      renderAudioResult(parsed);
      document.getElementById('audioLabel').textContent = '¡Evento detectado!';
      document.getElementById('audioSub').textContent = 'Revisa el evento y elige tus alertas';

    } catch (error) {
      showToast('Error al analizar audio: ' + error.message);
      document.getElementById('audioLabel').textContent = 'Toca para hablar';
      document.getElementById('audioSub').textContent = 'Cuéntale a Gemini sobre tu evento';
    }
  };
}

async function analyzeAudioTranscript(transcript) {
  if (!transcript) throw new Error('No se detectó voz suficiente para analizar.');

  const parsed = await callGeminiAPI([
    {
      text: `Convierte la siguiente transcripción de voz en un evento de agenda: ${transcript}. ` +
        'Devuelve solo el JSON exacto solicitado con titulo, fecha, hora y categoria.'
    }
  ]);

  pendingAudioAI = {
    id: Date.now(),
    title: parsed.titulo,
    date: parsed.fecha,
    time: normalizeTimeValue(parsed.hora),
    category: parsed.categoria,
    synced: false
  };
  renderAudioResult(parsed, transcript);
  document.getElementById('audioLabel').textContent = '¡Evento detectado!';
  document.getElementById('audioSub').textContent = truncateText(transcript, 90);
}

function renderAudioResult(parsed, transcript = '') {
  renderAIResult(parsed, 'aiRowsAudio', 'aiResultAudio');
  if (transcript) {
    const transcriptNode = document.createElement('div');
    transcriptNode.className = 'ai-row ai-row-transcript';
    transcriptNode.innerHTML = `<span class="ai-row-key">Transcripción</span> <span>${transcript}</span>`;
    document.getElementById('aiRowsAudio').prepend(transcriptNode);
  }
}

function confirmAudio() {
  if (!pendingAudioAI) return;
  const selected = getSelectedReminderValues('audioReminderGroup');
  pendingAudioAI.reminders = selected.length ? selected : ['10'];
  pendingAudioAI.reminder = pendingAudioAI.reminders[0];
  pushEvent(pendingAudioAI);
  pendingAudioAI = null; 
  document.getElementById('aiResultAudio').classList.remove('show');
  resetReminderGroup('audioReminderGroup');
  document.getElementById('audioLabel').textContent = 'Toca para hablar';
  document.getElementById('audioSub').textContent = 'Cuéntale a Gemini sobre tu evento';
}
function dismissAudio() {
  pendingAudioAI = null;
  document.getElementById('aiRowsAudio').innerHTML = '';
  document.getElementById('aiResultAudio').classList.remove('show');
  resetReminderGroup('audioReminderGroup');
  document.getElementById('audioLabel').textContent = 'Toca para hablar';
  document.getElementById('audioSub').textContent = 'Cuéntale a Gemini sobre tu evento';
}

/* ── CRUD & Render ──────────────────────────────────────────────────────── */
function pushEvent(ev) {
  events.unshift(ev);
  saveEvents(); renderEvents();
  if (googleToken) syncEvent(ev);
  else showToast('Evento guardado (Local)');
}

function deleteEvent(id) {
  events = events.filter(e => e.id !== id);
  saveEvents(); renderEvents();
}

function saveEvents() { localStorage.setItem('ag_events', JSON.stringify(events)); }

function renderEvents() {
  const list = document.getElementById('evList');
  document.getElementById('evCount').textContent = `${events.length} ${events.length === 1 ? 'evento' : 'eventos'}`;

  if (!events.length) {
    list.innerHTML = `<div style="text-align:center; padding: 20px; color: var(--gray-400)">Sin eventos.</div>`;
    return;
  }

  list.innerHTML = events.map(ev => {
    const dateObj = new Date(`${ev.date}T${ev.time}`);
    const dayName = capitalize(dateObj.toLocaleDateString('es-MX', { weekday: 'short' }));
    const timeFormatted = formatTimeValue(ev.time);
    const dateFormatted = formatDateLabel(ev.date);
    const reminderLabel = formatReminderValue(ev);
    return `
    <div class="ev-card">
      <div class="ev-dot ${ev.category}"></div>
      <div style="flex:1">
        <div class="ev-title">${ev.title}</div>
        <div class="ev-meta">
          <span>${dayName}. ${dateFormatted} · ${timeFormatted}</span>
          <span class="ev-cat" style="color: var(--cat-${ev.category})">${CAT_LABELS[ev.category]}</span>
          ${ev.synced ? '<span class="ev-synced">✓ GCal</span>' : ''}
          ${reminderLabel ? `<span class="ev-reminder">⏰ ${reminderLabel}</span>` : ''}
        </div>
      </div>
      <button class="ev-del" onclick="deleteEvent(${ev.id})">✕</button>
    </div>
  `;
  }).join('');
}

function getReminderLabel(minutes) {
  if (minutes >= 10080) return '1 semana';
  if (minutes >= 1440) return '1 día';
  if (minutes >= 360) return '6 horas';
  if (minutes >= 60) return '1 hora';
  return `${minutes}m`;
}

function getSelectedReminderValues(groupName) {
  return Array.from(document.querySelectorAll(`input[name="${groupName}"]:checked`)).map((input) => input.value);
}

function updateReminderOption(input) {
  if (!input) return;
  const option = input.closest('.reminder-option');
  if (option) option.classList.toggle('selected', input.checked);
}

function resetReminderGroup(groupName) {
  const inputs = Array.from(document.querySelectorAll(`input[name="${groupName}"]`));
  if (!inputs.length) return;

  inputs.forEach((input, index) => {
    input.checked = index === 0;
    updateReminderOption(input);
  });
}

function formatTimeValue(time) {
  if (!time) return '00:00';

  const raw = String(time).trim();
  if (/^\d{1,2}:\d{2}$/.test(raw)) {
    const [hours, minutes] = raw.split(':');
    return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`;
  }

  if (/^\d{3,4}$/.test(raw)) {
    const normalized = raw.padStart(4, '0');
    return `${normalized.slice(0, 2)}:${normalized.slice(2)}`;
  }

  return raw;
}

function normalizeTimeValue(time) {
  return formatTimeValue(time);
}

function formatDateLabel(date) {
  if (!date) return '';
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

function capitalize(text) {
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatReminderValue(ev) {
  if (Array.isArray(ev.reminders) && ev.reminders.length) {
    return ev.reminders.map(getReminderLabel).join(', ');
  }

  if (ev.reminder) {
    return getReminderLabel(parseInt(ev.reminder, 10) || 10);
  }

  return '';
}

function truncateText(text, maxLength) {
  const value = String(text || '').trim();
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

function gatherReminderValues(groupName) {
  const values = getSelectedReminderValues(groupName);
  return values.length ? values : ['10'];
}

function showToast(msg) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

/* ── Inicialización ─────────────────────────────────────────────────────── */
(function checkOAuthRedirect() {
  const hash = window.location.hash;
  if (hash && hash.includes('access_token')) {
    const token = new URLSearchParams(hash.substring(1)).get('access_token');
    if (token) {
      history.replaceState(null, '', window.location.pathname);
      setGoogleConnected(token);
    }
  }
})();

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await loadRuntimeConfig();
  } catch (error) {
    showToast('No se cargo la configuracion del servidor');
  }

  document.getElementById('mDate').value = new Date().toISOString().split('T')[0];
  resetReminderGroup('manualReminderGroup');
  resetReminderGroup('aiReminderGroup');
  resetReminderGroup('audioReminderGroup');
  removeImage();
  renderEvents();
});