'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const welcome = fs.readFileSync(path.join(root, 'public', 'welcome.html'), 'utf8');
const privacy = fs.readFileSync(path.join(root, 'public', 'privacy.html'), 'utf8');
const api = fs.readFileSync(path.join(root, 'public', 'js', 'api.js'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'public', 'js', 'shared-footer.js'), 'utf8');

const requiredRoutes = ['href="/"', 'href="/welcome"', 'href="/privacy.html"', 'github.com/aiirvizionz/CalendarIA'];

test('welcome and privacy expose the same footer destinations', () => {
  for (const route of requiredRoutes) {
    assert.match(welcome, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(privacy, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('main application loads the shared footer renderer', () => {
  assert.match(api, /import '\.\/shared-footer\.js';/);
  for (const route of requiredRoutes) {
    assert.ok(renderer.includes(route));
  }
});
