'use strict';

const config = require('../../config');
const URL = 'https://generativelanguage.googleapis.com/v1/interactions';
const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

function safe(value) { return String(value || '').replace(/AIza[A-Za-z0-9_-]{20,}/g, '[redacted-api-key]').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300); }
function isRetryableStatus(status) { return RETRYABLE.has(Number(status)); }
function createProviderError(status, payload = null) {
  const httpStatus = Number(status) || 502; let code = 'AI_PROVIDER_ERROR'; let statusCode = 502; let message = 'El servicio de IA no está disponible temporalmente';
  if (httpStatus === 429) { code = 'AI_PROVIDER_RATE_LIMITED'; statusCode = 429; message = 'Gemini alcanzó su límite temporal. Intenta nuevamente en unos minutos.'; }
  else if ([401, 403].includes(httpStatus)) { code = 'AI_PROVIDER_AUTH_ERROR'; statusCode = 424; message = 'Gemini rechazó la credencial configurada. Revisa la API key en Render.'; }
  else if (httpStatus === 404) { code = 'AI_MODEL_UNAVAILABLE'; statusCode = 424; message = `El modelo ${config.geminiModel} no está disponible para esta API key.`; }
  else if (httpStatus === 400) { code = 'AI_PROVIDER_REQUEST_ERROR'; statusCode = 422; message = 'Gemini rechazó el formato de análisis. Revisa los logs del servidor.'; }
  const error = new Error(message); error.statusCode = statusCode; error.code = code;
  error.provider = { httpStatus, status: safe(payload?.error?.status) || 'UNKNOWN', message: safe(payload?.error?.message) || 'Sin detalle del proveedor', model: config.geminiModel };
  return error;
}

function extractInteractionText(payload) {
  for (const step of Array.isArray(payload?.steps) ? payload.steps : []) if (step?.type === 'model_output') for (const item of Array.isArray(step.content) ? step.content : []) if (item?.type === 'text' && typeof item.text === 'string' && item.text.trim()) return item.text.trim();
  return '';
}

function delay(attempt) { return 350 * (2 ** (attempt - 1)) + Math.floor(Math.random() * 200); }
async function requestInteraction(body) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 30000);
    let response;
    try { response = await fetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.geminiApiKey }, body, signal: controller.signal }); }
    catch (cause) {
      clearTimeout(timer); if (attempt < 3) { await new Promise((resolve) => setTimeout(resolve, delay(attempt))); continue; }
      const error = new Error('No se pudo contactar al servicio de IA'); error.statusCode = 502; error.code = 'AI_PROVIDER_NETWORK_ERROR'; error.provider = { httpStatus: 0, status: cause?.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR', message: safe(cause?.message), model: config.geminiModel }; throw error;
    }
    clearTimeout(timer); const raw = await response.text(); let payload = null; try { payload = raw ? JSON.parse(raw) : null; } catch {}
    if (response.ok) return payload;
    if (isRetryableStatus(response.status) && attempt < 3) { await new Promise((resolve) => setTimeout(resolve, delay(attempt))); continue; }
    throw createProviderError(response.status, payload);
  }
  throw new Error('Gemini no respondió');
}

module.exports = { createProviderError, extractInteractionText, isRetryableStatus, requestInteraction };
