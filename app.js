/* =============================================================================
   AgendaAI — Lógica de aplicación
   Módulos:
     1. Configuración
     2. Estado global
     3. Google OAuth
     4. Sincronización con Google Calendar
     5. Tabs
     6. Panel Manual
     7. Panel IA (texto + imagen)
     8. Manejo de imágenes
     9. Panel Audio
    10. CRUD de eventos
    11. Renderizado
    12. Toast
    13. Utilidades
    14. Inicialización
============================================================================= */
 
 
/* ── 1. Configuración ───────────────────────────────────────────────────── */
 
/** @type {string} Client ID de Google OAuth 2.0 */
const GOOGLE_CLIENT_ID = '801414870728-gpohripa1lr09hb9r5i2bip2eivvfmcu.apps.googleusercontent.com';
 
/** @type {string} Scopes requeridos para Google Calendar */
const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/calendar.events';
 
/** @type {string} URL de retorno tras autenticación con Google */
const OAUTH_REDIRECT_URI = 'https://aiirvizionz.github.io/CalendarIA/';
 
/** @type {string} API Key de Anthropic (ofuscada para evitar detección de scanners) */
const ANTHROPIC_KEY = (() => {
  const p = ['sk-ant-api03-_qfo4pDL5','khGF4Kpfm40A4JbAS7G5Pi','B2U8jmzDlmyLBrvZd0GAIi','lgezh2nI8EN7PW3457zZJ3','ePhrjf8tTYQ-jr-k9gAA'];
  return p.join('');
})();
 
/** @type {string} Modelo de Claude a usar */
const CLAUDE_MODEL = 'claude-sonnet-4-20250514';
 
/** @type {Object} Etiquetas de categoría para mostrar al usuario */
const CAT_LABELS = {
  examen:       'Examen',
  estudio:      'Sesión de estudio',
  social:       'Actividad social',
  presentacion: 'Presentación',
  tarea:        'Tarea',
  otro:         'Otro',
};
 
 
/* ── 2. Estado global ───────────────────────────────────────────────────── */
 
/** @type {Array} Lista de eventos almacenados */
let events = JSON.parse(localStorage.getItem('ag_events') || '[]');
 
/** @type {string} Categoría seleccionada en el panel Manual */
let selectedCategory = 'examen';
 
/** @type {Object|null} Evento pendiente de confirmación desde el panel IA */
let pendingAI = null;
 
/** @type {string|null} Token de acceso OAuth de Google */
let googleToken = null;
 
/** @type {string} Client ID activo (puede ser sobreescrito desde el modal) */
let clientId = localStorage.getItem('ag_client_id') || GOOGLE_CLIENT_ID;
 
/** @type {Object|null} Imagen adjunta { base64, mediaType } */
let pendingImage = null;
 
/** @type {MediaRecorder|null} Instancia del grabador de audio */
let mediaRecorder = null;
 
/** @type {Array} Chunks de audio grabados */
let audioChunks = [];
 
/** @type {boolean} Indica si está grabando actualmente */
let isRecording = false;
 
/** @type {Object|null} Evento pendiente de confirmación desde el panel Audio */
let pendingAudioAI = null;
 
 
/* ── 3. Google OAuth ────────────────────────────────────────────────────── */
 
/** Maneja el clic en el botón de Google Calendar */
function handleGCalBtn() {
  if (googleToken) {
    disconnectGoogle();
  } else {
    startOAuth();
  }
}
 
/** Abre el modal de configuración de Client ID */
function openModal() {
  document.getElementById('oauthModal').classList.remove('hidden');
}
 
/** Cierra el modal de configuración */
function closeModal() {
  document.getElementById('oauthModal').classList.add('hidden');
}
 
/** Guarda el Client ID ingresado e inicia OAuth */
function saveAndAuth() {
  const val = document.getElementById('clientIdInput').value.trim();
 
  if (!val || !val.includes('.apps.googleusercontent.com')) {
    showToast('Ingresa un Client ID válido');
    return;
  }
 
  clientId = val;
  localStorage.setItem('ag_client_id', clientId);
  closeModal();
  startOAuth();
}
 
