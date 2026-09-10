'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

test('las mejoras visuales se cargan sin bloquear el módulo principal', () => {
  const api = read('public/js/api.js');
  assert.match(api, /void import\('\.\/events-view-ui\.js\?v=4'\)\.catch/);
  assert.match(api, /void import\('\.\/category-gestures-ui\.js\?v=4'\)\.catch/);
  assert.doesNotMatch(api, /^import '\.\/events-view-ui\.js/m);
  assert.doesNotMatch(api, /^import '\.\/category-gestures-ui\.js/m);
});

test('la vista de eventos usa controles del mismo estilo que actualizar y precarga meses', () => {
  const ui = read('public/js/events-view-ui.js');
  const css = read('public/events-view.css');
  assert.match(ui, /class="icon-button events-view-button is-active"/);
  assert.match(ui, /class="icon-button events-view-button"/);
  assert.match(ui, /aria-label="Vista de lista"/);
  assert.match(ui, /aria-label="Vista de calendario"/);
  assert.match(ui, /monthCache:\s*new Map\(\)/);
  assert.match(ui, /function preloadCalendar\(\)/);
  assert.match(ui, /view=calendar&month=/);
  assert.match(ui, /state\.monthCache\.has\(key\)/);
  assert.match(ui, /eventsCalendarPrev/);
  assert.match(ui, /eventsCalendarNext/);
  assert.match(css, /\.events-view-switch\s*\{[\s\S]*background:\s*transparent/);
  assert.doesNotMatch(css, /\.events-view-button\s*\{[\s\S]{0,160}width:\s*38px/);
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

test('el endpoint mensual se mantiene separado de la lista normal', () => {
  const server = read('server.js');
  assert.match(server, /listCalendarMonthEvents/);
  assert.match(server, /req\.query\.view/);
  assert.match(server, /req\.query\.month/);
  assert.match(server, /listCalendarEvents\(accessToken, timeZone\)/);
});

test('las categorías son compactas, sin fondo gris de color y conservan swipe', () => {
  const ui = read('public/js/category-gestures-ui.js');
  const baseUi = read('public/js/event-categories-ui.js');
  const css = read('public/category-gestures.css');
  assert.match(ui, /Arrastra para reordenar la categoría/);
  assert.match(ui, /category-gestures\.css\?v=4/);
  assert.match(ui, /M5 8h14M5 12h14M5 16h14/);
  assert.match(ui, /SWIPE_DELETE_MIN/);
  assert.match(ui, /Eliminar/);
  assert.match(baseUi, /const placeAtPointer = \(clientY\) =>/);
  assert.match(baseUi, /getBoundingClientRect\(\)/);
  assert.match(baseUi, /state\.draft\.splice\(insertionIndex, 0, item\)/);
  assert.match(css, /\.category-swipe-content\s*\{[\s\S]*min-height:\s*52px/);
  assert.match(css, /\.event-category-compact-row \.event-category-color-trigger,[\s\S]*background:\s*transparent/);
  assert.match(css, /\.event-category-compact-row \.event-category-name,[\s\S]*min-height:\s*38px/);
  assert.match(css, /touch-action:\s*pan-y/);
});
