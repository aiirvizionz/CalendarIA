'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeEventTypes } = require('../src/services/supabase');

test('normaliza tipos de evento recibidos desde Supabase', () => {
  assert.deepEqual(normalizeEventTypes([
    { id: 'a', name: ' Examen ', key: 'examen', googleColorId: 11, position: 0 },
    { id: 'b', name: 'Estudio', key: 'estudio', googleColorId: '2', position: '1' },
    { id: 'invalid', name: 'Sin color', key: 'sin-color', googleColorId: 99, position: 2 },
  ]), [
    { id: 'a', name: 'Examen', key: 'examen', googleColorId: 11, position: 0 },
    { id: 'b', name: 'Estudio', key: 'estudio', googleColorId: 2, position: 1 },
  ]);
});

test('devuelve una lista vacía para respuestas inválidas', () => {
  assert.deepEqual(normalizeEventTypes(null), []);
  assert.deepEqual(normalizeEventTypes({ eventTypes: [] }), []);
});
