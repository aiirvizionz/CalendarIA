'use strict';

const crypto = require('crypto');

const isProduction = process.env.NODE_ENV === 'production';

function requireEnv(name, fallback = '') {
  const value = String(process.env[name] || fallback).trim();
  if (isProduction && !value) {
    throw new Error(`Falta la variable de entorno obligatoria ${name}`);
  }
  return value;
}

function normalizeBaseUrl(value) {
  if (!value) return 'http://localhost:3000';
  return value.replace(/\/+$/, '');
}

const sessionSecret = requireEnv('SESSION_SECRET', 'dev-only-change-this-session-secret');
if (Buffer.byteLength(sessionSecret, 'utf8') < 32) {
  throw new Error('SESSION_SECRET debe tener al menos 32 bytes');
}

const config = Object.freeze({
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction,
  port: Number.parseInt(process.env.PORT || '3000', 10),
  appBaseUrl: normalizeBaseUrl(requireEnv('APP_BASE_URL', 'http://localhost:3000')),
  geminiApiKey: requireEnv('GEMINI_API_KEY'),
  geminiModel: requireEnv('GEMINI_MODEL', 'gemini-2.5-flash'),
  googleClientId: requireEnv('GOOGLE_OAUTH_CLIENT_ID'),
  googleClientSecret: requireEnv('GOOGLE_OAUTH_CLIENT_SECRET'),
  sessionSecret,
  sessionKey: crypto.createHash('sha256').update(sessionSecret).digest(),
  aiLimits: Object.freeze({
    textMaxChars: 3000,
    imageMaxBytes: 4 * 1024 * 1024,
    audioMaxBytes: 8 * 1024 * 1024,
  }),
});

module.exports = config;
