'use strict';

const CATEGORIES = Object.freeze(['examen', 'estudio', 'social', 'presentacion', 'tarea', 'otro']);
const ALLOWED_REMINDERS = Object.freeze([10, 60, 360, 1440, 10080]);
const CATEGORY_SET = new Set(CATEGORIES);
const REMINDER_SET = new Set(ALLOWED_REMINDERS);
const TITLE_MAX_LENGTH = 120;

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

function normalizeTitle(value) {
  if (typeof value !== 'string') throw new ValidationError('El título debe ser texto');
  const title = value.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!title) throw new ValidationError('El título es obligatorio');
  if (title.length > TITLE_MAX_LENGTH) throw new ValidationError(`El título no puede superar ${TITLE_MAX_LENGTH} caracteres`);
  return title;
}

function normalizeReminders(value) {
  if (value == null) return [10];
  if (!Array.isArray(value)) throw new ValidationError('Los recordatorios deben enviarse como una lista');

  const reminders = [...new Set(value.map(Number))]
    .filter((minutes) => Number.isInteger(minutes) && REMINDER_SET.has(minutes))
    .sort((a, b) => a - b);

  if (!reminders.length) throw new ValidationError('Selecciona al menos un recordatorio válido');
  return reminders;
}

function validateEvent(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ValidationError('El evento es inválido');
  }

  const title = normalizeTitle(input.title);
  const date = String(input.date || '');
  const time = String(input.time || '');
  const category = String(input.category || '');

  if (!isValidDate(date)) throw new ValidationError('La fecha debe usar el formato YYYY-MM-DD y ser válida');
  if (!isValidTime(time)) throw new ValidationError('La hora debe usar el formato HH:MM entre 00:00 y 23:59');
  if (!CATEGORY_SET.has(category)) throw new ValidationError('La categoría no es válida');

  return {
    title,
    date,
    time,
    category,
    reminders: normalizeReminders(input.reminders),
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

function normalizeAiEvent(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ValidationError('La IA devolvió una estructura inválida');
  }

  return validateEvent({
    title: input.titulo,
    date: input.fecha,
    time: input.hora,
    category: input.categoria,
    reminders: [10],
  });
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
  ALLOWED_REMINDERS,
  CATEGORIES,
  ValidationError,
  addMinutesToLocalDateTime,
  isValidDate,
  isValidTime,
  normalizeAiEvent,
  validateEvent,
};
