const $ = (id) => document.getElementById(id);

const ICONS = {
  menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  profile: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M5.5 20c.6-4 2.7-6 6.5-6s5.9 2 6.5 6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  categories: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="8" cy="7" r="1.7" fill="currentColor"/><circle cx="15" cy="12" r="1.7" fill="currentColor"/><circle cx="10" cy="17" r="1.7" fill="currentColor"/></svg>',
  theme: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9c0-.5 0-1-.1-1.4A7 7 0 0 1 12 3Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
  settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Zm8 3.8-2.1-1 .1-2.3-2.4-1.4-1.9 1.3-1.8-1.2-.2-2.3H9l-.2 2.3L7 8.6 5.1 7.3 2.7 8.7l.1 2.3-2.1 1 1.2 2.5 2.3-.3 1.1 1.9-1.4 1.8 1.8 2.1 2.1-1 1.7.7.5 2.3h2.8l.5-2.3 1.7-.7 2.1 1 1.8-2.1-1.4-1.8 1.1-1.9 2.3.3L20 12Z" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/></svg>',
  help: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M9.8 9a2.4 2.4 0 0 1 4.6.9c0 2-2.4 2.1-2.4 4M12 17.5h.01" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  logout: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 15.2A8 8 0 0 1 8.8 4 8.5 8.5 0 1 0 20 15.2Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
  system: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M8 21h8M12 17v4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
};

const state = {
  session: null,
  theme: 'system',
  media: window.matchMedia('(prefers-color-scheme: dark)'),
};

function safeTheme(value) {
  return ['light', 'dark', 'system'].includes(value) ? value : 'system';
}

function applyTheme(value, persist = true) {
  state.theme = safeTheme(value);
  const resolved = state.theme === 'system'
    ? (state.media.matches ? 'dark' : 'light')
    : state.theme;
  document.documentElement.dataset.calendarTheme = state.theme;
  document.documentElement.dataset.calendarThemeResolved = resolved;
  document.querySelectorAll('[data-theme-value]').forEach((button) => {
    button.classList.toggle('is-selected', button.dataset.themeValue === state.theme);
    button.setAttribute('aria-pressed', String(button.dataset.themeValue === state.theme));
  });
  if (persist) {
    try { localStorage.setItem('calendaria_theme', state.theme); } catch { /* optional */ }
  }
}

