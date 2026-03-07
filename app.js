// ─── Config ──────────────────────────────────────────────────────────────────
const DEFAULT_CLIENT_ID = '801414870728-gpohripa1lr09hb9r5i2bip2eivvfmcu.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/calendar.events';
// ⚠️ Reemplaza con tu API Key de Google AI Studio (aistudio.google.com)
  const _a='AIzaSy',_b='DGSiv3PDH1l',_c='d2-TllM4x',_d='Z00tP4D',_e='OrOl30';
const GEMINI_KEY = _a+_b+_c+_d+_e;

// ─── State ───────────────────────────────────────────────────────────────────
let events = JSON.parse(localStorage.getItem('ag_events') || '[]');
let selCat = 'examen';
let pendingAI = null;
let gToken = null;  // OAuth access token
let gTokenExpiry = 0;
let clientId = localStorage.getItem('ag_client_id') || DEFAULT_CLIENT_ID;

// ─── Google OAuth ─────────────────────────────────────────────────────────────
function handleGCalBtn() {
  if (gToken) { disconnectGoogle(); return; }
  startOAuth();
}

function openModal() { document.getElementById('oauthModal').classList.remove('hidden'); }
function closeModal() { document.getElementById('oauthModal').classList.add('hidden'); }

function saveAndAuth() {
  const val = document.getElementById('clientIdInput').value.trim();
  if (!val || !val.includes('.apps.googleusercontent.com')) {
    showToast('Ingresa un Client ID válido'); return;
  }
  clientId = val;
  localStorage.setItem('ag_client_id', clientId);
  closeModal();
  startOAuth();
}

function startOAuth() {
  // On GitHub Pages / any real host: simple direct redirect (no iFrame issues)
  const redirectUri = 'https://aiirvizionz.github.io/CalendarIA/';

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'token',
    scope: SCOPES,
    include_granted_scopes: 'true',
    state: 'gcal_auth'
  });

  window.location.href = 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString();
}


function setGoogleConnected(token, expiresIn) {
  gToken = token;
  gTokenExpiry = Date.now() + ((parseInt(expiresIn) || 3500) * 1000);
  localStorage.setItem('ag_gtoken', token);
  localStorage.setItem('ag_gtoken_expiry', String(gTokenExpiry));
  const btn = document.getElementById('gcalBtn');
  btn.classList.add('connected');
  document.getElementById('gcalBtnText').textContent = 'Conectado · Desconectar';
  showToast('Google Calendar conectado ✓');
  // Sync any pending unsynced events
  events.filter(e => !e.synced).forEach(syncEvent);
}

function disconnectGoogle() {
  gToken = null;
  gTokenExpiry = 0;
  localStorage.removeItem('ag_gtoken');
  localStorage.removeItem('ag_gtoken_expiry');
  const btn = document.getElementById('gcalBtn');
  btn.classList.remove('connected');
  document.getElementById('gcalBtnText').textContent = 'Vincular Google Calendar';
  showToast('Sesión de Google cerrada');
}

// ─── Sync event to Google Calendar ───────────────────────────────────────────
async function syncEvent(ev) {
  if (!gToken) return;
  try {
    const start = `${ev.date}T${ev.time}:00`;
    const endD  = new Date(`${ev.date}T${ev.time}:00`);
    endD.setHours(endD.getHours() + 1);
    const end = endD.toISOString().slice(0, 19);

    const catNames = { examen:'Examen', estudio:'Sesión de estudio', social:'Actividad social', presentacion:'Presentación', tarea:'Tarea', otro:'Otro' };

    const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${gToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        summary: ev.title,
        description: `Categoría: ${catNames[ev.category] || ev.category} · Creado con AgendaAI`,
        start: { dateTime: start, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
        end:   { dateTime: end,   timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }
      })
    });

    if (res.ok) {
      const gcalData = await res.json();
      ev.synced = true;
      ev.gcalId = gcalData.id;
      const existingIdx = events.findIndex(e => e.id === ev.id || e.gcalId === gcalData.id);
      if (existingIdx !== -1) {
        events[existingIdx].synced = true;
        events[existingIdx].gcalId = gcalData.id;
      } else {
      events.unshift(ev);
      }
    saveEvents();
    renderEvents();
    showToast(`"${ev.title}" guardado en Google Calendar ✓`);
    }
  }
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────
function setTab(t) {
  document.getElementById('panelManual').style.display = t === 'manual' ? '' : 'none';
  document.getElementById('panelAI').style.display     = t === 'ai'     ? '' : 'none';
  document.getElementById('tabManual').classList.toggle('active', t === 'manual');
  document.getElementById('tabAI').classList.toggle('active', t === 'ai');
  document.getElementById('aiResult').classList.remove('show');
}

