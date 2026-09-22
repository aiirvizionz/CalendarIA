// CalendarIA navigation: one accessible menu and one reusable dialog for app settings.
const $ = (id) => document.getElementById(id);
const mobileQuery = window.matchMedia('(max-width: 760px)');
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
const icons = {
  home: '<path d="m3 11 9-8 9 8v9a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  categories: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  theme: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z"/>',
  settings: '<path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1"/><circle cx="12" cy="12" r="4"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.3 9a2.8 2.8 0 0 1 5.4 1c0 1.9-2.7 2.1-2.7 4"/><path d="M12 17h.01"/>',
  logout: '<path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M13 7l5 5-5 5m5-5H8"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M5 5l14 14M19 5 5 19"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
};
const glyph = (name) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + icons[name] + '</svg>';
const entries = [
  ['home', 'Inicio'],
  ['profile', 'Perfil'],
  ['categories', 'Categorías'],
  ['theme', 'Tema'],
  ['settings', 'Configuración'],
  ['help', 'Centro de ayuda'],
];
let session = { authenticated: false, integrations: null };
let page = 'home';
let drawerOpen = false;
let lastFocused = null;

function preference() {
  try {
    const saved = localStorage.getItem('calendaria:theme');
    if (['light', 'dark', 'system'].includes(saved)) return saved;
  } catch { /* Private browsing may disable localStorage. */ }
  return 'system';
}
function applyTheme(value, save = true) {
  if (!['light', 'dark', 'system'].includes(value)) return;
  if (save) {
    try { localStorage.setItem('calendaria:theme', value); } catch { /* Optional preference. */ }
  }
  const resolved = value === 'system' ? (systemTheme.matches ? 'dark' : 'light') : value;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themePreference = value;
  const stylesheet = $('darkThemeStyles');
  if (stylesheet) stylesheet.media = resolved === 'dark' ? 'all' : 'not all';
  document.querySelectorAll('input[name="calendar-theme"]').forEach((input) => {
    input.checked = input.value === value;
  });
  document.querySelectorAll('[data-theme-summary]').forEach((node) => {
    node.textContent = { light: 'Claro', dark: 'Oscuro', system: 'Preferencia del sistema' }[value];
  });
}
function themeChoices() {
  return '<fieldset class="menu-theme-choices"><legend>Elige la apariencia de CalendarIA</legend>' +
    [['system', 'Automático', 'Sigue el tema de tu dispositivo'], ['light', 'Claro', 'Interfaz luminosa'], ['dark', 'Oscuro', 'Interfaz oscura']]
      .map(([value, label, description]) =>
        '<label class="menu-theme-option"><input type="radio" name="calendar-theme" value="' + value + '"><span><strong>' +
        label + '</strong><small>' + description + '</small></span></label>').join('') + '</fieldset>';
}

