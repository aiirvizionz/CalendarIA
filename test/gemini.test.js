'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ValidationError } = require('../src/lib/event');
const {
  createProviderError,
  extractInteractionText,
  isRetryableStatus,
  validateAnalyzeRequest,
} = require('../src/services/gemini');

test('acepta texto dentro del límite de análisis', () => {
  assert.deepEqual(validateAnalyzeRequest({ text: 'Examen mañana a las 8' }), {
    text: 'Examen mañana a las 8',
    image: null,
    audio: null,
  });
});

test('rechaza solicitudes vacías y texto excesivo', () => {
  assert.throws(() => validateAnalyzeRequest({}), ValidationError);
  assert.throws(() => validateAnalyzeRequest({ text: 'a'.repeat(3001) }), ValidationError);
});

test('rechaza MIME no permitido y base64 inválido', () => {
  assert.throws(() => validateAnalyzeRequest({
    image: { mimeType: 'image/svg+xml', data: 'YWJjZA==' },
  }), ValidationError);

  assert.throws(() => validateAnalyzeRequest({
    image: { mimeType: 'image/png', data: '<script>' },
  }), ValidationError);
});

test('acepta WAV y no permite mezclar imagen con audio', () => {
  const wav = { mimeType: 'audio/wav', data: 'YWJjZA==' };
  assert.equal(validateAnalyzeRequest({ audio: wav }).audio.mimeType, 'audio/wav');

  assert.throws(() => validateAnalyzeRequest({
    image: { mimeType: 'image/png', data: 'YWJjZA==' },
    audio: wav,
  }), ValidationError);
});

test('extrae texto exclusivamente de un model_output', () => {
  const payload = {
    steps: [
      { type: 'tool_output', content: [{ type: 'text', text: 'ignorar' }] },
      { type: 'model_output', content: [{ type: 'text', text: '{"titulo":"Evento"}' }] },
    ],
  };
  assert.equal(extractInteractionText(payload), '{"titulo":"Evento"}');
  assert.equal(extractInteractionText({ steps: [] }), '');
});

test('reintenta solo estados transitorios del proveedor', () => {
  for (const status of [408, 429, 500, 502, 503, 504]) {
    assert.equal(isRetryableStatus(status), true, `HTTP ${status} debe ser reintentable`);
  }
  for (const status of [400, 401, 403, 404]) {
    assert.equal(isRetryableStatus(status), false, `HTTP ${status} no debe reintentarse`);
  }
});

test('clasifica y sanitiza errores de autenticación de Gemini con mensaje exponible', () => {
  const error = createProviderError(403, {
    error: {
      status: 'PERMISSION_DENIED',
      message: 'API key AIzaabcdefghijklmnopqrstuvwxyz1234567890 was rejected',
    },
  });

  assert.equal(error.statusCode, 424);
  assert.equal(error.code, 'AI_PROVIDER_AUTH_ERROR');
  assert.match(error.message, /API key en Render/);
  assert.equal(error.provider.httpStatus, 403);
  assert.equal(error.provider.status, 'PERMISSION_DENIED');
  assert.equal(error.provider.model, 'gemini-3.5-flash');
  assert.doesNotMatch(error.provider.message, /AIza/);
  assert.match(error.provider.message, /\[redacted-api-key\]/);
});

test('clasifica solicitudes inválidas y modelos no disponibles sin convertirlos en 500 genérico', () => {
  const requestError = createProviderError(400, {
    error: { status: 'INVALID_ARGUMENT', message: 'Invalid response format' },
  });
  const modelError = createProviderError(404, {
    error: { status: 'NOT_FOUND', message: 'Model not found' },
  });

  assert.equal(requestError.statusCode, 422);
  assert.equal(requestError.code, 'AI_PROVIDER_REQUEST_ERROR');
  assert.equal(modelError.statusCode, 424);
  assert.equal(modelError.code, 'AI_MODEL_UNAVAILABLE');
});

test('clasifica el límite del proveedor como HTTP 429', () => {
  const error = createProviderError(429, {
    error: { status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded' },
  });

  assert.equal(error.statusCode, 429);
  assert.equal(error.code, 'AI_PROVIDER_RATE_LIMITED');
  assert.equal(error.provider.status, 'RESOURCE_EXHAUSTED');
});