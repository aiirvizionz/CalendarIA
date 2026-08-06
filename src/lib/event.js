'use strict';

const CATEGORY_META = Object.freeze({
  examen: Object.freeze({ label: 'Examen', googleColorId: '11', uiColor: '#dc2127' }),
  tarea: Object.freeze({ label: 'Tarea', googleColorId: '6', uiColor: '#ffb878' }),
  clase: Object.freeze({ label: 'Clase', googleColorId: '9', uiColor: '#5484ed' }),
  estudio: Object.freeze({ label: 'Estudio', googleColorId: '2', uiColor: '#7ae7bf' }),
  presentacion: Object.freeze({ label: 'Presentación', googleColorId: '5', uiColor: '#fbd75b' }),
  social: Object.freeze({ label: 'Social', googleColorId: '4', uiColor: '#ff887c' }),
  otro: Object.freeze({ label: 'Otro', googleColorId: '8', uiColor: '#e1e1e1' }),
});
const CATEGORIES = Object.freeze(Object.keys(CATEGORY_META));
const CATEGORY_SET = new Set(CATEGORIES);
const WEEKDAYS = Object.freeze(['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']);
const WEEKDAY_SET = new Set(WEEKDAYS);
const RECURRENCE_FREQUENCIES = Object.freeze(['none', 'daily', 'weekly', 'monthly', 'yearly']);
const RECURRENCE_SET = new Set(RECURRENCE_FREQUENCIES);
const TITLE_MAX_LENGTH = 120;
const LOCATION_MAX_LENGTH = 250;
const DESCRIPTION_MAX_LENGTH = 2000;
const MAX_REMINDERS = 5;
const MAX_REMINDER_MINUTES = 4 * 7 * 24 * 60;
const MIN_DURATION_MINUTES = 5;
const MAX_DURATION_MINUTES = 24 * 60;

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function isValidTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function normalizeText(value, maxLength, label, { required = false } = {}) {
  if (value == null && !required) return '';
  if (typeof value !== 'string') throw new ValidationError(`${label} debe ser texto`);
  const normalized = value
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (required && !normalized) throw new ValidationError(`${label} es obligatorio`);
  if (normalized.length > maxLength) throw new ValidationError(`${label} no puede superar ${maxLength} caracteres`);
  return normalized;
}

function normalizeTitle(value) {
  return normalizeText(value, TITLE_MAX_LENGTH, 'El título', { required: true });
}

function normalizeReminders(value) {
  if (value == null) return [10];
  if (!Array.isArray(value)) throw new ValidationError('Los recordatorios deben enviarse como una lista');

  const reminders = [...new Set(value.map(Number))]
    .filter((minutes) => Number.isInteger(minutes) && minutes >= 0 && minutes <= MAX_REMINDER_MINUTES)
    .sort((a, b) => a - b);

  if (!reminders.length) throw new ValidationError('Selecciona al menos un recordatorio válido');
  if (reminders.length > MAX_REMINDERS) throw new ValidationError(`Puedes configurar hasta ${MAX_REMINDERS} recordatorios`);
  return reminders;
}

function normalizeDuration(value, allDay = false) {
  if (allDay) return 24 * 60;
  const duration = value == null || value === '' ? 60 : Number(value);
  if (!Number.isInteger(duration) || duration < MIN_DURATION_MINUTES || duration > MAX_DURATION_MINUTES) {
    throw new ValidationError(`La duración debe estar entre ${MIN_DURATION_MINUTES} y ${MAX_DURATION_MINUTES} minutos`);
  }
  return duration;
}

function normalizeRecurrence(value, startDate) {
  if (value == null || value === false) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError('La recurrencia es inválida');
  }

  const frequency = String(value.frequency || 'none').toLowerCase();
  if (!RECURRENCE_SET.has(frequency)) throw new ValidationError('La frecuencia de recurrencia no es válida');
  if (frequency === 'none') return null;

  const interval = value.interval == null || value.interval === '' ? 1 : Number(value.interval);
  if (!Number.isInteger(interval) || interval < 1 || interval > 99) {
    throw new ValidationError('El intervalo de recurrencia debe estar entre 1 y 99');
  }

  const daysOfWeek = Array.isArray(value.daysOfWeek)
    ? [...new Set(value.daysOfWeek.map((day) => String(day).toUpperCase()).filter((day) => WEEKDAY_SET.has(day)))]
    : [];

  const until = value.until ? String(value.until) : '';
  if (until && !isValidDate(until)) throw new ValidationError('La fecha final de recurrencia no es válida');
  if (until && until < startDate) throw new ValidationError('La recurrencia no puede terminar antes de iniciar');

  const count = value.count == null || value.count === '' ? null : Number(value.count);
  if (count != null && (!Number.isInteger(count) || count < 1 || count > 999)) {
    throw new ValidationError('El número de repeticiones debe estar entre 1 y 999');
  }
  if (until && count != null) throw new ValidationError('Usa una fecha final o un número de repeticiones, no ambos');

  return {
    frequency,
    interval,
    daysOfWeek: frequency === 'weekly' ? daysOfWeek : [],
    until: until || null,
    count,
  };
}

