
/* CalendarIA application navigation. No third-party UI dependencies. */
const NAV_THEME_KEY = 'calendaria:theme';
const NAV_VIEW_KEY = 'calendaria:current-view';
const NAV_REMINDER_KEY = 'calendaria:default-reminders';
const NAV_ALLOWED_REMINDERS = [10, 60, 360, 1440, 10080];
const NAV_REMINDER_LABELS = {10:'10 minutos',60:'1 hora',360:'6 horas',1440:'1 día',10080:'1 semana'};
const NAV_ICONS = {
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  categories: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  theme: '<path d="M12 3a9 9 0 1 0 9 9c-5 2-11-4-9-9Z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.5 14.5 21 16l-3 4-2-1.5a8 8 0 0 1-3 1l-1 2h-4l-.4-2.1a8 8 0 0 1-3-1l-2 1.1-2.5-4 1.7-1.8a8 8 0 0 1 0-3.4L.1 8.5l2.5-4 2 1.1a8 8 0 0 1 3-1L8 2.5h4l1 2.1a8 8 0 0 1 3 1l2-1.1 3 4-1.5 1.5a8 8 0 0 1 0 4.5Z"/>',
  help: '<path d="M4 19.5V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2m0-1a2 2 0 0 1 2-2h13"/><path d="M11 8a2 2 0 1 1 2 2c-1 1-1 1.5-1 2m0 3h.01"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>'
};
const navState = { session: {authenticated:false,integrations:null}, view:'home', theme:'system', media: null, returnFocus:null };
function navSvg(name) {
  return '<svg viewBox="0 0 24 24" aria-hidden="true">' + (NAV_ICONS[name] || NAV_ICONS.home) + '</svg>';
}
function safeLocalGet(key) { try { return window.localStorage.getItem(key); } catch { return null; } }
function safeLocalSet(key, value) { try { window.localStorage.setItem(key,value); } catch { /* Preferences remain usable for this tab. */ } }
function safeSessionGet(key) { try { return window.sessionStorage.getItem(key); } catch { return null; } }
function safeSessionSet(key, value) { try { window.sessionStorage.setItem(key,value); } catch { /* Optional. */ } }
function notify(message, kind) {
  const region=document.getElementById('toastRegion');
  if(!region)return;
  const item=document.createElement('div');
  item.className='toast' + (kind==='error'?' is-error':kind==='success'?' is-success':'');
  item.textContent=message;
  region.append(item);
  window.setTimeout(()=>item.remove(),5200);
}
function applyTheme() {
  const isDark=navState.theme==='dark' || (navState.theme==='system' && navState.media?.matches);
  const darkSheet=document.querySelector('link[href*="/dark-theme.css"]');
  if(darkSheet)darkSheet.disabled=!isDark;
  document.documentElement.dataset.calendarTheme=isDark?'dark':'light';
  document.documentElement.style.colorScheme=isDark?'dark':'light';
  document.querySelectorAll('input[name="nav-theme"]').forEach(input=>{input.checked=input.value===navState.theme;});
}
try {
  const savedTheme=safeLocalGet(NAV_THEME_KEY);
  navState.theme=['light','dark','system'].includes(savedTheme)?savedTheme:'system';
  navState.media=window.matchMedia('(prefers-color-scheme: dark)');
  navState.media.addEventListener('change',()=>{if(navState.theme==='system')applyTheme();});
} catch { navState.theme='system'; }
applyTheme();
function navButton(action,label) {
  return '<button type="button" class="nav-item" data-nav="' + action + '" title="' + label + '" aria-label="' + label + '">' + navSvg(action) + '<span class="nav-caption" aria-hidden="true">' + label + '</span></button>';
}
function modalHeader(eyebrow,title) {
  return '<div class="nav-modal-top"><div><p class="nav-modal-eyebrow">' + eyebrow + '</p><h2 id="navModalTitle">' + title + '</h2></div><button class="nav-close" type="button" data-nav-close aria-label="Cerrar">×</button></div>';
}
function setModal(content) {
  const panel=document.getElementById('navModalContent');
  if(panel)panel.innerHTML='<div class="nav-modal">' + content + '</div>';
}
function openModal(type) {
  const dialog=document.getElementById('navOverlay');
  if(!dialog)return;
  navState.returnFocus=document.activeElement;
  if(type==='profile'){
    setModal(modalHeader('Tu cuenta','Perfil') +
      '<div class="nav-profile-card"><div id="navProfilePhotoHolder"></div><div class="nav-profile-details"><strong id="navProfileName"></strong><p id="navProfileEmail"></p></div></div>' +
      '<p class="nav-profile-hint">Tu información de perfil procede de la cuenta de Google con la que iniciaste sesión.</p>' +
      '<div class="nav-modal-actions"><button class="nav-action" type="button" data-nav-close>Cerrar</button>' +
      (!navState.session.authenticated?'<button type="button" class="nav-action nav-action-primary" data-nav-connect>Conectar Google</button>':'')+'</div>');
    const user=navState.session.user||{};
    document.getElementById('navProfileName').textContent=navState.session.authenticated?(user.name||'Cuenta de Google'):'Sin sesión activa';
    document.getElementById('navProfileEmail').textContent=navState.session.authenticated?(user.email||'Correo no disponible'):'Conecta tu cuenta para ver tu perfil.';
    const holder=document.getElementById('navProfilePhotoHolder');
    if(navState.session.authenticated && validPhoto(user.picture)){
      const img=document.createElement('img');img.className='nav-profile-photo';img.alt='Foto de perfil';img.referrerPolicy='no-referrer';img.src=user.picture;holder.append(img);
    }else{
      const initials=document.createElement('div');initials.className='nav-profile-initials';initials.textContent=(user.name||user.email||'?').slice(0,1).toUpperCase();holder.append(initials);
    }
  }else if(type==='theme'){
    setModal(modalHeader('Apariencia','Tema')+'<p class="nav-modal-description">Elige cómo quieres ver CalendarIA. La opción del sistema se adapta automáticamente a tu dispositivo.</p>'+
      '<div class="nav-choice-list">'+
      '<label class="nav-choice"><input type="radio" name="nav-theme" value="light"><span>☀ Claro<small>Fondo luminoso y contrastes suaves</small></span></label>'+
      '<label class="nav-choice"><input type="radio" name="nav-theme" value="dark"><span>◐ Oscuro<small>Interfaz oscura y tarjetas claras</small></span></label>'+
      '<label class="nav-choice"><input type="radio" name="nav-theme" value="system"><span>◉ Usar preferencia del sistema<small>Cambia con la configuración del dispositivo</small></span></label>'+
      '</div><div class="nav-modal-actions"><button type="button" class="nav-action nav-action-primary" data-nav-close>Listo</button></div>');
    applyTheme();
  }else if(type==='settings'){
    const reminders=readReminderDefaults();
    setModal(modalHeader('Personaliza tu experiencia','Configuración')+
      '<div class="nav-settings-group"><h3>Conexión de Google</h3><p id="navSettingsAccount"></p><span id="navSettingsBadge" class="nav-badge">● Conectado</span></div>'+
      '<div class="nav-settings-group"><h3>Avisos predeterminados</h3><p>Estos intervalos se seleccionarán al abrir el formulario manual. Puedes cambiarlos al crear cada evento.</p>'+
      '<div class="nav-notifications">'+NAV_ALLOWED_REMINDERS.map(n=>'<label><input type="checkbox" data-nav-reminder value="'+n+'" '+(reminders.includes(n)?'checked':'')+'>'+NAV_REMINDER_LABELS[n]+'</label>').join('')+'</div></div>'+
      '<div class="nav-settings-group"><h3>Privacidad y control</h3><p>Tus eventos se guardan en Google Calendar después de que confirmas su creación.</p>'+
      '<a href="/privacy.html" class="nav-action" style="display:inline-block;text-decoration:none">Política de privacidad ↗</a></div>'+
      '<div class="nav-modal-actions"><button type="button" class="nav-action nav-action-primary" data-nav-save>Guardar preferencias</button>'+
      (navState.session.authenticated?'<button type="button" class="nav-action nav-action-danger" data-nav-disconnect>Desconectar Google</button>':'<button type="button" class="nav-action" data-nav-connect>Conectar Google</button>')+'</div>');
    document.getElementById('navSettingsAccount').textContent=navState.session.authenticated?(navState.session.user?.email||'Cuenta conectada'):'No hay una sesión activa. Conecta Google para sincronizar.';
    if(!navState.session.authenticated){const badge=document.getElementById('navSettingsBadge');badge.textContent='○ Desconectado';badge.style.background='transparent';badge.style.color='inherit';badge.style.border='1px solid var(--nav-dialog-border)';}
  }else if(type==='help'){
    setModal(modalHeader('Guía rápida','Centro de ayuda')+
      '<p class="nav-modal-description">Aquí tienes las funciones principales para organizar tu agenda en unos pocos pasos.</p>'+
      '<div class="nav-help-list">'+
      '<details open><summary>1. Agregar un evento manualmente</summary><p>Escribe el título, selecciona fecha y hora, elige una categoría y configura los avisos. Pulsa Guardar evento para enviarlo a Google Calendar.</p><button type="button" class="nav-action" data-nav-help-tab="manual">Abrir formulario manual</button></details>'+
      '<details><summary>2. Crear con texto o imagen</summary><p>Describe una actividad o adjunta una captura. Gemini propone los datos del evento; revísalos y confírmalos antes de guardar.</p><button type="button" class="nav-action" data-nav-help-tab="ai">Probar texto o imagen</button></details>'+
      '<details><summary>3. Crear con la voz</summary><p>Pulsa el micrófono y menciona el evento, fecha y hora. Termina la grabación y revisa los datos que propone la IA.</p><button type="button" class="nav-action" data-nav-help-tab="audio">Abrir voz</button></details>'+
      '<details><summary>4. Consultar y actualizar tu agenda</summary><p>Tus eventos próximos aparecen en el panel de Google Calendar. Usa el botón de actualizar para sincronizar o abre un evento en Google Calendar.</p></details>'+
      '<details><summary>5. Organizar con categorías</summary><p>Abre Categorías en el menú lateral para cambiar nombres y colores. Guarda los cambios para aplicarlos a nuevos eventos.</p><button type="button" class="nav-action" data-nav-open-categories>Ir a Categorías</button></details>'+
      '<details><summary>6. Solucionar una sesión caducada</summary><p>Si Google revoca la autorización, CalendarIA cerrará la conexión caducada. Vuelve a conectar Google desde el botón de inicio de sesión.</p></details>'+
      '</div>');
  }
  if(!dialog.open)dialog.showModal();
  document.getElementById('navOverlay').querySelector('.nav-close')?.focus();
}
function validPhoto(value){try{const url=new URL(value);return url.protocol==='https:';}catch{return false;}}
function closeModal(){const dialog=document.getElementById('navOverlay');if(dialog?.open)dialog.close();}
function setMobileOpen(open) {
  document.body.classList.toggle('is-nav-open',open);
  const toggle=document.getElementById('mobileNavToggle');
  if(toggle)toggle.setAttribute('aria-expanded',String(open));
  if(open)document.querySelector('#appSidebar [data-nav="home"]')?.focus();
  else if(document.activeElement?.closest?.('#appSidebar'))toggle?.focus();
}
function confirmUnsaved() {
  const discard=document.getElementById('eventCategoriesDiscardButton');
  if(navState.view==='categories' && discard && !discard.disabled){
    return window.confirm('Tienes cambios de categorías sin guardar. ¿Quieres salir sin guardarlos?');
  }
  return true;
}
function goView(view) {
  if(view!==navState.view && !confirmUnsaved())return;
  navState.view=view;
  document.body.classList.toggle('is-categories-view',view==='categories');
  document.querySelectorAll('#appSidebar [data-nav]').forEach(btn=>btn.classList.toggle('is-active',btn.dataset.nav===view));
  safeSessionSet(NAV_VIEW_KEY,view);
  setMobileOpen(false);
  window.scrollTo({top:0,behavior:'instant'});
}
function readReminderDefaults(){
  const saved=safeLocalGet(NAV_REMINDER_KEY);
  if(saved===null)return [10];
  try { const parsed=JSON.parse(saved);return Array.isArray(parsed)?parsed.map(Number).filter(n=>NAV_ALLOWED_REMINDERS.includes(n)): [10];}
  catch{return [10];}
}
function applyReminderDefaults(){
  const saved=new Set(readReminderDefaults());
  document.querySelectorAll('[data-reminder-group="manual"] input[type="checkbox"]').forEach(input=>{
    if(!input.closest('[data-dynamic-reminder]'))input.checked=saved.has(Number(input.value));
  });
}
async function disconnectGoogle(){
  if(!window.confirm('¿Desconectar Google de CalendarIA? Tendrás que iniciar sesión nuevamente.'))return;
  const csrf=navState.session.csrfToken;
  if(!csrf){notify('Recarga la página para comprobar tu sesión antes de desconectar.', 'error');return;}
  try{
    const response=await fetch('/api/auth/google/disconnect',{method:'POST',credentials:'same-origin',headers:{'X-CSRF-Token':csrf,'X-Time-Zone':Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'}});
    if(!response.ok)throw new Error('No fue posible desconectar Google. Intenta de nuevo.');
    closeModal();safeSessionSet(NAV_VIEW_KEY,'home');window.location.assign('/?disconnected=1');
  }catch(err){notify(err.message,'error');}
}
function navigate(action){
  if(action==='home'||action==='categories'){goView(action);return;}
  setMobileOpen(false);
  if(action==='logout'){
    if(!navState.session.authenticated){document.getElementById('authButton')?.click();return;}
    document.getElementById('authButton')?.click();
    goView('home');
    return;
  }
  openModal(action);
}
function updateSession(session){
  navState.session=session||{authenticated:false,integrations:null};
  const btn=document.querySelector('#appSidebar [data-nav="logout"] .nav-caption');
  if(btn)btn.textContent=navState.session.authenticated?'Cerrar sesión':'Conectar Google';
  const logoutBtn=document.querySelector('#appSidebar [data-nav="logout"]');
  if(logoutBtn)logoutBtn.setAttribute('aria-label',navState.session.authenticated?'Cerrar sesión':'Conectar Google');
  const user=navState.session.user||{};
  const avatar=document.getElementById('navProfileAvatar');
  const fallback=document.getElementById('navAvatarFallback');
  if(avatar&&fallback){
    if(navState.session.authenticated&&validPhoto(user.picture)){
      avatar.src=user.picture;avatar.classList.remove('is-hidden');fallback.classList.add('is-hidden');
    }else{
      avatar.removeAttribute('src');avatar.classList.add('is-hidden');
      fallback.textContent=(user.name||user.email||'?').slice(0,1).toUpperCase();
      fallback.classList.remove('is-hidden');
    }
  }
}
function initNavigation(){
  if(document.getElementById('appSidebar'))return;
  const logo='/assets/calendaria-logo.svg';
  const nav='<nav id="appSidebar" class="app-sidebar" aria-label="Menú de CalendarIA">'+
    '<div class="nav-group"><button class="nav-brand" type="button" data-nav="home" title="CalendarIA, inicio" aria-label="Ir al inicio"><img src="'+logo+'" alt=""></button>'+
    navButton('home','Inicio')+navButton('profile','Perfil')+navButton('categories','Categorías')+
    '<div class="nav-divider"></div>'+navButton('theme','Tema')+navButton('settings','Configuración')+'</div>'+
    '<div class="nav-group">'+navButton('help','Centro de ayuda')+navButton('logout','Cerrar sesión')+'</div>'+
    '</nav><div id="navScrim" class="nav-scrim" aria-hidden="true"></div>'+
    '<dialog id="navOverlay" class="nav-overlay" aria-labelledby="navModalTitle"><div id="navModalContent"></div></dialog>';
  document.body.insertAdjacentHTML('afterbegin',nav);
  const profileIcon=document.querySelector('#appSidebar [data-nav="profile"] svg');
  if(profileIcon){
    profileIcon.insertAdjacentHTML('afterend','<img id="navProfileAvatar" class="nav-avatar is-hidden" alt="" referrerpolicy="no-referrer"><span id="navAvatarFallback" class="nav-avatar-fallback is-hidden">?</span>');
    profileIcon.classList.add('is-hidden');
  }
  const mobileButton=document.createElement('button');
  mobileButton.type='button';mobileButton.className='mobile-nav-toggle';mobileButton.id='mobileNavToggle';
  mobileButton.setAttribute('aria-label','Abrir menú');mobileButton.setAttribute('aria-expanded','false');
  mobileButton.setAttribute('aria-controls','appSidebar');mobileButton.innerHTML=navSvg('menu');
  document.querySelector('.site-header')?.prepend(mobileButton);
  mobileButton.addEventListener('click',()=>setMobileOpen(!document.body.classList.contains('is-nav-open')));
  document.getElementById('navScrim').addEventListener('click',()=>setMobileOpen(false));
  document.getElementById('appSidebar').addEventListener('click',(event)=>{
    const btn=event.target.closest('button[data-nav]');if(btn)navigate(btn.dataset.nav);
  });
  const dialog=document.getElementById('navOverlay');
  dialog.addEventListener('close',()=>{const target=navState.returnFocus;navState.returnFocus=null;target?.focus?.();});
  dialog.addEventListener('click',(event)=>{
    if(event.target===dialog){closeModal();return;}
    const btn=event.target.closest('button');if(!btn)return;
    if(btn.hasAttribute('data-nav-close')){closeModal();return;}
    if(btn.hasAttribute('data-nav-connect')){closeModal();document.getElementById('authButton')?.click();return;}
    if(btn.hasAttribute('data-nav-save')){
      const values=[...dialog.querySelectorAll('[data-nav-reminder]:checked')].map(input=>Number(input.value));
      safeLocalSet(NAV_REMINDER_KEY,JSON.stringify(values));applyReminderDefaults();closeModal();notify('Preferencias guardadas','success');return;
    }
    if(btn.hasAttribute('data-nav-disconnect')){disconnectGoogle();return;}
    if(btn.hasAttribute('data-nav-open-categories')){closeModal();goView('categories');return;}
    const tab=btn.getAttribute('data-nav-help-tab');
    if(tab){closeModal();goView('home');document.querySelector('[data-tab="'+tab+'"]')?.click();}
  });
  dialog.addEventListener('change',(event)=>{
    if(event.target.name==='nav-theme'){
      navState.theme=event.target.value;safeLocalSet(NAV_THEME_KEY,navState.theme);applyTheme();
    }
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&document.body.classList.contains('is-nav-open'))setMobileOpen(false);
  });
  window.addEventListener('popstate',()=>{if(!document.getElementById('navOverlay')?.open)setMobileOpen(false);});
  updateSession(navState.session);
  applyReminderDefaults();
  const remembered=safeSessionGet(NAV_VIEW_KEY);
  goView(remembered==='categories'?'categories':'home');
}
window.addEventListener('calendaria:session-updated',event=>{
  updateSession(event.detail);
  if(!event.detail?.authenticated&&navState.view==='categories')goView('home');
});
window.addEventListener('calendaria:session-expired',()=>{
  updateSession({authenticated:false,integrations:navState.session.integrations});
  if(navState.view==='categories')goView('home');
});
if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',initNavigation,{once:true});
else initNavigation();
