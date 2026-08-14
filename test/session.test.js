'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

function responseRecorder() {
  const headers = [];
  return {
    headers,
    append(name, value) {
      headers.push({ name, value });
    },
  };
}

function requestFromSetCookie(setCookie) {
  return {
    headers: {
      cookie: setCookie.split(';', 1)[0],
    },
  };
}

function cookieValue(response, name) {
  const header = response.headers.find((entry) => entry.name === 'Set-Cookie'
    && entry.value.startsWith(`${name}=`));
  assert.ok(header, `No se encontró la cookie ${name}`);
  return header.value;
}

test('la sesión cifrada sobrevive una recarga del módulo sin memoria compartida', () => {
  const modulePath = require.resolve('../src/lib/session');
  const sessionModule = require(modulePath);
  const response = responseRecorder();

  sessionModule.setSession(response, {
    user: {
      sub: 'google-user-123',
      name: 'David',
      email: 'david@example.com',
      picture: '',
    },
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    accessTokenExpiresAt: Date.now() + 60_000,
    csrfToken: 'csrf-token',
  });

  const setCookie = cookieValue(response, 'calendaria_session');
  delete require.cache[modulePath];
  const reloadedSessionModule = require(modulePath);
  const restored = reloadedSessionModule.readSession(requestFromSetCookie(setCookie));

  assert.equal(restored.user.sub, 'google-user-123');
  assert.equal(restored.refreshToken, 'refresh-token');
  assert.equal(restored.csrfToken, 'csrf-token');
});

test('el permiso persistente de Google se conserva separado de la sesión', () => {
  const {
    clearSession,
    readGoogleGrant,
    setGoogleGrant,
    setSession,
  } = require('../src/lib/session');
  const response = responseRecorder();

  setSession(response, {
    user: { sub: 'google-user-123' },
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    accessTokenExpiresAt: Date.now() + 60_000,
    csrfToken: 'csrf-token',
  });
  setGoogleGrant(response, {
    sub: 'google-user-123',
    email: 'david@example.com',
    refreshToken: 'refresh-token',
  });
  clearSession({}, response);

  const grantCookie = cookieValue(response, 'calendaria_google_grant');
  const grant = readGoogleGrant(requestFromSetCookie(grantCookie));

  assert.equal(grant.sub, 'google-user-123');
  assert.equal(grant.refreshToken, 'refresh-token');
  assert.ok(response.headers.some((entry) => entry.value.startsWith('calendaria_session=;')
    && entry.value.includes('Max-Age=0')));
});

test('rechaza una cookie de sesión manipulada', () => {
  const { readSession, setSession } = require('../src/lib/session');
  const response = responseRecorder();

  setSession(response, {
    user: { sub: 'google-user-123' },
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    accessTokenExpiresAt: Date.now() + 60_000,
    csrfToken: 'csrf-token',
  });

  const setCookie = cookieValue(response, 'calendaria_session');
  const [pair] = setCookie.split(';', 1);
  const separator = pair.indexOf('=');
  const name = pair.slice(0, separator);
  const encodedValue = pair.slice(separator + 1);
  const [iv, tag, ciphertext] = decodeURIComponent(encodedValue).split('.');
  const tamperedCiphertext = `${ciphertext.startsWith('A') ? 'B' : 'A'}${ciphertext.slice(1)}`;
  const tamperedValue = encodeURIComponent(`${iv}.${tag}.${tamperedCiphertext}`);
  const tampered = `${name}=${tamperedValue}`;

  assert.equal(readSession({ headers: { cookie: tampered } }), null);
});
