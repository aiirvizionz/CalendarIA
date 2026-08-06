'use strict';

const { CATEGORY_META, addDaysToDate, addMinutesToLocalDateTime } = require('../../lib/event');

function normalizeTitle(value) {
  return String(value || '').replace(/[\u0000-\u001F\u007F]/g, ' ').normalize('NFKC').toLocaleLowerCase('es-MX').replace(/\s+/g, ' ').trim();
}

function recurrenceToRRule(recurrence, allDay = false) {
  if (!recurrence?.frequency || recurrence.frequency === 'none') return null;
  const freq = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY', yearly: 'YEARLY' }[recurrence.frequency];
  if (!freq) return null;
  const parts = [`FREQ=${freq}`, `INTERVAL=${recurrence.interval || 1}`];
  if (recurrence.frequency === 'weekly' && recurrence.daysOfWeek?.length) parts.push(`BYDAY=${recurrence.daysOfWeek.join(',')}`);
  if (recurrence.until) {
    const compact = recurrence.until.replaceAll('-', '');
    parts.push(`UNTIL=${allDay ? compact : `${compact}T235959Z`}`);
  } else if (recurrence.count) parts.push(`COUNT=${recurrence.count}`);
  return `RRULE:${parts.join(';')}`;
}

function buildCalendarEvent(event, timeZone, proposalId = '') {
  const duration = Number.isInteger(event.durationMinutes) ? event.durationMinutes : event.allDay ? 1440 : 60;
  const reminders = Array.isArray(event.reminders) && event.reminders.length ? event.reminders : [10];
  const category = CATEGORY_META[event.category] || CATEGORY_META.otro;
  const body = {
    summary: event.title,
    location: event.location || undefined,
    description: event.description || undefined,
    colorId: event.googleColorId || category.googleColorId,
    reminders: { useDefault: false, overrides: reminders.map((minutes) => ({ method: 'popup', minutes })) },
    extendedProperties: { private: { source: 'calendaria', version: '3', category: event.category || 'otro', ...(proposalId ? { proposalId } : {}) } },
  };
  if (event.allDay) {
    body.start = { date: event.date };
    body.end = { date: addDaysToDate(event.date, Math.max(1, Math.round(duration / 1440))) };
  } else {
    const end = addMinutesToLocalDateTime(event.date, event.time, duration);
    body.start = { dateTime: `${event.date}T${event.time}:00`, timeZone };
    body.end = { dateTime: `${end.date}T${end.time}:00`, timeZone };
  }
  const rule = recurrenceToRRule(event.recurrence, event.allDay);
  if (rule) body.recurrence = [rule];
  return body;
}

