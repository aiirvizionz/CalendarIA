'use strict';

const dotenv = require('dotenv');

dotenv.config({ quiet: true });

const Sentry = require('@sentry/node');

function parseRate(value, fallback) {
  const parsed = Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(1, Math.max(0, parsed));
}

function scrubEvent(event) {
  if (event?.request) {
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.query_string;
    if (event.request.headers) {
      const headers = { ...event.request.headers };
      for (const key of Object.keys(headers)) {
        if (['authorization', 'cookie', 'set-cookie', 'x-csrf-token'].includes(key.toLowerCase())) {
          headers[key] = '[Filtered]';
        }
      }
      event.request.headers = headers;
    }
  }

  if (event?.user) {
    delete event.user.email;
    delete event.user.username;
    delete event.user.ip_address;
  }

  return event;
}

const dsn = String(process.env.SENTRY_DSN || '').trim();
const enabled = Boolean(dsn);
const environment = String(process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development').trim();
const release = String(process.env.SENTRY_RELEASE || process.env.RENDER_GIT_COMMIT || '').trim() || undefined;

if (enabled) {
  Sentry.init({
    dsn,
    environment,
    release,
    sendDefaultPii: false,
    tracesSampleRate: parseRate(process.env.SENTRY_TRACES_SAMPLE_RATE, environment === 'production' ? 0.1 : 0),
    beforeSend: scrubEvent,
  });
}

module.exports = {
  Sentry,
  enabled,
  environment,
  release,
  parseRate,
};