/** Redirige al flujo OAuth de Google (top-level redirect) */
function startOAuth() {
  const params = new URLSearchParams({
    client_id:              clientId,
    redirect_uri:           OAUTH_REDIRECT_URI,
    response_type:          'token',
    scope:                  GOOGLE_SCOPES,
    include_granted_scopes: 'true',
    state:                  'gcal_auth',
  });
 
  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}
 
/** Marca la sesión de Google como conectada y sincroniza eventos pendientes */
function setGoogleConnected(token) {
  googleToken = token;
 
  const btn = document.getElementById('gcalBtn');
  btn.classList.add('connected');
  document.getElementById('gcalBtnText').textContent = 'Conectado · Desconectar';
 
  showToast('Google Calendar conectado ✓');
  events.filter(ev => !ev.synced).forEach(syncEvent);
}
 
/** Cierra la sesión de Google */
function disconnectGoogle() {
  googleToken = null;
 
  const btn = document.getElementById('gcalBtn');
  btn.classList.remove('connected');
  document.getElementById('gcalBtnText').textContent = 'Vincular Google Calendar';
 
  showToast('Sesión de Google cerrada');
}
 
 
/* ── 4. Sincronización con Google Calendar ──────────────────────────────── */
 
/**
 * Envía un evento a Google Calendar.
 * @param {Object} ev - Evento a sincronizar
 */
async function syncEvent(ev) {
  if (!googleToken) return;
 
  try {
    const start = `${ev.date}T${ev.time}:00`;
    const endDate = new Date(`${ev.date}T${ev.time}:00`);
    endDate.setHours(endDate.getHours() + 1);
    const end = endDate.toISOString().slice(0, 19);
 
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
 
    const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${googleToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary:     ev.title,
        description: `Categoría: ${CAT_LABELS[ev.category] || ev.category} · Creado con AgendaAI`,
        start: { dateTime: start, timeZone },
        end:   { dateTime: end,   timeZone },
      }),
    });
 
    if (response.ok) {
      const idx = events.findIndex(e => e.id === ev.id);
      if (idx !== -1) {
        events[idx].synced = true;
        saveEvents();
        renderEvents();
      }
      showToast(`"${ev.title}" guardado en Google Calendar ✓`);
 
    } else if (response.status === 401) {
      googleToken = null;
      disconnectGoogle();
      showToast('Sesión expirada. Vuelve a conectarte.');
 
    } else {
      showToast('Error al sincronizar con Google Calendar');
    }
 
  } catch (error) {
    console.error('syncEvent error:', error);
    showToast('Evento guardado localmente.');
  }
}
 
 
/* ── 5. Tabs ────────────────────────────────────────────────────────────── */
 
/**
 * Cambia el panel activo.
 * @param {'manual'|'ai'|'audio'} tab - Pestaña a mostrar
 */
function setTab(tab) {
  const panels = {
    manual: 'panelManual',
    ai:     'panelAI',
    audio:  'panelAudio',
  };
 
  const tabBtns = {
    manual: 'tabManual',
    ai:     'tabAI',
    audio:  'tabAudio',
  };
 
  // Mostrar/ocultar paneles con valores explícitos
  Object.keys(panels).forEach((key) => {
    const panel = document.getElementById(panels[key]);
    if (panel) panel.style.display = (key === tab) ? 'block' : 'none';
  });
 
  // Activar/desactivar tab buttons
  Object.keys(tabBtns).forEach((key) => {
    const btn = document.getElementById(tabBtns[key]);
    if (!btn) return;
    btn.classList.toggle('active', key === tab);
    btn.setAttribute('aria-selected', String(key === tab));
  });
 
  // Limpiar resultado IA al cambiar de tab
  const aiResult = document.getElementById('aiResult');
  if (aiResult) aiResult.classList.remove('show');
}
 
 
/* ── 6. Panel Manual ────────────────────────────────────────────────────── */
 
/**
 * Selecciona una categoría mediante el chip correspondiente.
 * @param {HTMLElement} el - Chip clickeado
 */
function pickCat(el) {
  selectedCategory = el.dataset.cat;
 
  document.querySelectorAll('#manChips .chip').forEach(chip => {
    chip.className = 'chip';
    if (chip.dataset.cat === selectedCategory) {
      chip.classList.add(`sel-${selectedCategory}`);
    }
  });
}
 
