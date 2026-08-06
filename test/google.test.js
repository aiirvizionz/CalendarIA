'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCalendarEvent, normalizeCalendarEvent, parseRecurrenceRule, recurrenceToRRule } = require('../src/services/google');
const { validateEvent, CATEGORY_META } = require('../src/lib/event');

test('crea payload con color, metadatos privados, duración, avisos y recurrencia', () => {
  const event = validateEvent({
    title: 'Clase de IA', date: '2026-08-10', time: '18:00', category: 'clase', durationMinutes: 90,
    reminders: [60, 1440], location: 'Aula 120', description: 'Modelos generativos',
    recurrence: { frequency: 'weekly', interval: 1, daysOfWeek: ['MO', 'WE'], until: '2026-12-16' },
  });
  const payload = buildCalendarEvent(event, 'America/Monterrey', 'proposal_12345678');
  assert.equal(payload.colorId, CATEGORY_META.clase.googleColorId);
  assert.equal(payload.extendedProperties.private.source, 'calendaria');
  assert.equal(payload.extendedProperties.private.category, 'clase');
  assert.equal(payload.extendedProperties.private.proposalId, 'proposal_12345678');
  assert.equal(payload.end.dateTime, '2026-08-10T19:30:00');
  assert.deepEqual(payload.recurrence, ['RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE;UNTIL=20261216T235959Z']);
});

test('convierte recurrencia en ambos sentidos', () => {
  assert.equal(recurrenceToRRule({ frequency: 'weekly', interval: 2, daysOfWeek: ['FR'], count: 8 }), 'RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=FR;COUNT=8');
  assert.deepEqual(parseRecurrenceRule(['RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;UNTIL=20261218T235959Z']), {
    frequency: 'weekly', interval: 2, daysOfWeek: ['MO', 'WE'], until: '2026-12-18', count: null,
  });
});

test('normaliza categoría y marca de CalendarIA desde extendedProperties', () => {
  const normalized = normalizeCalendarEvent({
    id: 'abc', summary: 'Clase', colorId: '9', creator: { self: true }, organizer: { self: true },
    start: { dateTime: '2026-08-10T18:00:00-06:00', timeZone: 'America/Monterrey' },
    end: { dateTime: '2026-08-10T19:30:00-06:00' },
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 60 }] },
    extendedProperties: { private: { source: 'calendaria', category: 'clase' } },
  });
  assert.equal(normalized.category, 'clase');
  assert.equal(normalized.createdByCalendarIA, true);
  assert.equal(normalized.durationMinutes, 90);
});

const { selectUpcomingOwnedEvents, eventContentKey } = require('../src/services/google');

test('filtra eventos futuros propios, colapsa recurrencias y duplicados de contenido', () => {
  const now = Date.parse('2026-08-01T12:00:00Z');
  const events = [
    { id: 'past', summary: 'Pasado', eventType: 'default', creator: { self: true }, start: { dateTime: '2026-07-01T10:00:00Z' }, end: { dateTime: '2026-07-01T11:00:00Z' } },
    { id: 'invite', summary: 'Ajeno', eventType: 'default', creator: { self: false }, start: { dateTime: '2026-08-03T10:00:00Z' }, end: { dateTime: '2026-08-03T11:00:00Z' } },
    { id: 'r1', recurringEventId: 'series', summary: 'Clase', eventType: 'default', creator: { self: true }, start: { dateTime: '2026-08-03T10:00:00Z' }, end: { dateTime: '2026-08-03T11:00:00Z' } },
    { id: 'r2', recurringEventId: 'series', summary: 'Clase', eventType: 'default', creator: { self: true }, start: { dateTime: '2026-08-10T10:00:00Z' }, end: { dateTime: '2026-08-10T11:00:00Z' } },
    { id: 'exam', summary: 'Examen', eventType: 'default', creator: { self: true }, start: { dateTime: '2026-08-04T10:00:00Z' }, end: { dateTime: '2026-08-04T11:00:00Z' } },
    { id: 'exam-dup', summary: ' EXAMEN ', eventType: 'default', creator: { self: true }, start: { dateTime: '2026-08-04T10:00:00Z' }, end: { dateTime: '2026-08-04T11:00:00Z' } },
  ];
  const result = selectUpcomingOwnedEvents(events, new Map([['series', { frequency: 'weekly', interval: 1, daysOfWeek: ['MO'], until: null, count: null }]]), now);
  assert.deepEqual(result.map((event) => event.id), ['r1', 'exam']);
});

test('normaliza título y fecha para identidad de contenido', () => {
  assert.equal(eventContentKey({ summary: ' Examen  de Redes ', start: { dateTime: '2026-08-04T10:00:00Z' } }), eventContentKey({ summary: 'EXAMEN DE REDES', start: { dateTime: '2026-08-04T10:00:00Z' } }));
});
