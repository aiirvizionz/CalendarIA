'use strict';

const crypto = require('crypto');
const config = require('../../config');

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const SCOPES = ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/calendar.events'];

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

function clean(value) {
  return String(value || '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
}

async function readGoogleResponse(response, fallback) {
  const raw = await response.text();
  let payload = null;
  try { payload = raw ? JSON.parse(raw) : null; } catch { payload = null; }
  if (!response.ok) {
    const error = new Error(clean(payload?.error_description || payload?.error?.message || fallback) || fallback);
    error.statusCode = response.status === 401 ? 401 : response.status === 404 ? 404 : 502;
    error.code = response.status === 401 ? 'GOOGLE_AUTH_EXPIRED' : response.status === 404 ? 'GOOGLE_EVENT_NOT_FOUND' : 'GOOGLE_API_ERROR';
    throw error;
  }
  return payload;
}

function createPkcePair() {
  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

function createAuthorizationRequest() {
  const state = crypto.randomBytes(32).toString('base64url');
  const { verifier, challenge } = createPkcePair();
  const redirectUri = `${config.appBaseUrl}/api/auth/google/callback`;
  const params = new URLSearchParams({
    client_id: config.googleClientId, redirect_uri: redirectUri, response_type: 'code', scope: SCOPES.join(' '),
    include_granted_scopes: 'true', access_type: 'offline', prompt: 'consent', state,
    code_challenge: challenge, code_challenge_method: 'S256',
  });
  return { url: `${AUTH_URL}?${params}`, state, verifier, expiresAt: Date.now() + 10 * 60_000 };
}

async function exchangeAuthorizationCode(code, verifier) {
  const redirectUri = `${config.appBaseUrl}/api/auth/google/callback`;
  const response = await fetchWithTimeout(TOKEN_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: config.googleClientId, client_secret: config.googleClientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code', code_verifier: verifier }),
  });
  return readGoogleResponse(response, 'No se pudo completar la autorización con Google');
}

async function refreshAccessToken(refreshToken) {
  if (!refreshToken) { const error = new Error('La sesión de Google expiró'); error.statusCode = 401; error.code = 'GOOGLE_AUTH_EXPIRED'; throw error; }
  const response = await fetchWithTimeout(TOKEN_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: config.googleClientId, client_secret: config.googleClientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
  });
  return readGoogleResponse(response, 'No se pudo renovar la sesión de Google');
}

async function ensureAccessToken(session) {
  if (session.accessToken && Number(session.accessTokenExpiresAt) > Date.now() + 60_000) return { accessToken: session.accessToken, session, refreshed: false };
  const tokens = await refreshAccessToken(session.refreshToken);
  const updatedSession = { ...session, accessToken: tokens.access_token, accessTokenExpiresAt: Date.now() + Number(tokens.expires_in || 3600) * 1000 };
  return { accessToken: updatedSession.accessToken, session: updatedSession, refreshed: true };
}

async function getUserInfo(accessToken) {
  const response = await fetchWithTimeout(USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
  return readGoogleResponse(response, 'No se pudo obtener el perfil de Google');
}

async function revokeToken(token) {
  if (!token) return;
  try { await fetchWithTimeout(REVOKE_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }) }, 5000); } catch {}
}

module.exports = { createAuthorizationRequest, ensureAccessToken, exchangeAuthorizationCode, fetchWithTimeout, getUserInfo, readGoogleResponse, revokeToken };
