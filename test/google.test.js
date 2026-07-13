'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeCalendarEvent } = require('../src/services/google');

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
  });
});

test('normaliza eventos de día completo y valores opcionales', () => {
  assert.deepEqual(normalizeCalendarEvent({
    id: 'all-day',
    start: { date: '2026-07-20' },
    reminders: { useDefault: true },
  }), {
    id: 'all-day',
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
  });
});