function parseRecurrenceRule(lines) {
  const rrule = Array.isArray(lines) ? lines.find((line) => typeof line === 'string' && line.startsWith('RRULE:')) : null;
  if (!rrule) return null;
  const fields = Object.fromEntries(rrule.slice(6).split(';').map((part) => part.split('=', 2)).filter(([key, value]) => key && value));
  const frequency = { DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly', YEARLY: 'yearly' }[fields.FREQ] || 'custom';
  const interval = Number.parseInt(fields.INTERVAL || '1', 10);
  const until = /^\d{8}/.test(fields.UNTIL || '') ? `${fields.UNTIL.slice(0, 4)}-${fields.UNTIL.slice(4, 6)}-${fields.UNTIL.slice(6, 8)}` : null;
  return { frequency, interval: Number.isInteger(interval) && interval > 0 ? interval : 1, daysOfWeek: fields.BYDAY ? fields.BYDAY.split(',') : [], until, count: Number.parseInt(fields.COUNT || '0', 10) || null };
}

function ts(value, fallback) { const parsed = Date.parse(value || ''); return Number.isFinite(parsed) ? parsed : fallback; }
function startTimestamp(event) { return event?.start?.dateTime ? ts(event.start.dateTime, Number.MAX_SAFE_INTEGER) : event?.start?.date ? ts(`${event.start.date}T00:00:00Z`, Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER; }
function endTimestamp(event) { return event?.end?.dateTime ? ts(event.end.dateTime, Number.MIN_SAFE_INTEGER) : event?.end?.date ? ts(`${event.end.date}T00:00:00Z`, Number.MIN_SAFE_INTEGER) : startTimestamp(event); }
function eventContentKey(event) { return `${normalizeTitle(event?.summary)}|${event?.start?.dateTime ? `time:${new Date(ts(event.start.dateTime, 0)).toISOString()}` : `date:${event?.start?.date || 'unknown'}`}`; }

function normalizeCalendarEvent(event, recurrence = null) {
  const start = event?.start || {}; const end = event?.end || {}; const privateProps = event?.extendedProperties?.private || {};
  const category = CATEGORY_META[privateProps.category] ? privateProps.category : 'otro';
  const recurringEventId = typeof event?.recurringEventId === 'string' ? event.recurringEventId : '';
  const seriesId = recurringEventId || (Array.isArray(event?.recurrence) && event.recurrence.length ? String(event?.id || '') : '');
  const reminders = Array.isArray(event?.reminders?.overrides) ? event.reminders.overrides.map((item) => Number(item?.minutes)).filter(Number.isInteger) : [];
  const durationMinutes = start.date && end.date ? Math.max(1, Math.round((Date.parse(`${end.date}T00:00:00Z`) - Date.parse(`${start.date}T00:00:00Z`)) / 60000)) : Math.max(1, Math.round((ts(end.dateTime, 0) - ts(start.dateTime, 0)) / 60000)) || 60;
  return {
    id: String(event?.id || ''), deleteId: recurringEventId || String(event?.id || ''), seriesId,
    title: String(event?.summary || 'Sin título').replace(/\s+/g, ' ').trim(), startDateTime: start.dateTime || '', startDate: start.date || '', timeZone: start.timeZone || '',
    allDay: Boolean(start.date && !start.dateTime), durationMinutes, location: String(event?.location || ''), description: String(event?.description || ''), htmlLink: event?.htmlLink || '', eventType: event?.eventType || 'default',
    reminders, useDefaultReminders: Boolean(event?.reminders?.useDefault), creatorSelf: Boolean(event?.creator?.self), organizerSelf: Boolean(event?.organizer?.self), recurringEventId,
    recurring: Boolean(seriesId), recurrence: seriesId ? recurrence || parseRecurrenceRule(event?.recurrence) || { frequency: 'custom', interval: 1, daysOfWeek: [], until: null, count: null } : null,
    category, categoryColor: CATEGORY_META[category].uiColor, googleColorId: String(event?.colorId || CATEGORY_META[category].googleColorId), createdByCalendarIA: privateProps.source === 'calendaria',
  };
}

function selectUpcomingOwnedEvents(expandedEvents, recurrenceById = new Map(), nowMs = Date.now()) {
  const sorted = [...(Array.isArray(expandedEvents) ? expandedEvents : [])].filter((event) => event?.status !== 'cancelled' && event?.id && (event.eventType || 'default') === 'default' && event?.creator?.self === true && endTimestamp(event) > nowMs).sort((a, b) => startTimestamp(a) - startTimestamp(b));
  const output = []; const seenSeries = new Set(); const seenContent = new Set();
  for (const event of sorted) {
    const seriesId = typeof event.recurringEventId === 'string' ? event.recurringEventId : '';
    if (seriesId && seenSeries.has(seriesId)) continue;
    const key = eventContentKey(event); if (seenContent.has(key)) continue;
    if (seriesId) seenSeries.add(seriesId); seenContent.add(key);
    output.push(normalizeCalendarEvent(event, seriesId ? recurrenceById.get(seriesId) || null : null));
  }
  return output;
}

module.exports = { buildCalendarEvent, eventContentKey, normalizeCalendarEvent, normalizeTitle, parseRecurrenceRule, recurrenceToRRule, selectUpcomingOwnedEvents };
