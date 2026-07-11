'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ValidationError } = require('../src/lib/event');
const { extractInteractionText, validateAnalyzeRequest } = require('../src/services/gemini');

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
