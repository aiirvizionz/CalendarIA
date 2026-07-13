'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function startServer(env) {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });

  return { child, output: () => ({ stdout, stderr }) };
}

async function waitForServer(processState, timeoutMs = 8000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const { child, output } = processState;
    if (child.exitCode !== null) {
      const logs = output();
      throw new Error(`El servidor terminó antes de iniciar.\n${logs.stdout}\n${logs.stderr}`);
    }
    if (output().stdout.includes('"event":"server_started"')) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('El servidor no inició dentro del tiempo esperado');
}

test('producción inicia sin proveedores externos y reporta estado degradado', async (t) => {
  const port = 41000 + Math.floor(Math.random() * 10000);
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(port),
    APP_BASE_URL: `http://127.0.0.1:${port}`,
    SESSION_SECRET: 'test-session-secret-with-more-than-32-bytes-123456',
  };

  delete env.GEMINI_API_KEY;
  delete env.GOOGLE_API_KEY;
  delete env.API_KEY_GEMINI;
  delete env.GOOGLE_OAUTH_CLIENT_ID;
  delete env.GOOGLE_AUTH_API_KEY;
  delete env.GOOGLE_OAUTH_CLIENT_SECRET;

  const processState = startServer(env);
  t.after(() => {
    if (processState.child.exitCode === null) processState.child.kill('SIGTERM');
  });

  await waitForServer(processState);

  const response = await fetch(`http://127.0.0.1:${port}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    service: 'calendaria',
    integrations: {
      gemini: false,
      google: false,
    },
  });
});

test('acepta temporalmente los nombres históricos de Gemini y Google Client ID', () => {
  const code = `
    const config = require('./src/config');
    process.stdout.write(JSON.stringify({
      geminiApiKey: config.geminiApiKey,
      googleClientId: config.googleClientId,
      integrations: config.integrations,
    }));
  `;

  const child = spawn(process.execPath, ['-e', code], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      SESSION_SECRET: 'test-session-secret-with-more-than-32-bytes-123456',
      API_KEY_GEMINI: 'legacy-gemini-key',
      GOOGLE_AUTH_API_KEY: 'legacy-google-client-id',
      GOOGLE_OAUTH_CLIENT_SECRET: 'google-client-secret',
      GEMINI_API_KEY: '',
      GOOGLE_API_KEY: '',
      GOOGLE_OAUTH_CLIENT_ID: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });

  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (codeValue) => {
      try {
        assert.equal(codeValue, 0, stderr);
        assert.deepEqual(JSON.parse(stdout), {
          geminiApiKey: 'legacy-gemini-key',
          googleClientId: 'legacy-google-client-id',
          integrations: {
            gemini: true,
            google: true,
          },
        });
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
});

test('acepta GOOGLE_API_KEY como alias oficial de Gemini', () => {
  const code = `
    const config = require('./src/config');
    process.stdout.write(config.geminiApiKey);
  `;

  const child = spawn(process.execPath, ['-e', code], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      SESSION_SECRET: 'test-session-secret-with-more-than-32-bytes-123456',
      GEMINI_API_KEY: '',
      GOOGLE_API_KEY: 'official-google-api-key-alias',
      API_KEY_GEMINI: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });

  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (codeValue) => {
      try {
        assert.equal(codeValue, 0, stderr);
        assert.equal(stdout, 'official-google-api-key-alias');
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
});
