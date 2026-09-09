'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

test('las mejoras visuales se cargan sin bloquear el módulo principal', () => {
  const api = read('public/js/api.js');
  assert.match(api, /void import\('\.\/events-view-ui\.js\?v=2'\)\.catch/);
  assert.match(api, /void import\('\.\/category-gestures-ui\.js\?v=2'\)\.catch/);
  assert.doesNotMatch(api, /^import '\.\/events-view-ui\.js/m);
  assert.doesNotMatch(api, /^import '\.\/category-gestures-ui\.js/m);
});

test('la vista de eventos contiene lista calendario y navegación mensual', () => {
  const ui = read('public/js/events-view-ui.js');
  assert.match(ui, /data-events-view="list"/);
  assert.match(ui, /data-events-view="calendar"/);
  assert.match(ui, /eventsCalendarPrev/);
  assert.match(ui, /eventsCalendarNext/);
  assert.match(ui, /events-calendar-dot/);
  assert.match(ui, /fetch\('\/api\/calendar\/events'/);
});

test('el panel de eventos se vuelve claro y la paleta visual solo se aplica en escritorio', () => {
  const eventsCss = read('public/events-view.css');
  const paletteCss = read('public/desktop-color-palette.css');
  assert.match(eventsCss, /\.events-card\s*\{/);
  assert.match(eventsCss, /background:\s*#f5f2ed\s*!important/);
  assert.match(eventsCss, /events-view-switch/);
  assert.match(paletteCss, /@media \(min-width: 901px\)/);
  assert.match(paletteCss, /grid-template-columns:\s*repeat\(6, 1fr\)/);
});

test('las categorías conservan su nombre y ganan drag compacto y swipe para borrar', () => {
  const ui = read('public/js/category-gestures-ui.js');
  const css = read('public/category-gestures.css');
  assert.match(ui, /Arrastra para reordenar la categoría/);
  assert.match(ui, /SWIPE_DELETE_MIN/);
  assert.match(ui, /Eliminar/);
  assert.doesNotMatch(ui, /Etiquetas de eventos/);
  assert.match(css, /category-swipe-content/);
  assert.match(css, /grid-template-columns:\s*minmax\(0, 1fr\) minmax\(126px, 178px\)/);
  assert.match(css, /touch-action:\s*pan-y/);
});
