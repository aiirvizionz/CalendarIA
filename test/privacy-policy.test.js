'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const publicRoot = path.join(__dirname, '..', 'public');

function readPublicFile(name) {
  return fs.readFileSync(path.join(publicRoot, name), 'utf8');
}

test('la página principal enlaza la política de privacidad pública', () => {
  const home = readPublicFile('index.html');
  assert.match(home, /href="\/privacy\.html"/);
  assert.match(home, /Política de privacidad/);
  assert.match(home, /convierte texto, imágenes y voz en eventos revisables para Google Calendar/i);
});

test('la política divulga el uso esencial y actual de datos de Google', () => {
  const policy = readPublicFile('privacy.html');

  assert.match(policy, /https:\/\/www\.googleapis\.com\/auth\/calendar\.events/);
  assert.match(policy, /Google API Services User Data Policy/);
  assert.match(policy, /uso limitado/i);
  assert.match(policy, /Los eventos obtenidos desde Google Calendar no se envían a Gemini/);
  assert.match(policy, /no mantiene una base de datos propia de eventos/i);
  assert.match(policy, /no persiste eventos en <code>localStorage<\/code>/i);
  assert.match(policy, /calendaria_session/);
  assert.match(policy, /calendaria_google_grant/);
  assert.match(policy, /AES-256-GCM/);
  assert.match(policy, /30 días/);
  assert.match(policy, /180 días/);
  assert.match(policy, /store: false/);
  assert.match(policy, /Cerrar sesión y revocar el acceso son acciones diferentes/);
  assert.match(policy, /no vende datos de Google/i);
});

test('la política mantiene fecha actualizada y canal público de contacto', () => {
  const policy = readPublicFile('privacy.html');
  assert.match(policy, /Última actualización: 14 de agosto de 2026/);
  assert.match(policy, /https:\/\/github\.com\/aiirvizionz\/CalendarIA\/issues/);
  assert.match(policy, /David Alejandro Lopez Huerta/);
});