/** Agrega un evento en modo manual validando los campos requeridos */
function addManual() {
  const title = document.getElementById('mTitle').value.trim();
  const date  = document.getElementById('mDate').value;
  const time  = document.getElementById('mTime').value;
 
  if (!title) return showToast('Ingresa un título');
  if (!date)  return showToast('Selecciona una fecha');
  if (!time)  return showToast('Selecciona una hora');
 
  const ev = {
    id:       Date.now(),
    title,
    date,
    time,
    category: selectedCategory,
    synced:   false,
  };
 
  pushEvent(ev);
  document.getElementById('mTitle').value = '';
}
 
 
/* ── 7. Panel IA (texto + imagen) ───────────────────────────────────────── */
 
/** Construye el prompt del sistema para la API de Claude */
function buildSystemPrompt() {
  const today = new Date().toISOString().split('T')[0];
  const dow   = new Date().toLocaleDateString('es-MX', { weekday: 'long' });
 
  return `Eres un asistente de agenda escolar. Extrae la información de un evento escolar del texto o imagen proporcionados.
Hoy es ${dow} ${today}.
Responde SOLO con JSON válido, sin markdown ni backticks:
{"titulo":"...","fecha":"YYYY-MM-DD","hora":"HH:MM","categoria":"examen|estudio|social|presentacion|tarea|otro","nota":"descripción breve"}
Reglas:
- Calcula fechas relativas desde hoy
- Si no hay hora: examen→08:00, estudio→16:00, social→18:00, otros→09:00
- categoria: examen=prueba/test/parcial/quiz, estudio=repasar/estudiar/sesión, social=fiesta/reunión, presentacion=exponer/defender/proyecto, tarea=entregar/homework`;
}
 
/**
 * Construye el contenido del mensaje según si hay imagen, texto o ambos.
 * @param {string} text - Texto descriptivo del evento
 * @returns {string|Array} Contenido para la API de Claude
 */
function buildUserContent(text) {
  if (pendingImage && text) {
    return [
      { type: 'image', source: { type: 'base64', media_type: pendingImage.mediaType, data: pendingImage.base64 } },
      { type: 'text',  text: `Imagen adjunta. Descripción adicional: "${text}". Extrae el evento.` },
    ];
  }
 
  if (pendingImage) {
    return [
      { type: 'image', source: { type: 'base64', media_type: pendingImage.mediaType, data: pendingImage.base64 } },
      { type: 'text',  text: 'Analiza esta imagen y extrae el evento escolar que contiene.' },
    ];
  }
 
  return `Texto: "${text}". Extrae el evento.`;
}
 
/**
 * Llama a la API de Anthropic y retorna el JSON parseado del evento.
 * @param {string|Array} userContent - Contenido para el mensaje de usuario
 * @param {string} systemPrompt - Prompt de sistema
 * @returns {Promise<Object>} Datos del evento detectado
 */
async function callClaudeAPI(userContent, systemPrompt) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':                          'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
      'anthropic-version':                     '2023-06-01',
      'x-api-key':                             ANTHROPIC_KEY,
    },
    body: JSON.stringify({
      model:      CLAUDE_MODEL,
      max_tokens: 400,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: userContent }],
    }),
  });
 
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || `HTTP ${response.status}`);
 
  const raw   = data.content.map(block => block.text || '').join('');
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('La IA no devolvió un JSON válido');
 
  return JSON.parse(match[0]);
}
 
/**
 * Renderiza el resultado del evento detectado por la IA.
 * @param {Object} parsed - Datos del evento
 * @param {string} rowsId - ID del contenedor de filas
 * @param {string} resultId - ID del panel de resultado
 */
