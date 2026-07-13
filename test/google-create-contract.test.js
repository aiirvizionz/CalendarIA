'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createCalendarEvent } = require('../src/services/google');

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    async text() {
      return JSON.stringify(payload);
    },
  };
}

const event = {
  title: 'Examen de Redes',
  date: '2026-07-15',
  time: '17:00',
  category: 'examen',
  reminders: [10, 60],
};

const timeZone = 'America/Mexico_City';

test('devuelve { event, duplicate: false } cuando Google crea un evento', async (t) => {
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });

  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method || 'GET' });
    if (calls.length === 1) return jsonResponse({ items: [] });
    if (calls.length === 2) {
      return jsonResponse({
        id: 'google-created-123',
        htmlLink: 'https://calendar.google.com/event?eid=created',
      }, 200);
    }
    throw new Error('Unexpected fetch call');
  };

  const result = await createCalendarEvent('access-token', event, timeZone);

  assert.equal(result.duplicate, false);
  assert.equal(result.event.id, 'google-created-123');
  assert.equal(result.event.htmlLink, 'https://calendar.google.com/event?eid=created');
  assert.deepEqual(calls.map((call) => call.method), ['GET', 'POST']);
});

test('devuelve { event, duplicate: true } y evita POST cuando el evento ya existe', async (t) => {
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });

  const existing = {
    id: 'google-existing-456',
    summary: ' EXAMEN   DE REDES ',
    eventType: 'default',
    creator: { self: true },
    start: { dateTime: '2026-07-15T17:00:00-06:00' },
    htmlLink: 'https://calendar.google.com/event?eid=existing',
  };

  let calls = 0;
  global.fetch = async (_url, options = {}) => {
    calls += 1;
    assert.equal(options.method || 'GET', 'GET');
    return jsonResponse({ items: [existing] });
  };

  const result = await createCalendarEvent('access-token', event, timeZone);

  assert.equal(result.duplicate, true);
  assert.equal(result.event.id, 'google-existing-456');
  assert.equal(result.event.htmlLink, 'https://calendar.google.com/event?eid=existing');
  assert.equal(calls, 1);
});
