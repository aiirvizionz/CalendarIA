
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');

test('la app expone navegación responsiva y categorías en una vista independiente',()=>{
  const index=read('public/index.html');
  const app=read('public/js/app.js');
  const nav=read('public/js/navigation.js');
  const styles=read('public/navigation.css');
  assert.match(index,/href="\/navigation\.css/);
  assert.match(app,/import '\.\/navigation\.js';/);
  for(const item of ['home','profile','categories','theme','settings','help','logout']){
    assert.ok(nav.includes("navButton('"+item+"'"),"Missing navigation item "+item);
  }
  assert.match(nav,/window\.history\.pushState/);
  assert.match(nav,/window\.location\.pathname==='\/categorias'/);
  assert.match(nav,/dialog\.showModal\(\)/);
  assert.match(styles,/body:not\(\.is-categories-view\) #eventCategoriesSection/);
  assert.match(styles,/@media \(max-width: 767px\)/);
  assert.match(styles,/\.mobile-nav-toggle/);
});
test('la app mantiene acceso a Google mientras vence el token y ofrece una salida de sesión caducada',()=>{
  const server=read('server.js');
  const api=read('public/js/api.js');
  const nav=read('public/js/navigation.js');
  assert.match(server,/await ensureAccessToken\(session\)/);
  assert.match(server,/authExpired: true/);
  assert.match(api,/calendaria:session-expired/);
  assert.match(nav,/data-nav-disconnect/);
});

test('tema claro conserva la misma geometría e iconos compactos que el tema oscuro',()=>{
  const styles=read('public/navigation.css');
  assert.match(styles,/\.workspace\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1\.55fr\) minmax\(300px, \.75fr\)/);
  assert.match(styles,/\.tab-icon\s*\{[\s\S]*width:\s*18px;[\s\S]*height:\s*18px/);
  assert.match(styles,/\.brand-logo,[\s\S]*\.footer-brand-logo[\s\S]*width:\s*38px/);
  assert.match(styles,/html\[data-calendar-theme="light"\] \.composer-card/);
});
test('menú móvil usa hamburger sin borde y una X animada dentro del drawer',()=>{
  const nav=read('public/js/navigation.js');
  const styles=read('public/navigation.css');
  assert.match(nav,/mobileDrawerClose/);
  assert.match(nav,/M5 5l14 14M19 5 5 19/);
  assert.match(styles,/\.mobile-nav-toggle\s*\{[\s\S]*border:\s*0\s*!important/);
  assert.match(styles,/\.site-header > \.brand\s*\{\s*display:\s*none\s*!important/);
  assert.match(styles,/\.mobile-drawer-close\s*\{[\s\S]*right:\s*18px/);
});
test('Tus eventos iguala la altura del compositor y desplaza solo el contenido',()=>{
  const nav=read('public/js/navigation.js');
  const styles=read('public/navigation.css');
  assert.match(nav,/ResizeObserver/);
  assert.match(nav,/--workspace-card-height/);
  assert.match(styles,/\.events-card\s*\{[\s\S]*height:\s*var\(--workspace-card-height/);
  assert.match(styles,/\.events-list,[\s\S]*\.events-calendar-view\s*\{[\s\S]*overflow-y:\s*auto\s*!important/);
  assert.match(styles,/\.events-heading\s*\{[\s\S]*flex:\s*0 0 auto/);
});
