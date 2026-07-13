'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const storePath = path.join(__dirname, '..', 'public', 'js', 'store.js');
const source = fs.readFileSync(storePath, 'utf8');

test('no persiste eventos de CalendarIA en localStorage', () => {
  assert.doesNotMatch(source, /localStorage\.setItem/);
  assert.doesNotMatch(source, /writeStore|STORAGE_VERSION/);
  assert.match(source, /Google Calendar is the single source of truth/);
});

test('purga las claves históricas de eventos locales', () => {
  assert.match(source, /calendaria_events_v2/);
  assert.match(source, /ag_events/);
  assert.match(source, /purgeDeprecatedLocalEvents\(\);/);
});

test('rechaza el guardado local y no expone registros transitorios a la agenda', () => {
  assert.match(source, /syncStatus === 'local'/);
  assert.match(source, /Conecta Google para guardar eventos en tu calendario/);
  assert.match(source, /export function listEvents\(\) \{[\s\S]*?return \[\];[\s\S]*?\}/);
});
