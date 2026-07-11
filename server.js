'use strict';

const crypto = require('crypto');
const path = require('path');
const express = require('express');
const dotenv = require('dotenv');

dotenv.config();

const config = require('./src/config');
const { ValidationError, validateEvent } = require('./src/lib/event');
const { createRateLimiter } = require('./src/lib/rate-limit');
const {
  clearOAuthState,
  clearSession,
  createCsrfToken,
  readOAuthState,
  readSession,
  requireCsrf,
  requireSession,
  setOAuthState,
  setSession,
} = require('./src/lib/session');
const { analyzeEvent } = require('./src/services/gemini');
const {
  createAuthorizationRequest,
  createCalendarEvent,
  deleteCalendarEvent,
  ensureAccessToken,
  exchangeAuthorizationCode,
  getUserInfo,
  revokeToken,
  updateCalendarEvent,
} = require('./src/services/google');

const app = express();
const publicDir = path.join(__dirname, 'public');

app.disable('x-powered-by');
if (config.isProduction) app.set('trust proxy', 1);

function securityHeaders(req, res, next) {
  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self' https://accounts.google.com",
    "script-src 'self'",
    "style-src 'self' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "connect-src 'self'",
  ];
  if (config.isProduction) csp.push('upgrade-insecure-requests');

  res.setHeader('Content-Security-Policy', csp.join('; '));
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), microphone=(self)');
  if (config.isProduction) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
}

function requestContext(req, res, next) {
  req.requestId = crypto.randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  next();
}

function getTimeZone(req) {
  const timeZone = String(req.get('x-time-zone') || 'UTC');
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
    return timeZone;
  } catch {
    throw new ValidationError('La zona horaria no es válida');
  }
}

async function googleContext(req, res) {
  const context = await ensureAccessToken(req.session);
  if (context.refreshed) {
    req.session = context.session;
    setSession(res, context.session);
  }
  return context.accessToken;
}

const publicLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 120,
  keyFn: (req) => req.ip,
  code: 'PUBLIC_RATE_LIMITED',
});

const aiIpLimiter = createRateLimiter({
  windowMs: 15 * 60_000,
  max: 60,
  keyFn: (req) => req.ip,
  code: 'AI_IP_RATE_LIMITED',
});

const aiUserLimiter = createRateLimiter({
  windowMs: 15 * 60_000,
  max: 20,
  keyFn: (req) => req.session?.user?.sub,
  code: 'AI_USER_RATE_LIMITED',
});

const calendarUserLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 30,
  keyFn: (req) => req.session?.user?.sub,
  code: 'CALENDAR_RATE_LIMITED',
});

app.use(securityHeaders);
app.use(requestContext);
app.use(publicLimiter);
app.use('/api', express.json({ limit: '12mb', strict: true, type: 'application/json' }));

app.get('/health', (req, res) => {
  res.status(200).json({ ok: true, service: 'calendaria' });
});

app.get('/api/session', (req, res) => {
  const session = readSession(req);
  if (!session) return res.json({ authenticated: false });

  return res.json({
    authenticated: true,
    csrfToken: session.csrfToken,
    user: {
      name: session.user.name,
      email: session.user.email,
      picture: session.user.picture,
    },
  });
});

app.get('/api/auth/google/start', (req, res, next) => {
  try {
    const authorization = createAuthorizationRequest();
    setOAuthState(res, {
      state: authorization.state,
      verifier: authorization.verifier,
      expiresAt: authorization.expiresAt,
    });
    return res.redirect(authorization.url);
  } catch (error) {
    return next(error);
  }
});

