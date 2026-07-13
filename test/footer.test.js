'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const publicRoot = path.join(__dirname, '..', 'public');

function read(name) {
  return fs.readFileSync(path.join(publicRoot, name), 'utf8');
}

test('la página carga y estructura el footer profesional', () => {
  const html = read('index.html');

  assert.match(html, /href="\/footer\.css"/);
  assert.match(html, /class="site-footer"/);
  assert.match(html, /class="footer-panel"/);
  assert.match(html, /class="footer-identity"/);
  assert.match(html, /href="\/privacy\.html"/);
  assert.match(html, /Política de privacidad/);
  assert.match(html, /David Alejandro Lopez Huerta/);
});

test('el footer tiene layout, estados interactivos y adaptación móvil', () => {
  const css = read('footer.css');

  assert.match(css, /\.site-footer\s*\{/);
  assert.match(css, /\.footer-panel\s*\{/);
  assert.match(css, /grid-template-columns:\s*minmax\(0, 1fr\) auto/);
  assert.match(css, /\.footer-link:hover\s*\{/);
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(css, /@media \(max-width: 420px\)/);
});
