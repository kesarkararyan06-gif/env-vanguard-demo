'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

// Start the server on a random port for testing
let server;
let baseUrl;

before(async () => {
  const app = require('../server');
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

// ── Helper ────────────────────────────────────────────────────────────────────
async function post(path, body) {
  const data = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const req = http.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, (res) => {
      let raw = '';
      res.on('data', c => (raw += c));
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(raw) }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function get(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    http.get(url, (res) => {
      let raw = '';
      res.on('data', c => (raw += c));
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(raw) }));
    }).on('error', reject);
  });
}

// ── /api/meta ─────────────────────────────────────────────────────────────────
test('GET /api/meta returns package version', async () => {
  const { status, body } = await get('/api/meta');
  assert.equal(status, 200);
  assert.ok(typeof body.version === 'string', 'version should be a string');
  assert.match(body.version, /^\d+\.\d+\.\d+/, 'version should be semver');
});

// ── /api/validate — success path ──────────────────────────────────────────────
test('POST /api/validate returns coerced values on valid env', async () => {
  const schema = {
    PORT:     { type: 'number',  required: false, default: 3000 },
    NODE_ENV: { type: 'enum',    values: ['development', 'production', 'test'] },
    DEBUG:    { type: 'boolean', required: false, default: false }
  };
  const envInput = 'PORT=8080\nNODE_ENV=production\nDEBUG=true';

  const { status, body } = await post('/api/validate', { schema, envInput, strict: false });
  assert.equal(status, 200);
  assert.equal(body.type, 'success');
  assert.equal(body.result.PORT, 8080);
  assert.equal(body.result.NODE_ENV, 'production');
  assert.equal(body.result.DEBUG, true);
});

// ── /api/validate — missing required vars ─────────────────────────────────────
test('POST /api/validate aggregates multiple errors for missing required vars', async () => {
  const schema = {
    DATABASE_URL: { type: 'string' },
    API_KEY:      { type: 'string' },
    NODE_ENV:     { type: 'enum', values: ['development', 'production', 'test'] }
  };
  const envInput = 'NODE_ENV=development';

  const { status, body } = await post('/api/validate', { schema, envInput });
  assert.equal(status, 200);
  assert.equal(body.type, 'validation_error');
  assert.ok(Array.isArray(body.errors), 'errors should be an array');
  assert.equal(body.errors.length, 2, 'should report both missing vars at once');
  assert.ok(body.errors.some(e => e.includes('DATABASE_URL')));
  assert.ok(body.errors.some(e => e.includes('API_KEY')));
});

// ── /api/validate — wrong types ───────────────────────────────────────────────
test('POST /api/validate catches wrong types', async () => {
  const schema = {
    PORT:  { type: 'number' },
    DEBUG: { type: 'boolean' }
  };
  const envInput = 'PORT=not-a-number\nDEBUG=maybe';

  const { status, body } = await post('/api/validate', { schema, envInput });
  assert.equal(status, 200);
  assert.equal(body.type, 'validation_error');
  assert.equal(body.errors.length, 2);
});

// ── /api/validate — invalid enum ──────────────────────────────────────────────
test('POST /api/validate catches invalid enum value', async () => {
  const schema = {
    LOG_LEVEL: { type: 'enum', values: ['debug', 'info', 'warn', 'error'] }
  };
  const envInput = 'LOG_LEVEL=verbose';

  const { status, body } = await post('/api/validate', { schema, envInput });
  assert.equal(status, 200);
  assert.equal(body.type, 'validation_error');
  assert.ok(body.errors[0].includes('LOG_LEVEL'));
});

// ── /api/validate — strict mode ───────────────────────────────────────────────
test('POST /api/validate strict mode rejects undeclared vars', async () => {
  const schema = {
    PORT: { type: 'number', required: false, default: 3000 }
  };
  const envInput = 'PORT=4000\nUNDECLARED=bad';

  const { status, body } = await post('/api/validate', { schema, envInput, strict: true });
  assert.equal(status, 200);
  assert.equal(body.type, 'validation_error');
  assert.ok(body.errors.some(e => e.includes('UNDECLARED')));
});

// ── /api/validate — schema error ──────────────────────────────────────────────
test('POST /api/validate returns schema_error for bad schema', async () => {
  const schema = {
    LOG_LEVEL: { type: 'enum' }  // missing values array
  };
  const { status, body } = await post('/api/validate', { schema, envInput: '' });
  assert.equal(status, 200);
  assert.equal(body.type, 'schema_error');
  assert.ok(typeof body.message === 'string');
});

// ── /api/example — success ────────────────────────────────────────────────────
test('POST /api/example generates .env.example content', async () => {
  const schema = {
    PORT:         { type: 'number',  required: false, default: 3000, description: 'HTTP port' },
    DATABASE_URL: { type: 'string',  description: 'DB URL', example: 'postgres://localhost/db' },
    NODE_ENV:     { type: 'enum',    values: ['development', 'production', 'test'] }
  };

  const { status, body } = await post('/api/example', { schema });
  assert.equal(status, 200);
  assert.equal(body.type, 'success');
  assert.ok(typeof body.content === 'string');
  assert.ok(body.content.includes('PORT='));
  assert.ok(body.content.includes('DATABASE_URL='));
  assert.ok(body.content.includes('NODE_ENV='));
  assert.ok(body.content.includes('generated by env-vanguard'));
});

// ── /api/example — schema error ───────────────────────────────────────────────
test('POST /api/example returns schema_error for bad schema', async () => {
  const schema = { FOO: { type: 'enum' } };  // missing values
  const { status, body } = await post('/api/example', { schema });
  assert.equal(status, 200);
  assert.equal(body.type, 'schema_error');
});

// ── input size limit ──────────────────────────────────────────────────────────
test('POST /api/validate rejects body over 100kb', async () => {
  const bigString = 'x'.repeat(120 * 1024);
  // We expect Express to return 413
  const { status } = await post('/api/validate', { schema: {}, envInput: bigString });
  assert.equal(status, 413);
});