function validateEvent(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ValidationError('El evento es inválido');
  }

  const title = normalizeTitle(input.title);
  const date = String(input.date || '');
  const allDay = Boolean(input.allDay);
  const time = allDay ? '' : String(input.time || '');
  const category = String(input.category || '');

  if (!isValidDate(date)) throw new ValidationError('La fecha debe usar el formato YYYY-MM-DD y ser válida');
  if (!allDay && !isValidTime(time)) throw new ValidationError('La hora debe usar el formato HH:MM entre 00:00 y 23:59');
  if (!CATEGORY_SET.has(category)) throw new ValidationError('La categoría no es válida');

  return {
    title,
    date,
    time,
    allDay,
    durationMinutes: normalizeDuration(input.durationMinutes, allDay),
    category,
    categoryColor: CATEGORY_META[category].uiColor,
    googleColorId: CATEGORY_META[category].googleColorId,
    location: normalizeText(input.location, LOCATION_MAX_LENGTH, 'La ubicación'),
    description: normalizeText(input.description, DESCRIPTION_MAX_LENGTH, 'La descripción'),
    reminders: normalizeReminders(input.reminders),
    recurrence: normalizeRecurrence(input.recurrence, date),
  };
}

function addMinutesToLocalDateTime(date, time, minutes) {
  if (!isValidDate(date) || !isValidTime(time) || !Number.isInteger(minutes)) {
    throw new ValidationError('No se pudo calcular la duración del evento');
  }

  const [year, month, day] = date.split('-').map(Number);
  const [hours, mins] = time.split(':').map(Number);
  const value = new Date(Date.UTC(year, month - 1, day, hours, mins + minutes));

  const pad = (number) => String(number).padStart(2, '0');
  return {
    date: `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`,
    time: `${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}`,
  };
}

function addDaysToDate(date, days) {
  if (!isValidDate(date) || !Number.isInteger(days)) throw new ValidationError('No se pudo calcular la fecha final');
  const [year, month, day] = date.split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + days));
  const pad = (number) => String(number).padStart(2, '0');
  return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
}

function normalizeAiEvent(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ValidationError('La IA devolvió una estructura inválida');
  }

  const event = validateEvent({
    title: input.titulo,
    date: input.fecha,
    time: input.hora,
    allDay: input.todoElDia,
    durationMinutes: input.duracionMinutos,
    category: input.categoria,
    location: input.ubicacion,
    description: input.descripcion,
    reminders: input.recordatoriosMinutos,
    recurrence: input.recurrencia ? {
      frequency: input.recurrencia.frequency,
      interval: input.recurrencia.interval,
      daysOfWeek: input.recurrencia.daysOfWeek,
      until: input.recurrencia.until || null,
      count: Number(input.recurrencia.count) > 0 ? Number(input.recurrencia.count) : null,
    } : null,
  });

  const assumptions = Array.isArray(input.supuestos)
    ? input.supuestos.map((value) => normalizeText(String(value), 240, 'El supuesto')).filter(Boolean).slice(0, 5)
    : [];

  return { ...event, assumptions };
}

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
    this.code = 'VALIDATION_ERROR';
  }
}

module.exports = {
  CATEGORY_META,
  CATEGORIES,
  DESCRIPTION_MAX_LENGTH,
  MAX_REMINDER_MINUTES,
  RECURRENCE_FREQUENCIES,
  ValidationError,
  WEEKDAYS,
  addDaysToDate,
  addMinutesToLocalDateTime,
  isValidDate,
  isValidTime,
  normalizeAiEvent,
  normalizeRecurrence,
  validateEvent,
};
