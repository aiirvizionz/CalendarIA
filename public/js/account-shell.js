/* Account navigation is independent from the critical CalendarIA app module. */
const ICON = Object.freeze({
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  person: '<circle cx="12" cy="8" r="3.5"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/>',
  tag: '<path d="M11 3H4a1 1 0 0 0-1 1v7l9 9a2 2 0 0 0 2.8 0l6.2-6.2a2 2 0 0 0 0-2.8L12 3Z"/><circle cx="7.5" cy="7.5" r="1"/>',
  theme: '<path d="M20.7 13A9 9 0 0 1 11 3.3 9 9 0 1 0 20.7 13Z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M10 2h4l.7 2.7 2.5 1.5 2.8-.7 2 3.5-2 2v3l2 2-2 3.5-2.8-.7-2.5 1.5L14 23h-4l-.7-2.7-2.5-1.5-2.8.7-2-3.5 2-2v-3l-2-2 2-3.5 2.8.7 2.5-1.5L10 2Z" transform="translate(0 -0.5) scale(.96)"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.5 2.5 0 0 1 4.8.9c0 1.8-2.6 2-2.6 4M12 17.2h.01"/>',
  logout: '<path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5M14 8l4 4-4 4M8 12h10"/>',
  close: '<path d="M5 5l14 14M19 5 5 19"/>',
  back: '<path d="m14 5-7 7 7 7M7 12h13"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/>',
  sparkle: '<path d="m12 2 2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6L12 2Z"/>',
  voice: '<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3"/>',
  list: '<path d="M9 6h12M9 12h12M9 18h12M3 6h.01M3 12h.01M3 18h.01"/>'
});

const ACTIONS = [
  { id: 'profile', label: 'Perfil', icon: 'person' },
  { id: 'categories', label: 'Categorías', icon: 'tag' },
  { id: 'theme', label: 'Tema', icon: 'theme' },
  { id: 'settings', label: 'Configuración', icon: 'settings' },
  { id: 'help', label: 'Centro de ayuda', icon: 'help' },
  { id: 'logout', label: 'Cerrar sesión', icon: 'logout' },
];
const $ = (id) => document.getElementById(id);
const svg = (id) => '<svg width="21" height="21" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + ICON[id] + '</svg>';

let authenticated = false;
let user = null;
let activeModal = '';
let previousFocus = null;
let themePreference = 'system';
let systemThemeQuery = null;

function loadTheme() {
  try {
    const saved = localStorage.getItem('calendaria:theme');
    if (['light', 'dark', 'system'].includes(saved)) themePreference = saved;
  } catch { /* Theme works without storage. */ }
  applyTheme();
}

function applyTheme() {
  const dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const resolved = themePreference === 'system' ? (dark ? 'dark' : 'light') : themePreference;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themePreference = themePreference;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#08090b' : '#f5f3ef');
  document.querySelectorAll('[data-theme-choice]').forEach((button) => {
    const selected = button.dataset.themeChoice === themePreference;
    button.setAttribute('aria-checked', String(selected));
    button.classList.toggle('is-selected', selected);
  });
}

function chooseTheme(choice) {
  if (!['light', 'dark', 'system'].includes(choice)) return;
  themePreference = choice;
  try { localStorage.setItem('calendaria:theme', choice); } catch { /* optional */ }
  applyTheme();
}

function navButton(item, className) {
  return '<button type="button" class="' + className + '" data-account-action="' + item.id +
    '" aria-label="' + item.label + '" title="' + item.label + '">' + svg(item.icon) +
    '<span>' + item.label + '</span></button>';
}