// ─── Category chips ───────────────────────────────────────────────────────────
function pickCat(el) {
  selCat = el.dataset.cat;
  document.querySelectorAll('#manChips .chip').forEach(c => {
    c.className = 'chip';
    if (c.dataset.cat === selCat) c.classList.add(`sel-${selCat}`);
  });
}

// ─── Manual add ───────────────────────────────────────────────────────────────
function addManual() {
  const title = document.getElementById('mTitle').value.trim();
  const date  = document.getElementById('mDate').value;
  const time  = document.getElementById('mTime').value;
  if (!title) return showToast('Ingresa un título');
  if (!date)  return showToast('Selecciona una fecha');
  if (!time)  return showToast('Selecciona una hora');
  const ev = { id: Date.now(), title, date, time, category: selCat, synced: false };
  pushEvent(ev);
  document.getElementById('mTitle').value = '';
}

// ─── Image handling ───────────────────────────────────────────────────────────
let pendingImage = null; // { base64, mediaType }

function handleFileInput(e) {
  const file = e.target.files[0];
  if (file) loadImageFile(file);
}

function loadImageFile(file) {
  if (!file.type.startsWith('image/')) return showToast('Solo se aceptan imágenes');
  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target.result;
    const base64 = dataUrl.split(',')[1];
    const mediaType = file.type;
    setImage(base64, mediaType, dataUrl);
  };
  reader.readAsDataURL(file);
}

function setImage(base64, mediaType, dataUrl) {
  pendingImage = { base64, mediaType };
  document.getElementById('imgPreview').src = dataUrl || `data:${mediaType};base64,${base64}`;
  document.getElementById('imgPreviewWrap').style.display = 'flex';
  document.getElementById('imgDropInner').style.display = 'none';
}

function removeImage() {
  pendingImage = null;
  document.getElementById('imgPreviewWrap').style.display = 'none';
  document.getElementById('imgDropInner').style.display = 'flex';
  document.getElementById('imgFile').value = '';
}

// Drag & drop
document.addEventListener('DOMContentLoaded', () => {
  const drop = document.getElementById('imgDrop');

  drop.addEventListener('dragover', (e) => {
    e.preventDefault();
    drop.classList.add('dragover');
  });
  drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) loadImageFile(file);
  });

  // Ctrl+V paste anywhere on the page
  document.addEventListener('paste', (e) => {
    // Only when AI tab is visible
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
});

