'use strict';

const auth = require('./google/auth');
const events = require('./google/events');
const shape = require('./google/shape');

module.exports = {
  ...auth,
  ...events,
  ...shape,
};