function buildAccountShell() {
  const header = document.querySelector('.site-header');
  const brand = header?.querySelector('.brand');
  const chip = $('userChip');
  if (!header || !brand || !chip || $('accountMenuTrigger')) return;

  const mobileToggle = document.createElement('button');
  mobileToggle.type = 'button';
  mobileToggle.id = 'accountMobileToggle';
  mobileToggle.className = 'account-mobile-toggle';
  mobileToggle.setAttribute('aria-controls', 'accountDrawer');
  mobileToggle.setAttribute('aria-expanded', 'false');
  mobileToggle.setAttribute('aria-label', 'Abrir menú');
  mobileToggle.innerHTML = svg('menu');
  header.insertBefore(mobileToggle, brand);

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.id = 'accountMenuTrigger';
  trigger.className = 'account-menu-trigger';
  trigger.hidden = true;
  trigger.setAttribute('aria-haspopup', 'menu');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', 'accountDropdown');
  chip.parentNode.insertBefore(trigger, chip);
  trigger.appendChild(chip);
  trigger.insertAdjacentHTML('beforeend', '<span class="account-trigger-chevron">' + svg('chevron') + '</span>');

  const rail = document.createElement('aside');
  rail.id = 'accountRail';
  rail.className = 'account-rail';
  rail.setAttribute('aria-label', 'Menú principal');
  rail.innerHTML = '<a class="account-rail-brand" href="/" title="CalendarIA" aria-label="Ir a CalendarIA"><img src="/assets/calendaria-logo.svg?v=3" alt=""></a>' +
    '<nav aria-label="Navegación principal" class="account-rail-nav">' +
    ACTIONS.filter((item) => item.id !== 'logout').map((item) => navButton(item, 'account-rail-button')).join('') +
    '</nav><div class="account-rail-bottom">' +
    navButton(ACTIONS[ACTIONS.length - 1], 'account-rail-button') + '</div>';
  document.body.appendChild(rail);

  const dropdown = document.createElement('div');
  dropdown.id = 'accountDropdown';
  dropdown.className = 'account-dropdown';
  dropdown.setAttribute('role', 'menu');
  dropdown.setAttribute('aria-label', 'Menú de cuenta');
  dropdown.hidden = true;
  dropdown.innerHTML = '<div class="account-dropdown-profile"><span id="accountDropdownName"></span><small id="accountDropdownEmail"></small></div>' +
    ACTIONS.map((item, index) => (index === ACTIONS.length - 1 ? '<div class="account-menu-divider"></div>' : '') + navButton(item, 'account-dropdown-button')).join('');
  document.body.appendChild(dropdown);

  const drawer = document.createElement('div');
  drawer.id = 'accountDrawerBackdrop';
  drawer.className = 'account-drawer-backdrop';
  drawer.hidden = true;
  drawer.innerHTML = '<aside id="accountDrawer" class="account-drawer" role="dialog" aria-modal="true" aria-label="Menú de CalendarIA">' +
    '<div class="account-drawer-heading"><div class="account-drawer-brand"><img src="/assets/calendaria-logo.svg?v=3" alt=""><strong>CalendarIA</strong></div>' +
    '<button type="button" class="account-icon-close" data-account-close="drawer" aria-label="Cerrar menú">' + svg('close') + '</button></div>' +
    '<div id="accountDrawerUser" class="account-drawer-user"></div>' +
    '<nav class="account-drawer-links" aria-label="Menú móvil">' + ACTIONS.map((item) => navButton(item, 'account-drawer-button')).join('') + '</nav></aside>';
  document.body.appendChild(drawer);

  const screen = document.createElement('section');
  screen.id = 'accountCategoriesScreen';
  screen.className = 'account-categories-screen';
  screen.setAttribute('aria-label', 'Categorías de eventos');
  screen.hidden = true;
  screen.innerHTML = '<div class="account-screen-bar"><button id="accountCategoriesBack" class="account-back-button" type="button">' +
    svg('back') + '<span>Volver a mi agenda</span></button><span class="account-screen-breadcrumb">Organiza tus eventos</span></div>' +
    '<div id="accountCategoriesMount" class="account-categories-mount"><div class="account-categories-loading">Preparando tus categorías…</div></div>';
  const shell = document.querySelector('.app-shell');
  shell?.parentNode.insertBefore(screen, shell.nextSibling);
  new MutationObserver(moveCategoriesIntoScreen).observe(document.body, { childList: true });
  moveCategoriesIntoScreen();

  const modal = document.createElement('div');
  modal.id = 'accountModalBackdrop';
  modal.className = 'account-modal-backdrop';
  modal.hidden = true;
  modal.innerHTML = '<section class="account-modal-window" role="dialog" aria-modal="true" aria-labelledby="accountModalTitle">' +
    '<div class="account-modal-top"><span id="accountModalKicker">CalendarIA</span>' +
    '<button class="account-icon-close" data-account-close="modal" type="button" aria-label="Cerrar">' + svg('close') + '</button></div>' +
    '<div id="accountModalContent"></div></section>';
  document.body.appendChild(modal);

  trigger.addEventListener('click', () => toggleDropdown());
  mobileToggle.addEventListener('click', () => openDrawer());
  $('accountCategoriesBack').addEventListener('click', () => navigateHome());
  dropdown.addEventListener('click', (event) => dispatchAction(event));
  rail.addEventListener('click', (event) => dispatchAction(event));
  drawer.addEventListener('click', (event) => dispatchAction(event));
  drawer.addEventListener('click', (event) => {
    if (event.target === drawer || event.target.closest('[data-account-close="drawer"]')) closeDrawer();
  });
  modal.addEventListener('click', (event) => {
    if (event.target === modal || event.target.closest('[data-account-close="modal"]')) closeModal();
    const choice = event.target.closest('[data-theme-choice]');
    if (choice) chooseTheme(choice.dataset.themeChoice);
    if (event.target.closest('[data-account-disconnect]')) disconnectGoogle();
  });
  document.addEventListener('pointerdown', (event) => {
    if (!event.target.closest('#accountDropdown, #accountMenuTrigger')) closeDropdown();
  });
  document.addEventListener('keydown', onGlobalKeydown);
  window.addEventListener('popstate', syncRoute);
  window.addEventListener('calendaria:auth-state', (event) => updateAccount(event.detail));
  window.addEventListener('calendaria:session-expired', () => updateAccount({ authenticated: false }));
  window.addEventListener('calendaria:session-expired', () => { closeDropdown(); closeDrawer(); closeModal(); });
  document.body.classList.add('account-shell-ready');
  syncRoute();
}

