'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const expectedGeminiModel = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
const { ValidationError } = require('../src/lib/event');
const {
  EVENT_SCHEMA,
  buildInteractionRequest,
  createProviderError,
  extractInteractionText,
  isRetryableStatus,
  validateAnalyzeRequest,
} = require('../src/services/gemini');

test('schema estructurado soporta recurrencia, duración, avisos y clase', () => {
  assert.ok(EVENT_SCHEMA.properties.recurrencia);
  assert.ok(EVENT_SCHEMA.properties.duracionMinutos);
  assert.ok(EVENT_SCHEMA.properties.recordatoriosMinutos);
  assert.ok(EVENT_SCHEMA.properties.categoria.enum.includes('clase'));
  assert.doesNotMatch(JSON.stringify(EVENT_SCHEMA), /"minLength"|"maxLength"|"pattern"/);
});

test('acepta texto e incorpora contexto validado para correcciones conversacionales', () => {
  const request = validateAnalyzeRequest({
    text: 'Mejor a las 7',
    contextEvent: { title: 'Clase', date: '2026-08-10', time: '18:00', category: 'clase', reminders: [10] },
  });
  const payload = buildInteractionRequest(request, 'America/Monterrey');
  assert.equal(payload.input[0].type, 'user_input');
  assert.match(payload.input[0].content[0].text, /Evento existente/);
  assert.equal(payload.input[0].content[1].text, 'Mejor a las 7');
  assert.equal(payload.store, false);
});

test('anida imagen y audio en UserInputStep y rechaza mezclarlos', () => {
  const image = validateAnalyzeRequest({ text: 'Extrae', image: { mimeType: 'image/png', data: 'YWJjZA==' } });
  assert.equal(buildInteractionRequest(image, 'America/Monterrey').input[0].content[1].type, 'image');
  const wav = { mimeType: 'audio/wav', data: 'YWJjZA==' };
  assert.equal(buildInteractionRequest(validateAnalyzeRequest({ audio: wav }), 'America/Monterrey').input[0].content[0].type, 'audio');
  assert.throws(() => validateAnalyzeRequest({ image: { mimeType: 'image/png', data: 'YWJjZA==' }, audio: wav }), ValidationError);
});

test('rechaza solicitudes vacías, MIME no permitido y base64 inválido', () => {
  assert.throws(() => validateAnalyzeRequest({}), ValidationError);
  assert.throws(() => validateAnalyzeRequest({ text: 'a'.repeat(3001) }), ValidationError);
  assert.throws(() => validateAnalyzeRequest({ image: { mimeType: 'image/svg+xml', data: 'YWJjZA==' } }), ValidationError);
  assert.throws(() => validateAnalyzeRequest({ image: { mimeType: 'image/png', data: '<script>' } }), ValidationError);
});

test('extrae texto solo de model_output', () => {
  const payload = { steps: [{ type: 'tool_output', content: [{ type: 'text', text: 'ignorar' }] }, { type: 'model_output', content: [{ type: 'text', text: '{"eventos":[]}' }] }] };
  assert.equal(extractInteractionText(payload), '{"eventos":[]}');
});

test('reintenta solo estados transitorios del proveedor', () => {
  for (const status of [408, 429, 500, 502, 503, 504]) assert.equal(isRetryableStatus(status), true);
  for (const status of [400, 401, 403, 404]) assert.equal(isRetryableStatus(status), false);
});

test('sanitiza claves de API y clasifica errores del proveedor', () => {
  const error = createProviderError(403, { error: { status: 'PERMISSION_DENIED', message: 'API key AIzaabcdefghijklmnopqrstuvwxyz1234567890 was rejected' } });
  assert.equal(error.statusCode, 424);
  assert.equal(error.code, 'AI_PROVIDER_AUTH_ERROR');
  assert.equal(error.provider.model, expectedGeminiModel);
  assert.doesNotMatch(error.provider.message, /AIza/);
  assert.match(error.provider.message, /\[redacted-api-key\]/);
  assert.equal(createProviderError(429, { error: { status: 'RESOURCE_EXHAUSTED' } }).statusCode, 429);
  assert.equal(createProviderError(404, { error: { status: 'NOT_FOUND' } }).code, 'AI_MODEL_UNAVAILABLE');
});
