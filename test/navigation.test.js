
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