function moveCategoriesIntoScreen() {
  const section = $('eventCategoriesSection');
  const mount = $('accountCategoriesMount');
  if (section && mount && section.parentNode !== mount) {
    mount.replaceChildren(section);
  }
}

function updateAccount(detail = {}) {
  authenticated = Boolean(detail.authenticated);
  user = authenticated ? (detail.user || null) : null;
  const trigger = $('accountMenuTrigger');
  if (trigger) trigger.hidden = !authenticated;
  document.body.classList.toggle('account-has-session', authenticated);
  const name = user?.name || 'Mi cuenta';
  const email = user?.email || '';
  if ($('accountDropdownName')) $('accountDropdownName').textContent = name;
  if ($('accountDropdownEmail')) $('accountDropdownEmail').textContent = email;
  const target = $('accountDrawerUser');
  if (target) {
    target.replaceChildren();
    if (authenticated) {
      const img = document.createElement('img');
      if (user?.picture) {
        img.src = user.picture;
        img.referrerPolicy = 'no-referrer';
        img.alt = '';
        img.onerror = () => { img.style.display = 'none'; };
      } else img.style.display = 'none';
      const info = document.createElement('div');
      const strong = document.createElement('strong');
      strong.textContent = name;
      const small = document.createElement('small');
      small.textContent = email;
      info.append(strong, small);
      target.append(img, info);
    } else {
      target.textContent = 'Conecta Google para comenzar.';
    }
  }
  if (!authenticated) closeDropdown();
}

function toggleDropdown() {
  const dropdown = $('accountDropdown');
  const trigger = $('accountMenuTrigger');
  if (!dropdown || !trigger) return;
  if (!dropdown.hidden) { closeDropdown(); return; }
  closeDrawer();
  dropdown.hidden = false;
  trigger.setAttribute('aria-expanded', 'true');
  const rect = trigger.getBoundingClientRect();
  dropdown.style.top = Math.min(window.innerHeight - 20, rect.bottom + 10) + 'px';
  dropdown.style.right = Math.max(12, window.innerWidth - rect.right) + 'px';
  dropdown.querySelector('button')?.focus();
}

function closeDropdown() {
  if ($('accountDropdown')) $('accountDropdown').hidden = true;
  $('accountMenuTrigger')?.setAttribute('aria-expanded', 'false');
}

function openDrawer() {
  closeDropdown();
  previousFocus = document.activeElement;
  $('accountDrawerBackdrop').hidden = false;
  $('accountMobileToggle')?.setAttribute('aria-expanded', 'true');
  document.body.classList.add('account-drawer-open');
  $('accountDrawer')?.querySelector('[data-account-action]')?.focus();
}

function closeDrawer() {
  if (!$('accountDrawerBackdrop') || $('accountDrawerBackdrop').hidden) return;
  $('accountDrawerBackdrop').hidden = true;
  $('accountMobileToggle')?.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('account-drawer-open');
  if (!activeModal) previousFocus?.focus?.();
}

function dispatchAction(event) {
  const button = event.target.closest('[data-account-action]');
  if (!button) return;
  const action = button.dataset.accountAction;
  closeDropdown();
  closeDrawer();
  if (action === 'categories') { navigateCategories(); return; }
  if (action === 'logout') {
    if (authenticated) $('authButton')?.click();
    else $('authButton')?.click();
    return;
  }
  if (['profile', 'theme', 'settings', 'help'].includes(action)) openModal(action);
}