app.get('/api/auth/google/callback', async (req, res, next) => {
  const oauthState = readOAuthState(req);
  clearOAuthState(res);

  try {
    const code = String(req.query.code || '');
    const state = String(req.query.state || '');
    if (!oauthState || oauthState.expiresAt < Date.now() || !state || state !== oauthState.state || !code) {
      const error = new Error('La autorización de Google no pudo validarse');
      error.statusCode = 400;
      error.code = 'OAUTH_STATE_INVALID';
      throw error;
    }

    const tokens = await exchangeAuthorizationCode(code, oauthState.verifier);
    const user = await getUserInfo(tokens.access_token);
    if (!user?.sub || !user?.email) {
      const error = new Error('Google no devolvió un perfil válido');
      error.statusCode = 502;
      error.code = 'GOOGLE_PROFILE_INVALID';
      throw error;
    }

    setSession(res, {
      user: {
        sub: user.sub,
        name: user.name || user.email,
        email: user.email,
        picture: user.picture || '',
      },
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || '',
      accessTokenExpiresAt: Date.now() + Number(tokens.expires_in || 3600) * 1000,
      csrfToken: createCsrfToken(),
    });

    return res.redirect('/?auth=success');
  } catch (error) {
    if (!error.statusCode || error.statusCode >= 500) {
      console.error(JSON.stringify({ requestId: req.requestId, code: error.code || 'OAUTH_ERROR', message: error.message }));
    }
    return res.redirect('/?auth=error');
  }
});

app.post('/api/auth/logout', requireSession, requireCsrf, async (req, res) => {
  const token = req.session.refreshToken || req.session.accessToken;
  clearSession(res);
  await revokeToken(token);
  res.status(204).end();
});

app.post('/api/ai/analyze', requireSession, requireCsrf, aiIpLimiter, aiUserLimiter, async (req, res, next) => {
  try {
    const event = await analyzeEvent(req.body, getTimeZone(req));
    return res.json({ event });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/calendar/events', requireSession, requireCsrf, calendarUserLimiter, async (req, res, next) => {
  try {
    const event = validateEvent(req.body);
    const timeZone = getTimeZone(req);
    const accessToken = await googleContext(req, res);
    const created = await createCalendarEvent(accessToken, event, timeZone);
    return res.status(201).json({
      googleEventId: created.id,
      htmlLink: created.htmlLink || '',
    });
  } catch (error) {
    return next(error);
  }
});

app.patch('/api/calendar/events/:eventId', requireSession, requireCsrf, calendarUserLimiter, async (req, res, next) => {
  try {
    const event = validateEvent(req.body);
    const timeZone = getTimeZone(req);
    const accessToken = await googleContext(req, res);
    const updated = await updateCalendarEvent(accessToken, req.params.eventId, event, timeZone);
    return res.json({
      googleEventId: updated.id,
      htmlLink: updated.htmlLink || '',
    });
  } catch (error) {
    return next(error);
  }
});

app.delete('/api/calendar/events/:eventId', requireSession, requireCsrf, calendarUserLimiter, async (req, res, next) => {
  try {
    const accessToken = await googleContext(req, res);
    await deleteCalendarEvent(accessToken, req.params.eventId);
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

app.use(express.static(publicDir, {
  dotfiles: 'deny',
  index: false,
  maxAge: config.isProduction ? '1h' : 0,
  etag: true,
}));

app.get('*', (req, res, next) => {
  if (!req.accepts('html')) return next();
  return res.sendFile(path.join(publicDir, 'index.html'));
});

app.use((req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Recurso no encontrado' } });
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);

  const statusCode = Number(error.statusCode) || (error.type === 'entity.too.large' ? 413 : 500);
  const code = error.code || (statusCode === 413 ? 'PAYLOAD_TOO_LARGE' : 'INTERNAL_ERROR');
  const safeMessage = statusCode < 500
    ? error.message
    : 'Ocurrió un error interno. Intenta nuevamente.';

  if (statusCode >= 500) {
    console.error(JSON.stringify({
      requestId: req.requestId,
      code,
      message: error.message,
      stack: config.isProduction ? undefined : error.stack,
    }));
  }

  return res.status(statusCode).json({
    error: {
      code,
      message: safeMessage,
      requestId: req.requestId,
    },
  });
});

const server = app.listen(config.port, () => {
  console.log(`CalendarIA escuchando en ${config.appBaseUrl}`);
  console.log(`Gemini model: ${config.geminiModel}`);
});

server.requestTimeout = 45_000;
server.headersTimeout = 50_000;
server.keepAliveTimeout = 5_000;

server.on('error', (error) => {
  console.error('Error iniciando servidor:', error.message || error);
  process.exit(1);
});

module.exports = app;
