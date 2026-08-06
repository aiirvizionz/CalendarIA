'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..', 'public');

test('manifest define experiencia instalable de CalendarIA', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.name, 'CalendarIA');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/');
  assert.ok(manifest.icons.some((icon) => icon.src.includes('calendaria-logo')));
});

test('service worker excluye la API del cache', () => {
  const worker = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');
  assert.match(worker, /url\.pathname\.startsWith\('\/api\/'\)/);
  assert.match(worker, /calendaria-shell-v3/);
});