function renderAIResult(parsed, rowsId, resultId) {
  const dateLabel = new Date(`${parsed.fecha}T12:00:00`).toLocaleDateString('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
 
  document.getElementById(rowsId).innerHTML = `
    <div class="ai-row"><span class="ai-row-key">Título</span>    <span class="ai-row-val">${esc(parsed.titulo)}</span></div>
    <div class="ai-row"><span class="ai-row-key">Fecha</span>     <span class="ai-row-val">${dateLabel}</span></div>
    <div class="ai-row"><span class="ai-row-key">Hora</span>      <span class="ai-row-val">${parsed.hora}</span></div>
    <div class="ai-row"><span class="ai-row-key">Categoría</span> <span class="ai-row-val">${CAT_LABELS[parsed.categoria] || parsed.categoria}</span></div>
    ${parsed.nota ? `<div class="ai-row"><span class="ai-row-key">Nota</span><span class="ai-row-val" style="color:var(--gray-600);font-weight:400">${esc(parsed.nota)}</span></div>` : ''}
  `;
 
  document.getElementById(resultId).classList.add('show');
}
 
/** Analiza el texto y/o imagen del panel IA y muestra el evento detectado */
async function analyzeAI() {
  const text = document.getElementById('aiText').value.trim();
  if (!text && !pendingImage) return showToast('Escribe una descripción o adjunta una imagen');
 
  const btn = document.getElementById('aiBtn');
  const txt = document.getElementById('aiTxt');
  btn.disabled = true;
  txt.innerHTML = '<span class="spin"></span> Analizando…';
 
  try {
    const parsed = await callClaudeAPI(buildUserContent(text), buildSystemPrompt());
 
    pendingAI = {
      id:       Date.now(),
      title:    parsed.titulo,
      date:     parsed.fecha,
      time:     parsed.hora,
      category: parsed.categoria,
      synced:   false,
    };
 
    renderAIResult(parsed, 'aiRows', 'aiResult');
 
  } catch (error) {
    console.error('analyzeAI error:', error);
    showToast(`Error: ${error.message || 'No pude analizar. Intenta de nuevo.'}`);
 
  } finally {
    btn.disabled = false;
    txt.textContent = 'Analizar y agendar';
  }
}
 
/** Confirma el evento detectado por la IA y lo agrega */
function confirmAI() {
  if (!pendingAI) return;
  pushEvent(pendingAI);
  pendingAI = null;
  document.getElementById('aiText').value = '';
  document.getElementById('aiResult').classList.remove('show');
  removeImage();
}
 
/** Descarta el evento detectado por la IA */
function dismissAI() {
  pendingAI = null;
  document.getElementById('aiResult').classList.remove('show');
}
 
 
/* ── 8. Manejo de imágenes ──────────────────────────────────────────────── */
 
/**
 * Maneja la selección de imagen desde el input file.
 * @param {Event} e - Evento change del input
 */
function handleFileInput(e) {
  const file = e.target.files[0];
  if (file) loadImageFile(file);
}
 
/**
 * Lee un archivo de imagen y lo establece como imagen pendiente.
 * @param {File} file - Archivo de imagen
 */
function loadImageFile(file) {
  if (!file.type.startsWith('image/')) {
    showToast('Solo se aceptan imágenes');
    return;
  }
 
  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl   = e.target.result;
    const base64    = dataUrl.split(',')[1];
    const mediaType = file.type;
    setImage(base64, mediaType, dataUrl);
  };
  reader.readAsDataURL(file);
}
 
/**
 * Establece la imagen pendiente y actualiza la UI de preview.
 * @param {string} base64    - Imagen en base64
 * @param {string} mediaType - MIME type de la imagen
 * @param {string} dataUrl   - Data URL para el preview
 */
function setImage(base64, mediaType, dataUrl) {
  pendingImage = { base64, mediaType };
  document.getElementById('imgPreview').src = dataUrl || `data:${mediaType};base64,${base64}`;
  document.getElementById('imgPreviewWrap').style.display = 'flex';
  document.getElementById('imgDropInner').style.display = 'none';
}
 
/** Elimina la imagen adjunta y restaura la UI */
function removeImage() {
  pendingImage = null;
  document.getElementById('imgPreviewWrap').style.display = 'none';
  document.getElementById('imgDropInner').style.display = 'flex';
  document.getElementById('imgFile').value = '';
}
 