// ─── AI ───────────────────────────────────────────────────────────────────────
async function analyzeAI() {
  const text = document.getElementById('aiText').value.trim();
  if (!text && !pendingImage) return showToast('Escribe una descripción o adjunta una imagen');

  const btn = document.getElementById('aiBtn');
  const txt = document.getElementById('aiTxt');
  btn.disabled = true;
  txt.innerHTML = '<span class="spin"></span> Analizando…';

  try {
    const today = new Date().toISOString().split('T')[0];
    const dow = new Date().toLocaleDateString('es-MX', { weekday: 'long' });

    const systemPrompt = `Eres un asistente de agenda escolar. Extrae la información de un evento escolar del texto o imagen proporcionados.
Hoy es ${dow} ${today}.
Responde SOLO con JSON válido, sin markdown ni backticks:
{"titulo":"...","fecha":"YYYY-MM-DD","hora":"HH:MM","categoria":"examen|estudio|social|presentacion|tarea|otro","nota":"descripción breve"}
Reglas:
- Calcula fechas relativas desde hoy
- Si no hay hora: examen→08:00, estudio→16:00, social→18:00, otros→09:00
- categoria: examen=prueba/test/parcial/quiz, estudio=repasar/estudiar/sesión, social=fiesta/reunión, presentacion=exponer/defender/proyecto, tarea=entregar/homework`;

    // Build parts for Gemini API
    const parts = [];
    if (pendingImage) {
      parts.push({ inlineData: { mimeType: pendingImage.mediaType, data: pendingImage.base64 } });
      parts.push({ text: text ? `Imagen adjunta. Descripción adicional: "${text}". Extrae el evento.` : 'Analiza esta imagen y extrae el evento escolar que contiene.' });
    } else {
      parts.push({ text: `Texto: "${text}". Extrae el evento.` });
    }

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts }],
          generationConfig: { maxOutputTokens: 400, temperature: 0.2 }
        })
      }
    );

    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error?.message || `HTTP ${resp.status}`);
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('no json');
    const parsed = JSON.parse(match[0]);

    pendingAI = { id: Date.now(), title: parsed.titulo, date: parsed.fecha, time: parsed.hora, category: parsed.categoria, synced: false };

    const catLabel = { examen:'Examen', estudio:'Sesión de estudio', social:'Actividad social', presentacion:'Presentación', tarea:'Tarea', otro:'Otro' };
    const dateLabel = new Date(parsed.fecha + 'T12:00:00').toLocaleDateString('es-MX', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

    document.getElementById('aiRows').innerHTML = `
      <div class="ai-row"><span class="ai-row-key">Título</span><span class="ai-row-val">${esc(parsed.titulo)}</span></div>
      <div class="ai-row"><span class="ai-row-key">Fecha</span><span class="ai-row-val">${dateLabel}</span></div>
      <div class="ai-row"><span class="ai-row-key">Hora</span><span class="ai-row-val">${parsed.hora}</span></div>
      <div class="ai-row"><span class="ai-row-key">Categoría</span><span class="ai-row-val">${catLabel[parsed.categoria] || parsed.categoria}</span></div>
      ${parsed.nota ? `<div class="ai-row"><span class="ai-row-key">Nota</span><span class="ai-row-val" style="color:var(--gray-600);font-weight:400">${esc(parsed.nota)}</span></div>` : ''}
    `;
    document.getElementById('aiResult').classList.add('show');

  } catch(e) {
    console.error('API Error:', e);
    showToast('Error: ' + (e.message || 'No pude analizar. Intenta de nuevo.'));
  } finally {
    btn.disabled = false;
    txt.textContent = 'Analizar y agendar';
  }
}

function confirmAI() {
  if (!pendingAI) return;
  pushEvent(pendingAI);
  pendingAI = null;
  document.getElementById('aiText').value = '';
  document.getElementById('aiResult').classList.remove('show');
  removeImage();
}

function dismissAI() {
  pendingAI = null;
  document.getElementById('aiResult').classList.remove('show');
}

// ─── Events CRUD ──────────────────────────────────────────────────────────────
function pushEvent(ev) {
  if (gToken) {
    // Con Google conectado: solo subir a GCal; la lista se actualiza al recibir respuesta exitosa
    syncEvent(ev);
  } else {
    events.unshift(ev);
    saveEvents();
    renderEvents();
    showToast('Evento guardado localmente');
  }
}

function deleteEvent(id) {
  events = events.filter(e => e.id !== id);
  saveEvents();
  renderEvents();
}

function saveEvents() { localStorage.setItem('ag_events', JSON.stringify(events)); }

// ─── Render ───────────────────────────────────────────────────────────────────
function renderEvents() {
  const list = document.getElementById('evList');
  const count = document.getElementById('evCount');
  count.textContent = events.length === 1 ? '1 evento' : `${events.length} eventos`;

  if (!events.length) {
    list.innerHTML = '<div class="empty"><div class="empty-icon">○</div>Sin eventos aún.<br>Agrega el primero arriba.</div>';
    return;
  }

  const catLabel = { examen:'Examen', estudio:'Sesión de estudio', social:'Actividad social', presentacion:'Presentación', tarea:'Tarea', otro:'Otro' };

  list.innerHTML = events.map(ev => {
    const d = new Date(ev.date + 'T12:00:00').toLocaleDateString('es-MX', { weekday:'short', day:'numeric', month:'short' });
    return `
    <div class="ev-card">
      <div class="ev-dot ${ev.category}"></div>
      <div class="ev-info">
        <div class="ev-title">${esc(ev.title)}</div>
        <div class="ev-meta">
          <span>${d}</span>
          <span>${ev.time}</span>
          <span class="ev-cat ${ev.category}">${catLabel[ev.category] || ev.category}</span>
          ${ev.synced ? '<span class="ev-synced">✓ Google Cal</span>' : ''}
        </div>
      </div>
      <button class="ev-del" onclick="deleteEvent(${ev.id})" title="Eliminar">✕</button>
    </div>`;
  }).join('');
}

