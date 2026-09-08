'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('elimina las categorías placeholder y espera las preferencias persistidas', () => {
  const guard = read('public/js/category-loading-guard.js');
  const footer = read('public/footer.css');

  assert.match(guard, /\[data-event-type-choice="true"\]/);
  assert.match(guard, /container\.replaceChildren\(\)/);
  assert.match(guard, /manualSubmit\.disabled = !ready/);
  assert.match(footer, /#categoryOptions:not\(:has\(\[data-event-type-choice="true"\]\)\)/);
  assert.match(footer, /category-options-shimmer/);
});

test('carga el selector de análisis de imagen antes del flujo principal', () => {
  const api = read('public/js/api.js');
  const multi = read('public/js/multi-event-ui.js');

  assert.match(api, /import '\.\/category-loading-guard\.js';/);
  assert.match(api, /import '\.\/multi-event-ui\.js';/);
  assert.doesNotMatch(api, /import\('\.\/multi-event-ui\.js'\)/);
  assert.match(multi, /mode: 'single'/);
  assert.match(multi, />Un evento</);
  assert.match(multi, />Múltiples eventos</);
  assert.match(multi, /capture: true/);
});

test('mantiene negro el fondo de cualquier categoría seleccionada', () => {
  const footer = read('public/footer.css');
  assert.match(footer, /\.choice-grid-categories input:checked \+ span/);
  assert.match(footer, /background: #111316 !important/);
  assert.doesNotMatch(footer, /input\[value="examen"\]:checked/);
});
