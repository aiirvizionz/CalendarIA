import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateUniqueKey, isValidKey, keyFromName } from '../public/js/category-key.mjs';

test('normaliza nombres con acentos para claves internas', () => {
  assert.equal(keyFromName('Exámen'), 'examen');
  assert.equal(keyFromName('Reunión de equipo'), 'reunion-de-equipo');
});

test('genera una clave distinta cuando una clave histórica ya está ocupada', () => {
  const used = new Set(['examen']);
  assert.equal(allocateUniqueKey('Exámen', used), 'examen-2');
});

test('incrementa el sufijo hasta encontrar una clave libre', () => {
  const used = new Set(['examen', 'examen-2', 'examen-3']);
  assert.equal(allocateUniqueKey('Exámen', used), 'examen-4');
});

test('mantiene las claves generadas dentro del límite permitido', () => {
  const longName = 'a'.repeat(100);
  const first = keyFromName(longName);
  const second = allocateUniqueKey(longName, new Set([first]));
  assert.equal(first.length, 80);
  assert.ok(second.length <= 80);
  assert.equal(isValidKey(second), true);
});
