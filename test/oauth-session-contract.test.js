'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('el inicio OAuth omite prompt=consent cuando ya existe un refresh token guardado', () => {
  assert.match(serverSource, /if \(readGoogleGrant\(req\)\) \{\s*authorizationUrl\.searchParams\.delete\('prompt'\);/);
});

test('cerrar sesión no revoca Google y desconectar sí lo hace', () => {
  const logoutRoute = serverSource.match(/app\.post\('\/api\/auth\/logout'[\s\S]*?\n\}\);/);
  const disconnectRoute = serverSource.match(/app\.post\('\/api\/auth\/google\/disconnect'[\s\S]*?\n\}\);/);

  assert.ok(logoutRoute);
  assert.doesNotMatch(logoutRoute[0], /revokeToken/);
  assert.ok(disconnectRoute);
  assert.match(disconnectRoute[0], /clearGoogleGrant\(res\)/);
  assert.match(disconnectRoute[0], /revokeToken\(token\)/);
});
