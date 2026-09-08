'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ValidationError } = require('../src/lib/event');
const {
  buildInteractionRequest,
  normalizeAiEventsForCategories,
  validateAnalyzeRequest,
} = require('../src/services/gemini');

const eventTypes = [
  { name: 'Tareas', key: 'examen', googleColorId: 2, position: 0 },
  { name: 'Exámen', key: 'examen-2', googleColorId: 11, position: 1 },
  { name: 'Reunión', key: 'reunion', googleColorId: 1, position: 2 },
];

test('el modo múltiples requiere una imagen', () => {
  assert.throws(
    () => validateAnalyzeRequest({ mode: 'multiple', text: 'varias fechas' }),
    ValidationError,
  );
});

test('construye un schema de arreglo para múltiples eventos sin exponer claves históricas', () => {
  const request = validateAnalyzeRequest({
    mode: 'multiple',
    image: { mimeType: 'image/png', data: 'YWJjZA==' },
  });
  const payload = buildInteractionRequest(request, 'America/Monterrey', eventTypes);
  const schema = payload.response_format.schema;

  assert.deepEqual(schema.required, ['eventos']);
  assert.equal(schema.properties.eventos.type, 'array');
  assert.deepEqual(
    schema.properties.eventos.items.properties.categoria.enum,
    ['categoria_1', 'categoria_2', 'categoria_3'],
  );
  assert.match(payload.system_instruction, /fecha límite/i);
  assert.match(payload.system_instruction, /30 eventos/i);
  assert.doesNotMatch(payload.system_instruction, /examen-2/);
  assert.equal(payload.generation_config.max_output_tokens, 4096);
});

test('traduce cada token opaco a la clave real correspondiente', () => {
  const events = normalizeAiEventsForCategories([
    {
      titulo: 'Entrega unidad 2',
      fecha: '2026-09-18',
      hora: '09:00',
      categoria: 'categoria_1',
      recordatorios: [],
    },
    {
      titulo: 'Examen de redes',
      fecha: '2026-09-22',
      hora: '08:00',
      categoria: 'categoria_2',
      recordatorios: [],
    },
  ], eventTypes);

  assert.equal(events[0].category, 'examen');
  assert.equal(events[1].category, 'examen-2');
});
