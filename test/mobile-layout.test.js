const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const projectRoot = path.join(__dirname, '..');
const footerCss = fs.readFileSync(path.join(projectRoot, 'public', 'footer.css'), 'utf8');
const mobileCss = fs.readFileSync(path.join(projectRoot, 'public', 'mobile-layout-v3.css'), 'utf8');

test('la hoja responsive final se carga antes del tema y fuerza una sola columna móvil', () => {
  assert.match(footerCss, /^@import url\('\/mobile-layout-v3\.css'\);/);

  assert.match(
    mobileCss,
    /@media\s*\(max-width:\s*900px\)\s*\{[\s\S]*?\.workspace\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s*(?:!important)?;/
  );

  assert.match(
    mobileCss,
    /\.composer-card\s*\{[\s\S]*?grid-area:\s*composer\s*(?:!important)?;[\s\S]*?order:\s*1\s*(?:!important)?;/
  );

  assert.match(
    mobileCss,
    /\.events-card\s*\{[\s\S]*?grid-area:\s*events\s*(?:!important)?;[\s\S]*?order:\s*2\s*(?:!important)?;/
  );
});

test('composer y eventos no conservan sticky, anchos mínimos ni overflow en móvil', () => {
  assert.match(
    mobileCss,
    /\.composer-card,\s*[\r\n]+\s*\.events-card\s*\{[\s\S]*?position:\s*static\s*(?:!important)?;/
  );

  assert.match(
    mobileCss,
    /\.composer-card,\s*[\r\n]+\s*\.events-card\s*\{[\s\S]*?min-width:\s*0\s*(?:!important)?;/
  );

  assert.match(
    mobileCss,
    /\.composer-card,\s*[\r\n]+\s*\.events-card\s*\{[\s\S]*?max-width:\s*100%\s*(?:!important)?;/
  );

  assert.match(
    mobileCss,
    /\.composer-card,\s*[\r\n]+\s*\.events-card\s*\{[\s\S]*?overflow:\s*(?:hidden|visible)\s*(?:!important)?;/
  );
});

test('las pestañas permanecen en tres columnas compactas en teléfonos', () => {
  assert.match(
    mobileCss,
    /@media\s*\(max-width:\s*620px\)\s*\{[\s\S]*?\.tabs\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)\s*(?:!important)?;/
  );

  assert.match(
    mobileCss,
    /\.tab\s*\{[\s\S]*?min-width:\s*0\s*(?:!important)?;/
  );
});
