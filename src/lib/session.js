'use strict';

const crypto = require('crypto');
const config = require('../config');

const SESSION_COOKIE = 'calendaria_session';
const OAUTH_COOKIE = 'calendaria_oauth';
const GOOGLE_GRANT_COOKIE = 'calendaria_google_grant';
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const SESSION_MAX_AGE_MS = SESSION_MAX_AGE_SECONDS * 1000;
const GOOGLE_GRANT_MAX_AGE_SECONDS = 180 * 24 * 60 * 60;
const GOOGLE_GRANT_MAX_AGE_MS = GOOGLE_GRANT_MAX_AGE_SECONDS * 1000;

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

function readEncryptedCookie(req, name) {
  const cookies = parseCookies(req.headers.cookie);
  return decrypt(cookies[name]);
}

function setEncryptedCookie(res, name, payload, options = {}) {
  res.append('Set-Cookie', cookie(name, encrypt(payload), options));
}

function clearCookie(res, name, options = {}) {
  res.append('Set-Cookie', cookie(name, '', { ...options, maxAge: 0 }));
}

function readSession(req) {
  const session = readEncryptedCookie(req, SESSION_COOKIE);
  if (!session || session.expiresAt <= Date.now() || !session.user?.sub || !session.csrfToken) {
    return null;
  }
  return session;
}

function setSession(res, session) {
  const storedSession = {
    ...session,
    expiresAt: Date.now() + SESSION_MAX_AGE_MS,
  };
  setEncryptedCookie(res, SESSION_COOKIE, storedSession, {
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return storedSession;
}

function clearSession(_req, res) {
  clearCookie(res, SESSION_COOKIE);
}

function setOAuthState(res, payload) {
  setEncryptedCookie(res, OAUTH_COOKIE, payload, {
    path: '/api/auth/google/callback',
    maxAge: 10 * 60,
  });
}

function readOAuthState(req) {
  return readEncryptedCookie(req, OAUTH_COOKIE);
}

function clearOAuthState(res) {
  clearCookie(res, OAUTH_COOKIE, {
    path: '/api/auth/google/callback',
  });
}

function readGoogleGrant(req) {
  const grant = readEncryptedCookie(req, GOOGLE_GRANT_COOKIE);
  if (!grant || grant.expiresAt <= Date.now() || !grant.sub || !grant.refreshToken) {
    return null;
  }
  return grant;
}

function setGoogleGrant(res, grant) {
  const storedGrant = {
    sub: grant.sub,
    email: grant.email || '',
    refreshToken: grant.refreshToken,
    expiresAt: Date.now() + GOOGLE_GRANT_MAX_AGE_MS,
  };
  setEncryptedCookie(res, GOOGLE_GRANT_COOKIE, storedGrant, {
    maxAge: GOOGLE_GRANT_MAX_AGE_SECONDS,
  });
  return storedGrant;
}

function clearGoogleGrant(res) {
  clearCookie(res, GOOGLE_GRANT_COOKIE);
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
  clearGoogleGrant,
  clearOAuthState,
  clearSession,
  createCsrfToken,
  readGoogleGrant,
  readOAuthState,
  readSession,
  requireCsrf,
  requireSession,
  setGoogleGrant,
  setOAuthState,
  setSession,
};