async function readSession() {
  try {
    const response = await fetch('/api/session', { credentials: 'same-origin', headers: { 'X-Time-Zone': Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' } });
    const payload = await response.json();
    state.session = payload || { authenticated: false };
    return state.session;
  } catch {
    state.session = { authenticated: false };
    return state.session;
  }
}

function avatarSource() {
  return state.session?.user?.picture || $('userAvatar')?.getAttribute('src') || '/assets/calendaria-logo.svg';
}

function userName() {
  return state.session?.user?.name || $('userName')?.textContent?.trim() || 'Usuario de CalendarIA';
}

function userEmail() {
  return state.session?.user?.email || '';
}

function authenticated() {
  return Boolean(state.session?.authenticated || !$('userChip')?.classList.contains('is-hidden'));
}

function syncAuthClass() {
  const isAuthenticated = authenticated();
  document.body.classList.toggle('is-authenticated', isAuthenticated);
  document.querySelectorAll('.account-auth-only').forEach((node) => node.classList.toggle('is-hidden', !isAuthenticated));
  const railAvatar = $('accountRailAvatar');
  const drawerAvatar = $('accountDrawerAvatar');
  if (railAvatar) railAvatar.src = avatarSource();
  if (drawerAvatar) drawerAvatar.src = avatarSource();
  const name = $('accountDrawerName');
  const email = $('accountDrawerEmail');
  if (name) name.textContent = userName();
  if (email) email.textContent = userEmail() || (isAuthenticated ? 'Cuenta de Google conectada' : 'Sin sesión');
}

function closeDrawer() {
  $('accountDrawerBackdrop')?.classList.add('is-hidden');
  document.body.classList.remove('is-account-drawer-open');
  $('accountMobileMenu')?.focus?.();
}

function openDrawer() {
  syncAuthClass();
  $('accountDrawerBackdrop')?.classList.remove('is-hidden');
  document.body.classList.add('is-account-drawer-open');
  window.setTimeout(() => $('accountDrawerClose')?.focus(), 0);
}

function closeModal() {
  $('accountModalBackdrop')?.classList.add('is-hidden');
  $('accountModalBody')?.replaceChildren();
  document.body.classList.remove('is-account-modal-open');
}

function openModal(title, subtitle, bodyBuilder) {
  closeDrawer();
  $('accountModalTitle').textContent = title;
  $('accountModalSubtitle').textContent = subtitle || '';
  const body = $('accountModalBody');
  body.replaceChildren();
  bodyBuilder(body);
  $('accountModalBackdrop').classList.remove('is-hidden');
  document.body.classList.add('is-account-modal-open');
  window.setTimeout(() => $('accountModalClose')?.focus(), 0);
}

function profileModal() {
  openModal('Perfil', 'Tu cuenta conectada con CalendarIA', (body) => {
    const card = document.createElement('div');
    card.className = 'account-profile-card';
    card.innerHTML = `
      <img class="account-profile-avatar" src="${avatarSource()}" alt="Foto de perfil">
      <h3></h3>
      <p></p>
    `;
    card.querySelector('h3').textContent = userName();
    card.querySelector('p').textContent = userEmail() || 'Cuenta de Google conectada';
    body.appendChild(card);
  });
}

function themeModal() {
  openModal('Tema', 'Elige cómo quieres ver CalendarIA', (body) => {
    const options = document.createElement('div');
    options.className = 'theme-options';
    options.innerHTML = `
      <button class="theme-option" type="button" data-theme-value="light" aria-pressed="false">${ICONS.sun}Claro</button>
      <button class="theme-option" type="button" data-theme-value="dark" aria-pressed="false">${ICONS.moon}Oscuro</button>
      <button class="theme-option" type="button" data-theme-value="system" aria-pressed="false">${ICONS.system}Sistema</button>
    `;
    options.addEventListener('click', (event) => {
      const button = event.target.closest('[data-theme-value]');
      if (!button) return;
      applyTheme(button.dataset.themeValue);
    });
    body.appendChild(options);
    applyTheme(state.theme, false);
  });
}

function settingsModal() {
  openModal('Configuración', 'Preferencias y estado de tu cuenta', (body) => {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div class="account-setting-group">
        <p class="account-setting-title">Cuenta y calendario</p>
        <div class="account-setting-row"><div><strong>Google Calendar</strong><br><span>Sincronización de eventos</span></div><strong>${authenticated() ? 'Conectado' : 'Desconectado'}</strong></div>
        <div class="account-setting-row"><div><strong>Zona horaria</strong><br><span>Usada para fechas y horas</span></div><strong>${Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'}</strong></div>
      </div>
      <div class="account-setting-group">
        <p class="account-setting-title">Interfaz</p>
        <button class="account-drawer-item" type="button" data-settings-theme>${ICONS.theme}<span>Tema</span><span>›</span></button>
      </div>
      <div class="account-setting-group">
        <p class="account-setting-title">Privacidad y ayuda</p>
        <a class="account-drawer-item" href="/privacy.html">${ICONS.profile}<span>Política de privacidad</span><span>↗</span></a>
        <a class="account-drawer-item" href="/terms.html">${ICONS.help}<span>Términos de servicio</span><span>↗</span></a>
      </div>
    `;
    wrapper.querySelector('[data-settings-theme]')?.addEventListener('click', themeModal);
    body.appendChild(wrapper);
  });
}

function helpModal() {
  openModal('Centro de ayuda', 'Guía rápida para empezar', (body) => {
    const steps = document.createElement('div');
    steps.className = 'help-steps';
    const items = [
      ['Manual', 'Escribe el evento, elige fecha, hora, categoría y aviso. Después pulsa Guardar evento.'],
      ['Texto o imagen', 'Describe lo que necesitas con lenguaje natural o sube una captura. Revisa siempre la propuesta antes de guardarla.'],
      ['Voz', 'Pulsa el micrófono, di el evento, fecha y hora, y confirma el resultado que prepara Gemini.'],
      ['Tus eventos', 'Alterna entre lista y calendario. Usa ↻ para actualizar y abre o elimina eventos desde sus controles.'],
      ['Categorías', 'Crea nombres y colores para organizar tus eventos. Arrastra para reordenar y guarda los cambios.'],
      ['Sincronización', 'Google Calendar es la fuente de verdad. Si tu autorización expira, CalendarIA te pedirá reconectar Google.'],
    ];
    items.forEach(([title, copy], index) => {
      const item = document.createElement('div');
      item.className = 'help-step';
      item.innerHTML = `<span class="help-step-index">${index + 1}</span><div><h3></h3><p></p></div>`;
      item.querySelector('h3').textContent = title;
      item.querySelector('p').textContent = copy;
      steps.appendChild(item);
    });
    body.appendChild(steps);
  });
}

function relocateCategoriesSection() {
  const section = $('eventCategoriesSection');
  const host = $('accountCategoriesHost');
  if (!section || !host || section.parentElement === host) return Boolean(section);
  host.appendChild(section);
  return true;
}

function openCategories() {
  closeDrawer();
  relocateCategoriesSection();
  $('accountCategoriesScreen')?.classList.remove('is-hidden');
  document.body.classList.add('is-account-screen-open');
  window.setTimeout(() => $('accountCategoriesClose')?.focus(), 0);
}

function closeCategories() {
  $('accountCategoriesScreen')?.classList.add('is-hidden');
  document.body.classList.remove('is-account-screen-open');
}

function logoutOrConnect() {
  closeDrawer();
  const authButton = $('authButton');
  if (authButton && !authButton.disabled) authButton.click();
}

function actionButton(action, label, icon, extra = '') {
  return `<button class="account-rail-action ${extra}" type="button" data-account-action="${action}" data-label="${label}" aria-label="${label}">${icon}</button>`;
}

function drawerItem(action, label, icon, extra = '') {
  return `<button class="account-drawer-item ${extra}" type="button" data-account-action="${action}">${icon}<span>${label}</span><span>›</span></button>`;
}

function buildUI() {
  if ($('accountDesktopRail')) return;

  const mobileMenu = document.createElement('button');
  mobileMenu.id = 'accountMobileMenu';
  mobileMenu.className = 'account-mobile-menu';
  mobileMenu.type = 'button';
  mobileMenu.setAttribute('aria-label', 'Abrir menú');
  mobileMenu.innerHTML = ICONS.menu;
  document.querySelector('.site-header')?.prepend(mobileMenu);

  const rail = document.createElement('aside');
  rail.id = 'accountDesktopRail';
  rail.className = 'account-desktop-rail';
  rail.setAttribute('aria-label', 'Menú de CalendarIA');
  rail.innerHTML = `
    <a class="account-rail-logo" href="/" aria-label="CalendarIA"><img src="/assets/calendaria-logo.svg" alt=""></a>
    <nav class="account-rail-nav">
      ${actionButton('profile', 'Perfil', ICONS.profile, 'account-auth-only')}
      ${actionButton('categories', 'Categorías', ICONS.categories, 'account-auth-only')}
      ${actionButton('theme', 'Tema', ICONS.theme)}
      ${actionButton('settings', 'Configuración', ICONS.settings)}
      ${actionButton('help', 'Centro de ayuda', ICONS.help)}
    </nav>
    <div class="account-rail-bottom">
      <button class="account-rail-action account-auth-only" type="button" data-account-action="profile" data-label="Perfil" aria-label="Perfil"><img id="accountRailAvatar" class="account-rail-avatar" src="/assets/calendaria-logo.svg" alt=""></button>
      ${actionButton('logout', 'Cerrar sesión', ICONS.logout, 'account-auth-only')}
    </div>`;
  document.body.appendChild(rail);

  const drawerBackdrop = document.createElement('div');
  drawerBackdrop.id = 'accountDrawerBackdrop';
  drawerBackdrop.className = 'account-drawer-backdrop is-hidden';
  drawerBackdrop.innerHTML = `
    <aside class="account-mobile-drawer" aria-label="Menú de CalendarIA">
      <div class="account-drawer-header">
        <div class="account-drawer-identity">
          <img id="accountDrawerAvatar" src="/assets/calendaria-logo.svg" alt="">
          <div><strong id="accountDrawerName">CalendarIA</strong><span id="accountDrawerEmail">Sin sesión</span></div>
        </div>
        <button id="accountDrawerClose" class="account-drawer-close" type="button" aria-label="Cerrar menú">×</button>
      </div>
      <nav class="account-drawer-nav">
        ${drawerItem('profile', 'Perfil', ICONS.profile, 'account-auth-only')}
        ${drawerItem('categories', 'Categorías', ICONS.categories, 'account-auth-only')}
        ${drawerItem('theme', 'Tema', ICONS.theme)}
        ${drawerItem('settings', 'Configuración', ICONS.settings)}
        ${drawerItem('help', 'Centro de ayuda', ICONS.help)}
      </nav>
      <div class="account-drawer-bottom">
        ${drawerItem('logout', 'Cerrar sesión', ICONS.logout, 'account-auth-only is-danger')}
      </div>
    </aside>`;
  document.body.appendChild(drawerBackdrop);

  const modal = document.createElement('div');
  modal.id = 'accountModalBackdrop';
  modal.className = 'account-modal-backdrop is-hidden';
  modal.innerHTML = `
    <section class="account-modal" role="dialog" aria-modal="true" aria-labelledby="accountModalTitle">
      <header class="account-modal-header"><div><h2 id="accountModalTitle"></h2><p id="accountModalSubtitle"></p></div><button id="accountModalClose" class="account-modal-close" type="button" aria-label="Cerrar">×</button></header>
      <div id="accountModalBody" class="account-modal-body"></div>
    </section>`;
  document.body.appendChild(modal);

  const categories = document.createElement('div');
  categories.id = 'accountCategoriesScreen';
  categories.className = 'account-screen-backdrop is-hidden';
  categories.innerHTML = `
    <section class="account-screen" role="dialog" aria-modal="true" aria-labelledby="accountCategoriesTitle">
      <header class="account-screen-header"><div><h2 id="accountCategoriesTitle">Categorías</h2><p>Organiza los nombres, colores y orden que usas al crear eventos.</p></div><button id="accountCategoriesClose" class="account-modal-close" type="button" aria-label="Cerrar categorías">×</button></header>
      <div id="accountCategoriesHost" class="account-categories-host"></div>
    </section>`;
  document.body.appendChild(categories);

  mobileMenu.addEventListener('click', openDrawer);
  $('accountDrawerClose')?.addEventListener('click', closeDrawer);
  drawerBackdrop.addEventListener('click', (event) => { if (event.target === drawerBackdrop) closeDrawer(); });
  $('accountModalClose')?.addEventListener('click', closeModal);
  modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
  $('accountCategoriesClose')?.addEventListener('click', closeCategories);
  categories.addEventListener('click', (event) => { if (event.target === categories) closeCategories(); });

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-account-action]');
    if (!button) return;
    const action = button.dataset.accountAction;
    if (action === 'profile') profileModal();
    else if (action === 'categories') openCategories();
    else if (action === 'theme') themeModal();
    else if (action === 'settings') settingsModal();
    else if (action === 'help') helpModal();
    else if (action === 'logout') logoutOrConnect();
  });

  $('userChip')?.setAttribute('role', 'button');
  $('userChip')?.setAttribute('tabindex', '0');
  $('userChip')?.addEventListener('click', profileModal);
  $('userChip')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); profileModal(); }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    closeDrawer();
    closeModal();
    closeCategories();
  });

  new MutationObserver(() => {
    syncAuthClass();
    relocateCategoriesSection();
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

  document.body.classList.add('account-nav-ready');
  relocateCategoriesSection();
  syncAuthClass();
}

async function initialize() {
  try {
    state.theme = safeTheme(localStorage.getItem('calendaria_theme') || 'system');
  } catch {
    state.theme = 'system';
  }
  applyTheme(state.theme, false);
  state.media.addEventListener?.('change', () => { if (state.theme === 'system') applyTheme('system', false); });
  buildUI();
  await readSession();
  syncAuthClass();

  window.addEventListener('calendaria:session-expired', async () => {
    state.session = { authenticated: false };
    syncAuthClass();
    closeCategories();
    closeModal();
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
else initialize();