function navigateCategories() {
  if (location.pathname !== '/categories') history.pushState({ accountView: 'categories' }, '', '/categories');
  syncRoute();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function navigateHome() {
  if (location.pathname === '/categories') history.pushState({}, '', '/');
  syncRoute();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function syncRoute() {
  const isCategories = location.pathname === '/categories';
  if ($('accountCategoriesScreen')) $('accountCategoriesScreen').hidden = !isCategories;
  document.body.classList.toggle('account-view-categories', isCategories);
  document.querySelectorAll('[data-account-action="categories"]').forEach((button) => {
    button.classList.toggle('is-active', isCategories);
    if (isCategories) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  moveCategoriesIntoScreen();
  if (isCategories) $('accountCategoriesBack')?.focus({ preventScroll: true });
}

function themeChoices() {
  return '<div class="account-theme-choices" role="radiogroup" aria-label="Seleccionar tema">' +
    [{ id: 'light', title: 'Claro', text: 'Una interfaz luminosa.' },
      { id: 'dark', title: 'Oscuro', text: 'Ideal en ambientes de poca luz.' },
      { id: 'system', title: 'Del sistema', text: 'Se adapta a tu dispositivo.' }]
      .map((choice) => '<button class="account-theme-choice" type="button" role="radio" data-theme-choice="' + choice.id + '">' +
        '<span class="account-theme-preview account-theme-preview-' + choice.id + '"></span>' +
        '<span class="account-theme-description"><strong>' + choice.title + '</strong><small>' + choice.text + '</small></span>' +
        '<span class="account-theme-check">' + svg('check') + '</span></button>').join('') + '</div>';
}

function openModal(kind) {
  const modal = $('accountModalBackdrop');
  const content = $('accountModalContent');
  if (!modal || !content) return;
  closeDropdown();
  closeDrawer();
  previousFocus = document.activeElement;
  activeModal = kind;
  content.replaceChildren();

  if (kind === 'profile') {
    const photo = document.createElement('img');
    photo.className = 'account-profile-avatar';
    if (user?.picture) {
      photo.src = user.picture;
      photo.referrerPolicy = 'no-referrer';
      photo.alt = 'Foto de perfil';
    } else {
      photo.src = '/assets/calendaria-logo.svg?v=3';
      photo.alt = 'Avatar';
    }
    const heading = document.createElement('h2');
    heading.id = 'accountModalTitle';
    heading.textContent = authenticated ? (user?.name || 'Mi perfil') : 'Mi perfil';
    const email = document.createElement('p');
    email.className = 'account-profile-email';
    email.textContent = authenticated ? (user?.email || '') : 'Conecta Google para ver tu perfil.';
    const note = document.createElement('p');
    note.className = 'account-modal-note';
    note.textContent = 'Perfil conectado con Google. Tu contraseña nunca se comparte con CalendarIA.';
    const wrapper = document.createElement('div');
    wrapper.className = 'account-profile-card';
    wrapper.append(photo, heading, email, note);
    content.appendChild(wrapper);
  } else if (kind === 'theme') {
    content.innerHTML = '<h2 id="accountModalTitle">Elige cómo quieres ver CalendarIA</h2>' +
      '<p class="account-modal-intro">Puedes cambiar el tema cuando quieras.</p>' + themeChoices();
  } else if (kind === 'settings') {
    content.innerHTML = '<h2 id="accountModalTitle">Configuración</h2>' +
      '<p class="account-modal-intro">Tus preferencias y conexión, en un mismo lugar.</p>' +
      '<div class="account-settings-item"><span class="account-settings-item-icon">' + svg('person') + '</span><div>' +
      '<strong>Cuenta de Google</strong><p id="accountSettingsEmail"></p></div></div>' +
      '<div class="account-settings-item"><span class="account-settings-item-icon">' + svg('calendar') + '</span><div>' +
      '<strong>Zona horaria del dispositivo</strong><p id="accountSettingsTimeZone"></p></div></div>' +
      '<h3 class="account-settings-heading">Apariencia</h3>' + themeChoices() +
      '<div class="account-settings-links"><a href="/privacy.html">Privacidad</a><a href="/terms.html">Términos de servicio</a></div>' +
      '<button type="button" class="account-disconnect-button" data-account-disconnect>' +
      svg('logout') + 'Desconectar el acceso de Google</button>' +
      '<p class="account-modal-note">Esta acción cierra sesión y revoca el permiso actual; tus eventos permanecen en Google Calendar.</p>';
    $('accountSettingsEmail').textContent = authenticated ? (user?.email || 'Conectada') : 'No hay sesión conectada';
    $('accountSettingsTimeZone').textContent = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Según el sistema';
    content.querySelector('[data-account-disconnect]').disabled = !authenticated;
  } else if (kind === 'help') {
    const steps = [
      { icon: 'person', title: '1 · Conecta Google', description: 'Inicia sesión para ver tus eventos y guardar nuevas actividades.' },
      { icon: 'calendar', title: '2 · Elige cómo crear', description: 'Manual: completa los campos. Texto o imagen: descríbelo o sube una captura. Voz: dilo en voz alta.' },
      { icon: 'sparkle', title: '3 · Revisa lo que propone Gemini', description: 'Comprueba fecha, hora y categoría antes de guardar. Puedes cambiar cada dato.' },
      { icon: 'list', title: '4 · Consulta tu agenda', description: 'Alterna entre lista y calendario. Pulsa actualizar para traer los cambios de Google.' },
      { icon: 'tag', title: '5 · Organiza tus categorías', description: 'Crea nombres y colores propios; arrastra para ordenar y desliza hacia la izquierda para eliminar.' },
      { icon: 'help', title: '¿Algo no sale bien?', description: 'Si tu conexión expira, vuelve a entrar con Google. Tus eventos guardados permanecen en tu calendario.' }
    ];
    content.innerHTML = '<h2 id="accountModalTitle">Centro de ayuda</h2><p class="account-modal-intro">Todo lo esencial para aprovechar CalendarIA.</p>' +
      '<div class="account-help-steps">' + steps.map((step) => '<div class="account-help-step"><span>' +
        svg(step.icon) + '</span><div><strong>' + step.title + '</strong><p>' + step.description + '</p></div></div>').join('') +
      '</div><a class="account-help-guide" href="/welcome">Ver guía de bienvenida →</a>';
  }

  modal.hidden = false;
  document.body.classList.add('account-modal-open');
  applyTheme();
  modal.querySelector('[data-account-close]')?.focus();
}

function closeModal() {
  if (!activeModal) return;
  activeModal = '';
  $('accountModalBackdrop').hidden = true;
  document.body.classList.remove('account-modal-open');
  previousFocus?.focus?.();
}

async function disconnectGoogle() {
  if (!authenticated) return;
  if (!window.confirm('¿Desconectar CalendarIA de tu cuenta de Google? Tus eventos no se eliminarán.')) return;
  const button = document.querySelector('[data-account-disconnect]');
  if (button) button.disabled = true;
  try {
    const sessionResponse = await fetch('/api/session', { credentials: 'same-origin' });
    const session = await sessionResponse.json();
    if (!session.authenticated || !session.csrfToken) throw new Error('La sesión ha expirado. Vuelve a conectar Google.');
    const response = await fetch('/api/auth/google/disconnect', {
      method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-Token': session.csrfToken },
    });
    if (!response.ok) throw new Error('No se pudo desconectar Google. Inténtalo otra vez.');
    location.assign('/?disconnected=1');
  } catch (error) {
    if (button) button.disabled = false;
    const region = $('toastRegion');
    if (region) {
      const toast = document.createElement('div');
      toast.className = 'toast is-error';
      toast.textContent = error?.message || 'No se pudo desconectar la cuenta';
      region.appendChild(toast);
      window.setTimeout(() => toast.remove(), 5200);
    }
  }
}

function onGlobalKeydown(event) {
  if (event.key === 'Escape') {
    if (activeModal) closeModal();
    else if (!$('accountDrawerBackdrop')?.hidden) closeDrawer();
    else closeDropdown();
    return;
  }
  if (event.key !== 'Tab' || !activeModal) return;
  const focusables = [...$('accountModalBackdrop').querySelectorAll('a[href],button:not([disabled]),input:not([disabled])')]
    .filter((node) => node.offsetParent !== null);
  if (!focusables.length) return;
  const first = focusables[0], last = focusables[focusables.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

function initialize() {
  loadTheme();
  try {
    systemThemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    systemThemeQuery.addEventListener?.('change', () => { if (themePreference === 'system') applyTheme(); });
  } catch { /* matchMedia can be unavailable in tests. */ }
  buildAccountShell();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize, { once: true });
} else initialize();
