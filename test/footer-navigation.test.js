'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const welcome = fs.readFileSync(path.join(root, 'public', 'welcome.html'), 'utf8');
const privacy = fs.readFileSync(path.join(root, 'public', 'privacy.html'), 'utf8');
const terms = fs.readFileSync(path.join(root, 'public', 'terms.html'), 'utf8');
const api = fs.readFileSync(path.join(root, 'public', 'js', 'api.js'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'public', 'js', 'shared-footer.js'), 'utf8');

const requiredRoutes = [
  'href="/"',
  'href="/welcome"',
  'href="/privacy.html"',
  'href="/terms.html"',
  'github.com/aiirvizionz/CalendarIA',
];

test('welcome, privacy and terms expose the same footer destinations', () => {
  for (const route of requiredRoutes) {
    assert.ok(welcome.includes(route));
    assert.ok(privacy.includes(route));
    assert.ok(terms.includes(route));
  }
});

test('terms page reflects the current CalendarIA product and legal context', () => {
  assert.match(terms, /Términos de servicio/);
  assert.match(terms, /Última actualización: 19 de septiembre de 2026/);
  assert.match(terms, /Google Calendar es la fuente de verdad/);
  assert.match(terms, /la IA propone y el usuario decide/i);
  assert.match(terms, /Google Gemini API/);
  assert.match(terms, /Supabase/);
  assert.match(terms, /Sentry/);
  assert.match(terms, /https:\/\/calendaria\.dev\/terms\.html/);
  assert.match(terms, /href="\/privacy\.html"/);
});

test('main application loads the shared footer renderer', () => {
  assert.match(api, /import '\.\/shared-footer\.js';/);
  for (const route of requiredRoutes) {
    assert.ok(renderer.includes(route));
  }
});
