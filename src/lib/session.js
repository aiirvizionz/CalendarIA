'use strict';

const crypto = require('crypto');
const config = require('../config');

const SESSION_COOKIE = 'calendaria_session';
const OAUTH_COOKIE = 'calendaria_oauth';
const ONE_HOUR_MS = 60 * 60 * 1000;

function encode(value) {
  return Buffer.from(value).toString('base64url');
}

function decode(value) {
  return Buffer.from(value, 'base64url');
}

function encrypt(payload) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', config.sessionKey, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${encode(iv)}.${encode(tag)}.${encode(ciphertext)}`;
}

function decrypt(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  try {
    const [iv, tag, ciphertext] = parts.map(decode);
    const decipher = crypto.createDecipheriv('aes-256-gcm', config.sessionKey, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(plaintext.toString('utf8'));
  } catch {
    return null;
  }
}

function parseCookies(header = '') {
  return header.split(';').reduce((cookies, pair) => {
    const separator = pair.indexOf('=');
    if (separator < 0) return cookies;
    const name = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    if (!name) return cookies;
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
    return cookies;
  }, {});
}

function cookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${options.path || '/'}`);
  if (options.maxAge != null) parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  if (options.httpOnly !== false) parts.push('HttpOnly');
  if (config.isProduction) parts.push('Secure');
  parts.push(`SameSite=${options.sameSite || 'Lax'}`);
  return parts.join('; ');
}

function readSession(req) {
  const cookies = parseCookies(req.headers.cookie);
  const session = decrypt(cookies[SESSION_COOKIE]);
  if (!session || !session.user?.sub || !session.csrfToken) return null;
  return session;
}

function setSession(res, session) {
  const expiresAt = Number(session.accessTokenExpiresAt || Date.now() + ONE_HOUR_MS);
  const maxAge = Math.max(60, Math.floor((expiresAt - Date.now()) / 1000));
  res.append('Set-Cookie', cookie(SESSION_COOKIE, encrypt(session), { maxAge }));
}

function clearSession(res) {
  res.append('Set-Cookie', cookie(SESSION_COOKIE, '', { maxAge: 0 }));
}

function setOAuthState(res, payload) {
  res.append('Set-Cookie', cookie(OAUTH_COOKIE, encrypt(payload), {
    path: '/api/auth/google/callback',
    maxAge: 10 * 60,
  }));
}

function readOAuthState(req) {
  const cookies = parseCookies(req.headers.cookie);
  return decrypt(cookies[OAUTH_COOKIE]);
}

function clearOAuthState(res) {
  res.append('Set-Cookie', cookie(OAUTH_COOKIE, '', {
    path: '/api/auth/google/callback',
    maxAge: 0,
  }));
}

function createCsrfToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function requireSession(req, res, next) {
  const session = readSession(req);
  if (!session) {
    return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Inicia sesión con Google para continuar' } });
  }
  req.session = session;
  return next();
}

function requireCsrf(req, res, next) {
  const received = String(req.get('x-csrf-token') || '');
  const expected = String(req.session?.csrfToken || '');
  const valid = received.length === expected.length
    && received.length > 0
    && crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));

  if (!valid) {
    return res.status(403).json({ error: { code: 'CSRF_INVALID', message: 'La solicitud de seguridad expiró. Recarga la página.' } });
  }
  return next();
}

module.exports = {
  clearOAuthState,
  clearSession,
  createCsrfToken,
  readOAuthState,
  readSession,
  requireCsrf,
  requireSession,
  setOAuthState,
  setSession,
};
