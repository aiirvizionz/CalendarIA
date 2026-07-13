'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  eventContentKey,
  normalizeCalendarEvent,
  parseRecurrenceRule,
  selectUpcomingOwnedEvents,
} = require('../src/services/google');

test('normaliza un evento con hora de Google Calendar', () => {
  assert.deepEqual(normalizeCalendarEvent({
    id: 'event-123',
    summary: 'Examen de\nRedes',
    htmlLink: 'https://calendar.google.com/calendar/event?eid=abc',
    eventType: 'default',
    creator: { self: true },
    organizer: { self: true },
    start: {
      dateTime: '2026-07-14T17:00:00-06:00',
      timeZone: 'America/Monterrey',
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 10 },
        { method: 'email', minutes: 60 },
      ],
    },
  }), {
    id: 'event-123',
    deleteId: 'event-123',
    title: 'Examen de Redes',
    startDateTime: '2026-07-14T17:00:00-06:00',
    startDate: '',
    timeZone: 'America/Monterrey',
    htmlLink: 'https://calendar.google.com/calendar/event?eid=abc',
    eventType: 'default',
    reminders: [10, 60],
    useDefaultReminders: false,
    creatorSelf: true,
    organizerSelf: true,
    recurringEventId: '',
    recurring: false,
    recurrence: null,
  });
});

test('normaliza eventos de día completo y valores opcionales', () => {
  assert.deepEqual(normalizeCalendarEvent({
    id: 'all-day',
    start: { date: '2026-07-20' },
    reminders: { useDefault: true },
  }), {
    id: 'all-day',
    deleteId: 'all-day',
    title: 'Sin título',
    startDateTime: '',
    startDate: '2026-07-20',
    timeZone: '',
    htmlLink: '',
    eventType: 'default',
    reminders: [],
    useDefaultReminders: true,
    creatorSelf: false,
    organizerSelf: false,
    recurringEventId: '',
    recurring: false,
    recurrence: null,
  });
});

test('extrae frecuencia e intervalo de una regla recurrente', () => {
  assert.deepEqual(parseRecurrenceRule(['RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO']), {
    frequency: 'weekly',
    interval: 2,
  });
  assert.deepEqual(parseRecurrenceRule(['RRULE:FREQ=YEARLY']), {
    frequency: 'yearly',
    interval: 1,
  });
  assert.equal(parseRecurrenceRule([]), null);
});

test('muestra solo eventos futuros creados por el usuario y colapsa recurrencias', () => {
  const now = Date.parse('2026-07-12T18:00:00Z');
  const recurring = (id, start, end) => ({
    id,
    recurringEventId: 'series-weekly',
    summary: 'Clase de inglés',
    eventType: 'default',
    creator: { self: true },
    start: { dateTime: start },
    end: { dateTime: end },
    reminders: { useDefault: true },
  });
  const events = [
    {
      id: 'birthday',
      summary: 'Happy birthday!',
      eventType: 'birthday',
      creator: { self: true },
      start: { date: '2026-11-02' },
      end: { date: '2026-11-03' },
    },
    {
      id: 'invite',
      summary: 'Reunión de otra persona',
      eventType: 'default',
      creator: { self: false },
      start: { dateTime: '2026-07-20T10:00:00Z' },
      end: { dateTime: '2026-07-20T11:00:00Z' },
    },
    {
      id: 'past',
      summary: 'Evento pasado',
      eventType: 'default',
      creator: { self: true },
      start: { dateTime: '2026-07-12T15:00:00Z' },
      end: { dateTime: '2026-07-12T16:00:00Z' },
    },
    recurring('series-instance-1', '2026-07-13T15:00:00Z', '2026-07-13T16:00:00Z'),
    recurring('series-instance-2', '2026-07-20T15:00:00Z', '2026-07-20T16:00:00Z'),
    {
      id: 'exam-1',
      summary: 'Examen de Redes',
      eventType: 'default',
      creator: { self: true },
      start: { dateTime: '2026-07-15T23:00:00Z' },
      end: { dateTime: '2026-07-16T00:00:00Z' },
    },
    {
      id: 'exam-duplicate',
      summary: '  EXAMEN   DE REDES ',
      eventType: 'default',
      creator: { self: true },
      start: { dateTime: '2026-07-15T23:00:00Z' },
      end: { dateTime: '2026-07-16T00:00:00Z' },
    },
  ];
  const recurrenceById = new Map([
    ['series-weekly', { frequency: 'weekly', interval: 1 }],
  ]);

  const result = selectUpcomingOwnedEvents(events, recurrenceById, now);

  assert.equal(result.length, 2);
  assert.equal(result[0].id, 'series-instance-1');
  assert.equal(result[0].deleteId, 'series-weekly');
  assert.equal(result[0].recurring, true);
  assert.deepEqual(result[0].recurrence, { frequency: 'weekly', interval: 1 });
  assert.equal(result[1].id, 'exam-1');
  assert.equal(result.some((event) => event.title === 'Happy birthday!'), false);
  assert.equal(result.some((event) => event.title === 'Evento pasado'), false);
});

test('normaliza título y fecha de inicio para detectar contenido duplicado', () => {
  const first = {
    summary: ' Examen   de Redes ',
    start: { dateTime: '2026-07-15T17:00:00-06:00' },
  };
  const second = {
    summary: 'EXAMEN DE REDES',
    start: { dateTime: '2026-07-15T23:00:00Z' },
  };
  assert.equal(eventContentKey(first), eventContentKey(second));
});