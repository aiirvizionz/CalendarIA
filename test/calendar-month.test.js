'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calendarMonthWindow,
  selectCalendarMonthEvents,
} = require('../src/services/google-calendar-month');

test('crea una ventana mensual con margen para zonas horarias', () => {
  assert.deepEqual(calendarMonthWindow('2026-09'), {
    timeMin: '2026-08-31T00:00:00.000Z',
    timeMax: '2026-10-02T00:00:00.000Z',
  });
  assert.equal(calendarMonthWindow('2026-13'), null);
});

test('la vista mensual conserva todas las ocurrencias reales de una recurrencia', () => {
  const recurring = (id, dateTime) => ({
    id,
    recurringEventId: 'series-english',
    summary: 'Clase de inglés',
    eventType: 'default',
    status: 'confirmed',
    creator: { self: true },
    organizer: { self: true },
    colorId: '2',
    start: { dateTime, timeZone: 'America/Monterrey' },
    end: { dateTime, timeZone: 'America/Monterrey' },
    reminders: { useDefault: true },
  });

  const result = selectCalendarMonthEvents([
    recurring('occurrence-1', '2026-09-12T12:00:00-06:00'),
    recurring('occurrence-2', '2026-09-19T12:00:00-06:00'),
    recurring('occurrence-3', '2026-09-26T12:00:00-06:00'),
    {
      id: 'cancelled-occurrence',
      recurringEventId: 'series-english',
      summary: 'Clase de inglés',
      eventType: 'default',
      status: 'cancelled',
      creator: { self: true },
      start: { dateTime: '2026-09-05T12:00:00-06:00' },
    },
    {
      id: 'foreign-event',
      summary: 'Invitación',
      eventType: 'default',
      status: 'confirmed',
      creator: { self: false },
      start: { dateTime: '2026-09-20T10:00:00-06:00' },
    },
  ]);

  assert.equal(result.length, 3);
  assert.deepEqual(result.map((event) => event.id), ['occurrence-1', 'occurrence-2', 'occurrence-3']);
  assert.equal(result.every((event) => event.recurring === true), true);
  assert.equal(result.every((event) => event.deleteId === 'series-english'), true);
});
