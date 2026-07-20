const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const footerCss = fs.readFileSync(path.join(projectRoot, 'public', 'footer.css'), 'utf8');
const mobileCss = fs.readFileSync(path.join(projectRoot, 'public', 'mobile-layout-v2.css'), 'utf8');

test('la hoja responsive final se carga antes del tema y fuerza una sola columna móvil', () => {
  assert.match(footerCss, /^@import url\('\/mobile-layout-v2\.css'\);/);
  assert.match(mobileCss, /@media \(max-width: 900px\)/);
  assert.match(mobileCss, /\.workspace\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s*!important;/);
});

test('composer y eventos no conservan sticky, anchos mínimos ni overflow en móvil', () => {
  assert.match(mobileCss, /\.composer-card,\s*\n\s*\.events-card\s*\{[\s\S]*?position:\s*static\s*!important;/);
  assert.match(mobileCss, /max-width:\s*100%\s*!important;/);
  assert.match(mobileCss, /max-height:\s*none\s*!important;/);
  assert.match(mobileCss, /\.events-card\s*\{[\s\S]*?order:\s*2;/);
});

test('las pestañas permanecen en tres columnas compactas en teléfonos', () => {
  assert.match(mobileCss, /@media \(max-width: 620px\)/);
  assert.match(mobileCss, /\.tabs\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)\s*!important;/);
});
