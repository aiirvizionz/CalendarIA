'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { CATEGORY_META, ValidationError, addMinutesToLocalDateTime, isValidDate, isValidTime, normalizeAiEvent, validateEvent } = require('../src/lib/event');

test('valida fechas reales y horas de 24 horas', () => {
  assert.equal(isValidDate('2024-02-29'), true);
  assert.equal(isValidDate('2026-02-29'), false);
  assert.equal(isValidTime('23:59'), true);
  assert.equal(isValidTime('24:00'), false);
});

test('normaliza duración, avisos, recurrencia y color por categoría', () => {
  const event = validateEvent({
    title: '  Clase de redes ', date: '2026-08-10', time: '18:00', category: 'clase', durationMinutes: 90,
    reminders: [60, 2880, 60], location: 'FIME', description: 'Laboratorio',
    recurrence: { frequency: 'weekly', interval: 2, daysOfWeek: ['MO', 'WE'], until: '2026-12-14' },
  });
  assert.equal(event.title, 'Clase de redes');
  assert.equal(event.googleColorId, CATEGORY_META.clase.googleColorId);
  assert.equal(event.categoryColor, CATEGORY_META.clase.uiColor);
  assert.deepEqual(event.reminders, [60, 2880]);
  assert.deepEqual(event.recurrence.daysOfWeek, ['MO', 'WE']);
  assert.equal(event.durationMinutes, 90);
});

test('permite evento de todo el día sin hora', () => {
  const event = validateEvent({ title: 'Entrega', date: '2026-08-12', allDay: true, category: 'tarea', reminders: [1440] });
  assert.equal(event.time, '');
  assert.equal(event.durationMinutes, 1440);
});

test('rechaza recurrencia incompatible y avisos fuera de Google Calendar', () => {
  assert.throws(() => validateEvent({ title: 'Evento', date: '2026-08-10', time: '09:00', category: 'otro', reminders: [50000] }), ValidationError);
  assert.throws(() => validateEvent({
    title: 'Evento', date: '2026-08-10', time: '09:00', category: 'otro',
    recurrence: { frequency: 'weekly', interval: 1, until: '2026-09-01', count: 4 },
  }), ValidationError);
});

test('normaliza la salida ampliada de IA y conserva supuestos', () => {
  const event = normalizeAiEvent({
    titulo: 'Revisión', fecha: '2026-08-14', hora: '16:00', todoElDia: false, duracionMinutos: 60,
    categoria: 'tarea', ubicacion: '', descripcion: '', recordatoriosMinutos: [60, 1440],
    recurrencia: { frequency: 'weekly', interval: 2, daysOfWeek: ['FR'], until: '2026-12-18', count: 0 },
    supuestos: ['Duración sugerida de 60 minutos'],
  });
  assert.equal(event.recurrence.frequency, 'weekly');
  assert.equal(event.recurrence.count, null);
  assert.deepEqual(event.assumptions, ['Duración sugerida de 60 minutos']);
});

test('calcula fin local sin convertir a UTC', () => {
  assert.deepEqual(addMinutesToLocalDateTime('2026-08-10', '23:30', 90), { date: '2026-08-11', time: '01:00' });
});