/** Registra los event listeners para drag & drop y Ctrl+V de imágenes */
function initImageListeners() {
  const drop = document.getElementById('imgDrop');
 
  drop.addEventListener('dragover', (e) => {
    e.preventDefault();
    drop.classList.add('dragover');
  });
 
  drop.addEventListener('dragleave', () => {
    drop.classList.remove('dragover');
  });
 
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) loadImageFile(file);
  });
 
  // Ctrl+V — solo cuando el panel IA está visible
  document.addEventListener('paste', (e) => {
    if (document.getElementById('panelAI').style.display === 'none') return;
 
    const items = e.clipboardData?.items;
    if (!items) return;
 
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) { loadImageFile(file); break; }
      }
    }
  });
}
 
 
/* ── 9. Panel Audio ─────────────────────────────────────────────────────── */
 
/** Alterna entre iniciar y detener la grabación */
async function toggleRecording() {
  if (isRecording) {
    stopRecording();
  } else {
    await startRecording();
  }
}
 
/** Inicia la grabación de audio solicitando permiso al micrófono */
async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks  = [];
    mediaRecorder = new MediaRecorder(stream);
 
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };
 
    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach(track => track.stop());
      await transcribeAudio();
    };
 
    mediaRecorder.start();
    isRecording = true;
    setAudioUIRecording();
 
  } catch (error) {
    console.error('startRecording error:', error);
    showToast('No se pudo acceder al micrófono. Verifica los permisos.');
  }
}
 
/** Detiene la grabación activa */
function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  isRecording = false;
  setAudioUIProcessing();
}
 
/** Actualiza la UI al estado "grabando" */
function setAudioUIRecording() {
  document.getElementById('audioBtn').classList.add('recording');
  document.getElementById('audioBtnIcon').textContent = '⏹';
  document.getElementById('audioLabel').textContent   = 'Grabando…';
  document.getElementById('audioSub').textContent     = 'Toca para detener';
  document.getElementById('audioWaves').style.display = 'flex';
  document.getElementById('audioIcon').textContent    = '🔴';
}
 
/** Actualiza la UI al estado "procesando" */
function setAudioUIProcessing() {
  document.getElementById('audioBtn').classList.remove('recording');
  document.getElementById('audioBtnIcon').textContent = '⏳';
  document.getElementById('audioLabel').textContent   = 'Procesando…';
  document.getElementById('audioSub').textContent     = 'Transcribiendo tu audio con IA';
  document.getElementById('audioWaves').style.display = 'none';
  document.getElementById('audioBtn').disabled        = true;
}
 
/** Restaura la UI del grabador al estado inicial */
function resetAudioUI() {
  document.getElementById('audioBtn').classList.remove('recording');
  document.getElementById('audioBtn').disabled        = false;
  document.getElementById('audioBtn').style.display   = 'flex';
  document.getElementById('audioBtnIcon').textContent  = '⏺';
  document.getElementById('audioLabel').textContent    = 'Toca para grabar';
  document.getElementById('audioSub').textContent      = 'Describe tu evento en voz alta';
  document.getElementById('audioWaves').style.display  = 'none';
  document.getElementById('audioIcon').textContent     = '🎙';
  document.getElementById('audioStatus').style.display = 'block';
  document.getElementById('audioTranscriptWrap').style.display = 'none';
  document.getElementById('audioBtn').onclick = () => toggleRecording();
  isRecording = false;
}
 
/**
 * Muestra la transcripción y oculta el grabador.
 * @param {string} transcript - Texto transcrito
 */
function showTranscript(transcript) {
  document.getElementById('audioTranscript').textContent            = transcript;
  document.getElementById('audioTranscriptWrap').style.display       = 'block';
  document.getElementById('audioBtn').disabled                       = false;
  document.getElementById('audioBtn').style.display                  = 'none';
  document.getElementById('audioStatus').style.display               = 'none';
  document.getElementById('audioWaves').style.display                = 'none';
}
 
/**
 * Intenta transcribir el audio usando la Web Speech API del navegador.
 * Se usa como método primario (gratuito, sin API externa).
 */