function setDrawer(open) {
  drawerOpen = Boolean(open && mobileQuery.matches);
  const sidebar = $('appSidebar');
  if (!sidebar) return;
  sidebar.classList.toggle('is-open', drawerOpen);
  sidebar.setAttribute('aria-hidden', String(mobileQuery.matches && !drawerOpen));
  $('drawerBackdrop').classList.toggle('is-visible', drawerOpen);
  $('drawerBackdrop').hidden = !drawerOpen;
  $('menuToggle').setAttribute('aria-expanded', String(drawerOpen));
  document.body.classList.toggle('menu-open', drawerOpen);
  if (drawerOpen) sidebar.querySelector('[data-nav="home"]')?.focus();
  else if (open === false && mobileQuery.matches && sidebar.contains(document.activeElement)) $('menuToggle').focus();
}
function setPage(nextPage) {
  if (!['home', 'categories'].includes(nextPage)) return;
  page = nextPage;
  document.body.dataset.page = nextPage;
  document.querySelectorAll('[data-nav="home"], [data-nav="categories"]').forEach((button) => {
    const current = button.dataset.nav === nextPage;
    button.classList.toggle('is-active', current);
    if (current) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  setDrawer(false);
  window.scrollTo({ top: 0, behavior: 'instant' });
  if (nextPage === 'categories') $('eventCategoriesTitle')?.focus?.();
  else $('tabManual')?.focus?.();
}

function updateAccount(current) {
  session = current || { authenticated: false, integrations: null };
  const active = Boolean(session.authenticated);
  $('menuAccountName').textContent = active ? session.user?.name || session.user?.email || 'Cuenta de Google' : 'Invitado';
  $('menuAccountEmail').textContent = active ? session.user?.email || '' : 'Conecta tu cuenta para comenzar';
  const photo = $('menuAccountPhoto');
  photo.classList.toggle('is-hidden', !active || !session.user?.picture);
  const fallback = $('menuAccountFallback');
  fallback.classList.toggle('is-hidden', active && Boolean(session.user?.picture));
  fallback.textContent = active ? (session.user?.name || session.user?.email || '?').charAt(0).toUpperCase() : '?';
  if (active && session.user?.picture && /^https:\/\//i.test(session.user.picture)) {
    photo.src = session.user.picture;
    photo.onerror = () => { photo.classList.add('is-hidden'); fallback.classList.remove('is-hidden'); };
  } else photo.removeAttribute('src');
  const signout = $('sidebarLogout');
  signout.textContent = active ? 'Cerrar sesión' : 'Conectar Google';
  signout.setAttribute('aria-label', active ? 'Cerrar sesión' : 'Conectar Google');
  $('sidebarLogoutIcon').innerHTML = glyph(active ? 'logout' : 'arrow');
}
function modalFrame(title, subtitle, content, footer = '') {
  const dialog = $('appDialog');
  lastFocused = document.activeElement;
  $('appDialogTitle').textContent = title;
  $('appDialogSubtitle').textContent = subtitle || '';
  $('appDialogBody').innerHTML = content;
  $('appDialogFooter').innerHTML = footer;
  $('appDialogFooter').classList.toggle('is-hidden', !footer);
  setDrawer(false);
  if (!dialog.open) dialog.showModal();
  $('appDialogClose').focus();
}
function closeDialog() {
  const dialog = $('appDialog');
  if (dialog.open) dialog.close();
}
function openProfile() {
  modalFrame('Tu perfil', 'Cuenta conectada con Google', '<div class="menu-profile">' +
    '<div class="menu-profile-avatar"><img id="dialogAvatar" alt="" referrerpolicy="no-referrer"><span id="dialogAvatarFallback"></span></div>' +
    '<strong id="dialogName"></strong><span id="dialogEmail"></span><span id="dialogStatus" class="menu-status"></span></div>',
    '<button class="button button-secondary" type="button" data-modal-action="close">Cerrar</button>');
  const active = Boolean(session.authenticated);
  $('dialogName').textContent = active ? session.user?.name || session.user?.email || 'Cuenta de Google' : 'Inicia sesión con Google';
  $('dialogEmail').textContent = active ? session.user?.email || '' : 'Aún no hay una cuenta conectada.';
  $('dialogStatus').textContent = active ? '● Cuenta conectada' : '○ Sesión no iniciada';
  const avatar = $('dialogAvatar');
  const fallback = $('dialogAvatarFallback');
  fallback.textContent = active ? (session.user?.name || session.user?.email || '?').charAt(0).toUpperCase() : '?';
  avatar.hidden = true;
  if (active && /^https:\/\//i.test(session.user?.picture || '')) {
    avatar.onload = () => { avatar.hidden = false; fallback.hidden = true; };
    avatar.onerror = () => { avatar.hidden = true; fallback.hidden = false; };
    avatar.src = session.user.picture;
  }
  if (!active) $('appDialogFooter').innerHTML = '<button type="button" class="button button-primary" data-modal-action="connect">Conectar Google</button>';
}
function openSettings() {
  const active = Boolean(session.authenticated);
  const email = active ? session.user?.email || '' : 'No conectada';
  const content = '<div class="menu-settings-group"><h3>Apariencia</h3>' + themeChoices() +
    '</div><div class="menu-settings-group"><h3>Google Calendar</h3>' +
    '<div class="menu-setting-line"><span><strong>Cuenta</strong><small id="settingsEmail"></small></span><span class="menu-status" id="settingsStatus"></span></div>' +
    '<div class="menu-setting-line"><span><strong>Zona horaria</strong><small id="settingsTimeZone"></small></span></div>' +
    '<div class="menu-setting-actions"><button type="button" class="button button-secondary" data-modal-action="sync"' + (active ? '' : ' disabled') + '>Actualizar eventos</button>' +
    '<button type="button" class="button button-ghost menu-danger" data-modal-action="disconnect"' + (active ? '' : ' disabled') + '>Desconectar Google</button></div>' +
    '<p id="menuSettingsFeedback" class="menu-feedback" role="status" aria-live="polite"></p></div>';
  modalFrame('Configuración', 'Controla tu experiencia y tu conexión.', content, '<button class="button button-primary" type="button" data-modal-action="close">Listo</button>');
  $('settingsEmail').textContent = email;
  $('settingsStatus').textContent = active ? 'Conectada' : 'Sin conexión';
  $('settingsTimeZone').textContent = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Hora del dispositivo';
  applyTheme(preference(), false);
}
function openHelp() {
  const topics = [
    ['01', 'Crear manualmente', 'Escribe el título, selecciona fecha, hora y categoría, elige cuándo recibir avisos y pulsa Guardar evento.'],
    ['02', 'Texto o imagen con IA', 'Describe lo que necesitas o adjunta una captura. Gemini propone los datos del evento para que puedas revisarlos antes de guardarlo.'],
    ['03', 'Dictar por voz', 'Pulsa el micrófono, menciona qué quieres agendar y vuelve a pulsar para terminar. Revisa la propuesta antes de confirmar.'],
    ['04', 'Consultar tu agenda', 'Tus eventos se sincronizan con Google Calendar. Alterna entre lista y calendario, o usa Actualizar para obtener los cambios más recientes.'],
    ['05', 'Organizar categorías', 'En el menú Categorías puedes crear, renombrar, ordenar y asignar colores a tus eventos. Guarda los cambios al terminar.'],
    ['06', 'Avisos y conexión', 'Los recordatorios aparecen mediante Google Calendar. Si tu permiso de Google caduca, vuelve a conectar tu cuenta.']
  ];
  const html = '<div class="menu-help-grid">' + topics.map(([number, title, description]) =>
    '<article class="menu-help-card"><span class="menu-help-number">' + number + '</span><div><h3>' + title + '</h3><p>' + description + '</p></div></article>').join('') + '</div>';
  modalFrame('Centro de ayuda', 'Una guía rápida para comenzar.', html,
    '<button type="button" class="button button-ghost" data-modal-action="categories">Ir a categorías</button>' +
    '<button type="button" class="button button-primary" data-modal-action="home">Crear un evento</button>');
}
function openTheme() {
  modalFrame('Tema', 'Personaliza cómo se ve tu agenda.', themeChoices(),
    '<button class="button button-primary" type="button" data-modal-action="close">Listo</button>');
  applyTheme(preference(), false);
}
function signOut() {
  setDrawer(false);
  const button = $('authButton');
  if (button && !button.disabled) button.click();
}
async function disconnectGoogle(button) {
  if (!session.authenticated) return;
  if (button.dataset.confirm !== 'true') {
    button.dataset.confirm = 'true';
    button.textContent = 'Confirmar desconexión';
    $('menuSettingsFeedback').textContent = 'Se revocará el permiso de CalendarIA para esta cuenta. Tus eventos existentes seguirán en Google Calendar.';
    return;
  }
  button.disabled = true;
  button.textContent = 'Desconectando…';
  try {
    const response = await fetch('/api/auth/google/disconnect', {
      method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-Token': session.csrfToken || '' },
    });
    if (!response.ok) throw new Error('No se pudo desconectar. Intenta nuevamente.');
    window.dispatchEvent(new CustomEvent('calendaria:session-reset', { detail: { reason: 'disconnected' } }));
    updateAccount({ authenticated: false, integrations: session.integrations });
    closeDialog();
  } catch (error) {
    $('menuSettingsFeedback').textContent = error.message;
    button.disabled = false;
    button.textContent = 'Reintentar desconexión';
  }
}
function onNavAction(action) {
  if (action === 'home' || action === 'categories') return setPage(action);
  if (action === 'logout') return signOut();
  ({ profile: openProfile, theme: openTheme, settings: openSettings, help: openHelp })[action]?.();
}
function initialize() {
  if (!$('appSidebar')) return;
  $('appSidebar').querySelectorAll('[data-nav]').forEach((button) =>
    button.addEventListener('click', () => onNavAction(button.dataset.nav)));
  $('menuToggle').addEventListener('click', () => setDrawer(!drawerOpen));
  $('drawerBackdrop').addEventListener('click', () => setDrawer(false));
  $('appDialogClose').addEventListener('click', closeDialog);
  $('appDialog').addEventListener('click', (event) => {
    if (event.target === $('appDialog')) closeDialog();
  });
  $('appDialog').addEventListener('close', () => { lastFocused?.focus?.(); });
  $('appDialog').addEventListener('change', (event) => {
    if (event.target.matches('input[name="calendar-theme"]')) applyTheme(event.target.value);
  });
  $('appDialog').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-modal-action]');
    if (!button) return;
    const action = button.dataset.modalAction;
    if (action === 'close') closeDialog();
    if (action === 'connect') { closeDialog(); signOut(); }
    if (action === 'sync') { $('refreshEventsButton')?.click(); $('menuSettingsFeedback').textContent = 'Actualizando tu calendario…'; }
    if (action === 'disconnect') await disconnectGoogle(button);
    if (action === 'home' || action === 'categories') { closeDialog(); setPage(action); }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && drawerOpen) setDrawer(false);
    if (event.key === 'Tab' && drawerOpen && mobileQuery.matches) {
      const focusable = [...$('appSidebar').querySelectorAll('button:not(:disabled), a[href]')];
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  mobileQuery.addEventListener('change', () => setDrawer(false));
  systemTheme.addEventListener('change', () => { if (preference() === 'system') applyTheme('system', false); });
  window.addEventListener('calendaria:session-changed', (event) => updateAccount(event.detail));
  window.addEventListener('calendaria:session-reset', () => updateAccount({ authenticated: false, integrations: session.integrations }));
  window.addEventListener('calendaria:auth-expired', () => updateAccount({ authenticated: false, integrations: session.integrations }));
  applyTheme(preference(), false);
  setPage('home');
  $('appSidebar').setAttribute('aria-hidden', String(mobileQuery.matches));
  // Session initialization also happens in app.js; this read provides the
  // account profile promptly if the navigation module loaded after it.
  fetch('/api/session', { credentials: 'same-origin' }).then((response) => response.json())
    .then((data) => updateAccount(data)).catch(() => {});
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
else initialize();
