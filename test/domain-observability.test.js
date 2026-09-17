'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

test('las URLs públicas usan calendaria.dev y no el dominio de Render', () => {
  const files = [
    'README.md',
    'public/index.html',
    'public/welcome.html',
    'public/privacy.html',
    'render.yaml',
    'scripts/patch-open-graph.js',
  ];

  for (const file of files) {
    const content = read(file);
    assert.doesNotMatch(content, /https:\/\/calendaria\.onrender\.com/);
  }

  assert.match(read('render.yaml'), /APP_BASE_URL[\s\S]*https:\/\/calendaria\.dev/);
  assert.match(read('public/index.html'), /rel="canonical" href="https:\/\/calendaria\.dev\/"/);
  assert.match(read('public/welcome.html'), /rel="canonical" href="https:\/\/calendaria\.dev\/welcome"/);
  assert.match(read('public/privacy.html'), /rel="canonical" href="https:\/\/calendaria\.dev\/privacy\.html"/);
});

test('Sentry permanece opcional, privado por defecto y aislado del arranque principal', () => {
  const instrument = read('instrument.js');
  const browser = read('public/js/sentry-client.js');
  const server = read('server.js');
  const render = read('render.yaml');

  assert.match(instrument, /const enabled = Boolean\(dsn\)/);
  assert.match(instrument, /sendDefaultPii:\s*false/);
  assert.match(instrument, /delete event\.request\.data/);
  assert.match(instrument, /authorization/);
  assert.match(instrument, /SENTRY_TRACES_SAMPLE_RATE/);

  assert.match(browser, /maskAllText:\s*true/);
  assert.match(browser, /maskAllInputs:\s*true/);
  assert.match(browser, /blockAllMedia:\s*true/);
  assert.match(browser, /sendDefaultPii:\s*false/);
  assert.match(browser, /Observability must never prevent CalendarIA from loading/);

  assert.match(server, /require\('\.\/instrument'\)/);
  assert.match(server, /\/api\/observability\/config/);
  assert.match(server, /browser\.sentry-cdn\.com/);
  assert.match(server, /setupExpressErrorHandler/);

  assert.match(render, /SENTRY_DSN/);
  assert.match(render, /SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE[\s\S]*"1\.0"/);
});
