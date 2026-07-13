'use strict';

const crypto = require('crypto');

const isProduction = process.env.NODE_ENV === 'production';

function readEnv(...names) {
  for (const name of names) {
    const value = String(process.env[name] || '').trim();
    if (value) return value;
  }
  return '';
}

function requireCoreEnv(name, fallback = '') {
  const value = readEnv(name) || fallback;
  if (isProduction && !value) {
    throw new Error(`Falta la variable de entorno obligatoria ${name}`);
  }
  return value;
}

function normalizeBaseUrl(value) {
  return String(value || 'http://localhost:3000').replace(/\/+$/, '');
}

const sessionSecret = requireCoreEnv('SESSION_SECRET', isProduction ? '' : 'dev-only-change-this-session-secret');
if (Buffer.byteLength(sessionSecret, 'utf8') < 32) {
  throw new Error('SESSION_SECRET debe tener al menos 32 bytes');
}

const geminiApiKey = readEnv('GEMINI_API_KEY', 'GOOGLE_API_KEY', 'API_KEY_GEMINI');
const googleClientId = readEnv('GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_AUTH_API_KEY');
const googleClientSecret = readEnv('GOOGLE_OAUTH_CLIENT_SECRET');

const integrations = Object.freeze({
  gemini: Boolean(geminiApiKey),
  google: Boolean(googleClientId && googleClientSecret),
});

const config = Object.freeze({
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction,
  port: Number.parseInt(process.env.PORT || '3000', 10),
  appBaseUrl: normalizeBaseUrl(readEnv('APP_BASE_URL')),
  geminiApiKey,
  geminiModel: readEnv('GEMINI_MODEL') || 'gemini-3.5-flash',
  googleClientId,
  googleClientSecret,
  integrations,
  sessionSecret,
  sessionKey: crypto.createHash('sha256').update(sessionSecret).digest(),
  aiLimits: Object.freeze({
    textMaxChars: 3000,
    imageMaxBytes: 4 * 1024 * 1024,
    audioMaxBytes: 8 * 1024 * 1024,
  }),
});

module.exports = config;
