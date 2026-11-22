'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const { validate, generateExample, EnvValidationError, SchemaError } = require('@aryankesarkar/env-vanguard');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Read installed package version ───────────────────────────────────────────
let pkgVersion = 'unknown';
try {
  const pkgPath = require.resolve('@aryankesarkar/env-vanguard/package.json');
  pkgVersion = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version;
} catch (_) {
  // fallback: read our own node_modules copy
  try {
    pkgVersion = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, 'node_modules/@aryankesarkar/env-vanguard/package.json'),
        'utf8'
      )
    ).version;
  } catch (__) {}
}

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Basic rate limiter (in-memory, per IP, 60 req/min)
const rateLimitMap = new Map();
function rateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  const window = 60_000;
  const max = 60;
  const entry = rateLimitMap.get(ip) || { count: 0, start: now };
  if (now - entry.start > window) {
    entry.count = 0;
    entry.start = now;
  }
  entry.count++;
  rateLimitMap.set(ip, entry);
  if (entry.count > max) {
    return res.status(429).json({ error: 'Too many requests. Please wait a minute.' });
  }
  next();
}
app.use('/api', rateLimit);

// ── Helper: parse env lines (KEY=VALUE or JSON object) ───────────────────────
function parseEnvInput(raw) {
  if (!raw || !raw.trim()) return {};
  const trimmed = raw.trim();
  // Try JSON first
  if (trimmed.startsWith('{')) {
    return JSON.parse(trimmed);
  }
  // Parse KEY=VALUE lines
  const result = {};
  for (const line of trimmed.split('\n')) {
    const stripped = line.trim();
    if (!stripped || stripped.startsWith('#')) continue;
    const eqIdx = stripped.indexOf('=');
    if (eqIdx === -1) continue;
    const key = stripped.slice(0, eqIdx).trim();
    const val = stripped.slice(eqIdx + 1).trim();
    if (key) result[key] = val;
  }
  return result;
}

// ── POST /api/validate ────────────────────────────────────────────────────────
app.post('/api/validate', (req, res) => {
  const { schema, envInput, strict } = req.body;

  if (!schema || typeof schema !== 'object') {
    return res.status(400).json({ type: 'error', message: 'schema must be a JSON object.' });
  }

  let env;
  try {
    env = typeof envInput === 'string' ? parseEnvInput(envInput) : (envInput || {});
  } catch (e) {
    return res.status(400).json({ type: 'error', message: 'Could not parse env input: ' + e.message });
  }

  try {
    const result = validate(schema, { env, strict: !!strict });
    return res.json({ type: 'success', result });
  } catch (err) {
    if (err instanceof EnvValidationError) {
      return res.json({ type: 'validation_error', errors: err.errors });
    }
    if (err instanceof SchemaError) {
      return res.json({ type: 'schema_error', message: err.message });
    }
    return res.status(500).json({ type: 'error', message: err.message });
  }
});

// ── POST /api/example ─────────────────────────────────────────────────────────
app.post('/api/example', (req, res) => {
  const { schema } = req.body;

  if (!schema || typeof schema !== 'object') {
    return res.status(400).json({ type: 'error', message: 'schema must be a JSON object.' });
  }

  try {
    const content = generateExample(schema);
    return res.json({ type: 'success', content });
  } catch (err) {
    if (err instanceof SchemaError) {
      return res.json({ type: 'schema_error', message: err.message });
    }
    return res.status(500).json({ type: 'error', message: err.message });
  }
});

// ── GET /api/meta ─────────────────────────────────────────────────────────────
app.get('/api/meta', (_req, res) => {
  res.json({ version: pkgVersion });
});

// ── Error handler (must be last middleware) ───────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ type: 'error', message: 'Request body too large (max 100 KB).' });
  }
  res.status(500).json({ type: 'error', message: err.message || 'Internal server error.' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`env-vanguard playground running on http://localhost:${PORT}`);
    console.log(`Using @aryankesarkar/env-vanguard v${pkgVersion}`);
  });
}

module.exports = app;
