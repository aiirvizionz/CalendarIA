'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ValidationError,
  addMinutesToLocalDateTime,
  isValidDate,
  isValidTime,
  normalizeAiEvent,
  validateEvent,
} = require('../src/lib/event');

test('valida fechas reales y años bisiestos', () => {
  assert.equal(isValidDate('2026-07-11'), true);
  assert.equal(isValidDate('2024-02-29'), true);
  assert.equal(isValidDate('2026-02-29'), false);
  assert.equal(isValidDate('2026-13-01'), false);
});

test('rechaza horas fuera del rango de 24 horas', () => {
  assert.equal(isValidTime('00:00'), true);
  assert.equal(isValidTime('23:59'), true);
  assert.equal(isValidTime('24:00'), false);
  assert.equal(isValidTime('09:90'), false);
});

test('normaliza un evento y elimina duplicados de recordatorios', () => {
  assert.deepEqual(validateEvent({
    title: '  Examen   de redes  ',
    date: '2026-07-11',
    time: '08:30',
    category: 'examen',
    reminders: [60, '10', 60],
  }), {
    title: 'Examen de redes',
    date: '2026-07-11',
    time: '08:30',
    category: 'examen',
    reminders: [10, 60],
  });
});

test('rechaza categorías y recordatorios no permitidos', () => {
  assert.throws(() => validateEvent({
    title: 'Evento',
    date: '2026-07-11',
    time: '08:30',
    category: 'otra-cosa',
    reminders: [10],
  }), ValidationError);

  assert.throws(() => validateEvent({
    title: 'Evento',
    date: '2026-07-11',
    time: '08:30',
    category: 'otro',
    reminders: [999],
  }), ValidationError);
});

test('calcula el fin del evento como hora local sin convertir a UTC', () => {
  assert.deepEqual(addMinutesToLocalDateTime('2026-07-11', '23:30', 60), {
    date: '2026-07-12',
    time: '00:30',
  });
  assert.deepEqual(addMinutesToLocalDateTime('2026-01-31', '23:45', 60), {
    date: '2026-02-01',
    time: '00:45',
  });
});

test('valida la salida estructurada de IA una segunda vez', () => {
  assert.deepEqual(normalizeAiEvent({
    titulo: 'Presentación final',
    fecha: '2026-12-01',
    hora: '09:00',
    categoria: 'presentacion',
  }), {
    title: 'Presentación final',
    date: '2026-12-01',
    time: '09:00',
    category: 'presentacion',
    reminders: [10],
  });

  assert.throws(() => normalizeAiEvent({
    titulo: 'Evento',
    fecha: 'mañana',
    hora: 'temprano',
    categoria: 'otro',
  }), ValidationError);
});