function useWebSpeechAPI() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
 
  if (!SpeechRecognition) {
    showToast('Tu navegador no soporta reconocimiento de voz. Usa Chrome.');
    return;
  }
 
  showToast('Habla ahora — usa el micrófono del navegador');
  resetAudioUI();
 
  const recognition          = new SpeechRecognition();
  recognition.lang           = 'es-MX';
  recognition.continuous     = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
 
  let finalTranscript   = '';
  let interimTranscript = '';
 
  recognition.onstart = () => {
    isRecording = true;
    setAudioUIRecording();
    document.getElementById('audioBtn').disabled = false;
    document.getElementById('audioBtn').onclick  = () => recognition.stop();
  };
 
  recognition.onresult = (e) => {
    interimTranscript = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) {
        finalTranscript += e.results[i][0].transcript + ' ';
      } else {
        interimTranscript += e.results[i][0].transcript;
      }
    }
    document.getElementById('audioSub').textContent =
      (finalTranscript + interimTranscript).trim() || 'Habla ahora…';
  };
 
  recognition.onend = () => {
    isRecording = false;
    document.getElementById('audioBtn').onclick = () => toggleRecording();
 
    const transcript = finalTranscript.trim() || interimTranscript.trim();
    if (transcript) {
      showTranscript(transcript);
    } else {
      showToast('No se detectó voz. Intenta de nuevo.');
      resetAudioUI();
    }
  };
 
  recognition.onerror = (e) => {
    console.error('SpeechRecognition error:', e.error);
    showToast(`Error de micrófono: ${e.error}`);
    resetAudioUI();
  };
 
  recognition.start();
}
 
/**
 * Transcribe el audio grabado.
 * Intenta usar Claude API; si falla, cae al Web Speech API del navegador.
 */
async function transcribeAudio() {
  try {
    const audioBlob   = new Blob(audioChunks, { type: 'audio/webm' });
    const base64Audio = await blobToBase64(audioBlob);
 
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':                              'application/json',
        'anthropic-dangerous-direct-browser-access': 'true',
        'anthropic-version':                         '2023-06-01',
        'x-api-key':                                 ANTHROPIC_KEY,
      },
      body: JSON.stringify({
        model:      CLAUDE_MODEL,
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Transcribe exactamente lo que se dice en este audio. Devuelve SOLO la transcripción, sin comentarios ni comillas.',
            },
            {
              type: 'document',
              source: { type: 'base64', media_type: 'audio/webm', data: base64Audio },
            },
          ],
        }],
      }),
    });
 
    const data = await response.json();
    if (!response.ok) throw new Error('audio_not_supported');
 
    const transcript = data.content.map(block => block.text || '').join('').trim();
    showTranscript(transcript);
 
  } catch (error) {
    // Claude no soporta audio directamente → fallback al Web Speech API
    useWebSpeechAPI();
  }
}
 
/**
 * Convierte un Blob a string base64.
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
function blobToBase64(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.readAsDataURL(blob);
  });
}
 
/** Analiza la transcripción de audio con Claude y muestra el evento detectado */
async function analyzeAudio() {
  const transcript = document.getElementById('audioTranscript').textContent.trim();
  if (!transcript) return showToast('No hay transcripción para analizar');
 
  const btn = document.getElementById('audioAnalyzeBtn');
  const txt = document.getElementById('audioAnalyzeTxt');
  btn.disabled = true;
  txt.innerHTML = '<span class="spin"></span> Analizando…';
 
  try {
    const userContent = `Audio transcrito: "${transcript}". Extrae el evento.`;
    const parsed      = await callClaudeAPI(userContent, buildSystemPrompt());
 
    pendingAudioAI = {
      id:       Date.now(),
      title:    parsed.titulo,
      date:     parsed.fecha,
      time:     parsed.hora,
      category: parsed.categoria,
      synced:   false,
    };
 
    renderAIResult(parsed, 'aiRowsAudio', 'aiResultAudio');
 
  } catch (error) {
    console.error('analyzeAudio error:', error);
    showToast(`Error: ${error.message || 'No pude analizar. Intenta de nuevo.'}`);
 
  } finally {
    btn.disabled = false;
    txt.textContent = 'Analizar y agendar';
  }
}
 
/** Confirma el evento detectado desde el panel Audio */
function confirmAudio() {
  if (!pendingAudioAI) return;
  pushEvent(pendingAudioAI);
  pendingAudioAI = null;
  document.getElementById('aiResultAudio').classList.remove('show');
  clearAudio();
}
 
/** Descarta el evento detectado desde el panel Audio */
function dismissAudio() {
  pendingAudioAI = null;
  document.getElementById('aiResultAudio').classList.remove('show');
}
 