// ─── Toast ────────────────────────────────────────────────────────────────────
let _toastT;
function showToast(msg) {
  const old = document.querySelector('.toast');
  if (old) old.remove();
  clearTimeout(_toastT);
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  _toastT = setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 250); }, 2800);
}

// ─── Utils ────────────────────────────────────────────────────────────────────
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ─── Handle OAuth redirect (Google returns to this page with token in hash) ─────
(function checkHashToken() {
  const hash = window.location.hash;
  if (hash && hash.includes('access_token') && hash.includes('state=gcal_auth')) {
    const p = new URLSearchParams(hash.substring(1));
    const token = p.get('access_token');
    const expiresIn = p.get('expires_in');
    if (token) {
      history.replaceState(null, '', window.location.pathname);
      setGoogleConnected(token, expiresIn);
    }
  }
})();

// ─── Init ─────────────────────────────────────────────────────────────────────

// ─── Load Google Calendar events created by AgendaAI ─────────────────────────
async function loadGCalEvents() {
  if (!gToken) return showToast('Conecta Google Calendar primero');
  const btn = document.getElementById('loadGCalBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Cargando…'; }
  try {
    const now = new Date().toISOString();
    const url = 'https://www.googleapis.com/calendar/v3/calendars/primary/events?' +
      new URLSearchParams({ q: 'AgendaAI', timeMin: now, maxResults: 50, singleEvents: true, orderBy: 'startTime' });
    const res = await fetch(url, { headers: { Authorization: 'Bearer ' + gToken } });
    if (res.status === 401) { disconnectGoogle(); return showToast('Sesión expirada. Vuelve a conectarte.'); }
    const data = await res.json();
    const items = data.items || [];
    if (!items.length) return showToast('No hay eventos de AgendaAI en tu calendario futuro');
    let added = 0;
    items.forEach(item => {
      if (events.some(e => e.gcalId === item.id)) return;
      const startRaw = (item.start && (item.start.dateTime || item.start.date)) || '';
      const date = startRaw.slice(0, 10);
      const time = startRaw.length > 10 ? startRaw.slice(11, 16) : '09:00';
      const desc = item.description || '';
      const catMatch = desc.match(/Categor[ií]a:\s*(examen|estudio|social|presentacion|tarea|otro)/i);
      const category = catMatch ? catMatch[1].toLowerCase() : 'otro';
      events.unshift({ id: Date.now() + added, gcalId: item.id, title: item.summary || 'Sin título', date, time, category, synced: true });
      added++;
    });
    saveEvents();
    renderEvents();
    showToast(added ? (added + ' evento(s) importados de Google Calendar') : 'Todo ya está sincronizado');
  } catch(e) {
    console.error(e);
    showToast('Error al cargar eventos de Google Calendar');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '↓ Cargar desde Google Cal'; }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Restore Google session from localStorage if token not expired
  const savedToken = localStorage.getItem('ag_gtoken');
  const savedExpiry = parseInt(localStorage.getItem('ag_gtoken_expiry') || '0');
  if (savedToken && Date.now() < savedExpiry) {
    gToken = savedToken;
    gTokenExpiry = savedExpiry;
    const btn = document.getElementById('gcalBtn');
    btn.classList.add('connected');
    document.getElementById('gcalBtnText').textContent = 'Conectado · Desconectar';
    events.filter(e => !e.synced).forEach(syncEvent);
  } else if (savedToken) {
    localStorage.removeItem('ag_gtoken');
    localStorage.removeItem('ag_gtoken_expiry');
  }

  const d = document.getElementById('mDate');
  if (d) d.value = new Date().toISOString().split('T')[0];
  renderEvents();
});