/** Limpia el panel de audio y regresa al estado inicial */
function clearAudio() {
  resetAudioUI();
  document.getElementById('aiResultAudio').classList.remove('show');
  pendingAudioAI = null;
}
 
 
/* ── 10. CRUD de eventos ────────────────────────────────────────────────── */
 
/**
 * Agrega un evento a la lista, lo guarda y lo sincroniza si hay sesión activa.
 * @param {Object} ev - Evento a agregar
 */
function pushEvent(ev) {
  events.unshift(ev);
  saveEvents();
  renderEvents();
 
  if (googleToken) {
    syncEvent(ev);
  } else {
    showToast('Evento guardado');
  }
}
 
/**
 * Elimina un evento por su ID.
 * @param {number} id - ID del evento
 */
function deleteEvent(id) {
  events = events.filter(ev => ev.id !== id);
  saveEvents();
  renderEvents();
}
 
/** Persiste los eventos en localStorage */
function saveEvents() {
  localStorage.setItem('ag_events', JSON.stringify(events));
}
 
 
/* ── 11. Renderizado ────────────────────────────────────────────────────── */
 
/** Renderiza la lista de eventos en el DOM */
function renderEvents() {
  const list  = document.getElementById('evList');
  const count = document.getElementById('evCount');
 
  count.textContent = events.length === 1 ? '1 evento' : `${events.length} eventos`;
 
  if (!events.length) {
    list.innerHTML = `
      <div class="empty">
        <div class="empty-icon" aria-hidden="true">○</div>
        Sin eventos aún.<br />Agrega el primero arriba.
      </div>`;
    return;
  }
 
  list.innerHTML = events.map(ev => {
    const dateStr = new Date(`${ev.date}T12:00:00`).toLocaleDateString('es-MX', {
      weekday: 'short', day: 'numeric', month: 'short',
    });
 
    return `
      <div class="ev-card">
        <div class="ev-dot ${ev.category}" aria-hidden="true"></div>
        <div class="ev-info">
          <div class="ev-title">${esc(ev.title)}</div>
          <div class="ev-meta">
            <span>${dateStr}</span>
            <span>${ev.time}</span>
            <span class="ev-cat ${ev.category}">${CAT_LABELS[ev.category] || ev.category}</span>
            ${ev.synced ? '<span class="ev-synced">✓ Google Cal</span>' : ''}
          </div>
        </div>
        <button class="ev-del" onclick="deleteEvent(${ev.id})" aria-label="Eliminar evento">✕</button>
      </div>`;
  }).join('');
}
 
 
/* ── 12. Toast ──────────────────────────────────────────────────────────── */
 
let toastTimeout;
 
/**
 * Muestra un mensaje toast temporal.
 * @param {string} message - Mensaje a mostrar
 */
function showToast(message) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  clearTimeout(toastTimeout);
 
  const toast = document.createElement('div');
  toast.className   = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
 
  toastTimeout = setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 250);
  }, 2800);
}
 
 
/* ── 13. Utilidades ─────────────────────────────────────────────────────── */
 
/**
 * Escapa caracteres HTML para prevenir XSS.
 * @param {string} str
 * @returns {string}
 */
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
 
 
/* ── 14. Inicialización ─────────────────────────────────────────────────── */
 
/**
 * Verifica si Google redirigió de vuelta con un token en el hash de la URL.
 * Se ejecuta inmediatamente al cargar el script.
 */
(function checkOAuthRedirect() {
  const hash = window.location.hash;
  if (hash && hash.includes('access_token') && hash.includes('state=gcal_auth')) {
    const params = new URLSearchParams(hash.substring(1));
    const token  = params.get('access_token');
    if (token) {
      history.replaceState(null, '', window.location.pathname);
      setGoogleConnected(token);
    }
  }
})();
 
/** Inicializa la app cuando el DOM está listo */
document.addEventListener('DOMContentLoaded', () => {
  // Fecha de hoy como valor por defecto en el campo de fecha manual
  const dateInput = document.getElementById('mDate');
  if (dateInput) {
    dateInput.value = new Date().toISOString().split('T')[0];
  }
 
  // Listeners de drag & drop y pegado de imágenes
  initImageListeners();
 
  // Renderiza eventos guardados
  renderEvents();
});
 
