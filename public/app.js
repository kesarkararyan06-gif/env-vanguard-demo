'use strict';

// ── Presets ───────────────────────────────────────────────────────────────────
const PRESETS = {
  valid: {
    schema: {
      PORT:         { type: 'number',  required: false, default: 3000, description: 'HTTP server port' },
      NODE_ENV:     { type: 'enum',    values: ['development', 'production', 'test'], description: 'Runtime environment' },
      DATABASE_URL: { type: 'string',  description: 'PostgreSQL connection URL', example: 'postgres://user:pass@localhost/db' },
      DEBUG:        { type: 'boolean', required: false, default: false, description: 'Enable verbose logging' },
      APP_SECRET:   { type: 'string',  description: 'Secret key for signing sessions' }
    },
    env: 'PORT=8080\nNODE_ENV=production\nDATABASE_URL=postgres://user:pass@db.example.com/prod\nDEBUG=false\nAPP_SECRET=supersecretkey42',
    strict: false
  },
  missing: {
    schema: {
      DATABASE_URL: { type: 'string',  description: 'PostgreSQL connection URL' },
      API_KEY:      { type: 'string',  description: 'Third-party API key' },
      NODE_ENV:     { type: 'enum',    values: ['development', 'production', 'test'] }
    },
    env: 'NODE_ENV=development',
    strict: false
  },
  'wrong-types': {
    schema: {
      PORT:         { type: 'number',  description: 'HTTP port' },
      DEBUG:        { type: 'boolean', description: 'Enable debug mode' },
      MAX_RETRIES:  { type: 'number',  required: false, default: 3 }
    },
    env: 'PORT=not-a-number\nDEBUG=maybe\nMAX_RETRIES=five',
    strict: false
  },
  'bad-enum': {
    schema: {
      LOG_LEVEL:  { type: 'enum', values: ['debug', 'info', 'warn', 'error'], description: 'Logging level' },
      NODE_ENV:   { type: 'enum', values: ['development', 'production', 'test'], description: 'Runtime environment' }
    },
    env: 'LOG_LEVEL=verbose\nNODE_ENV=prod',
    strict: false
  },
  strict: {
    schema: {
      PORT:     { type: 'number',  required: false, default: 3000 },
      NODE_ENV: { type: 'enum',    values: ['development', 'production', 'test'] }
    },
    env: 'PORT=4000\nNODE_ENV=development\nUNDECLARED_VAR=oops\nANOTHER_EXTRA=bad',
    strict: true
  }
};

// ── DOM refs ──────────────────────────────────────────────────────────────────
const schemaEditor  = document.getElementById('schema-editor');
const envEditor     = document.getElementById('env-editor');
const strictMode    = document.getElementById('strict-mode');
const validateBtn   = document.getElementById('validate-btn');
const exampleBtn    = document.getElementById('example-btn');
const resultPanel   = document.getElementById('result-panel');
const pkgVersion    = document.getElementById('pkg-version');

// ── Load package version ──────────────────────────────────────────────────────
fetch('/api/meta')
  .then(r => r.json())
  .then(d => { pkgVersion.textContent = `v${d.version}`; })
  .catch(() => { pkgVersion.textContent = 'v?'; });

// ── Preset loader ─────────────────────────────────────────────────────────────
document.querySelectorAll('.preset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const p = PRESETS[btn.dataset.preset];
    if (!p) return;
    schemaEditor.value = JSON.stringify(p.schema, null, 2);
    envEditor.value    = typeof p.env === 'string' ? p.env : JSON.stringify(p.env, null, 2);
    strictMode.checked = p.strict;
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    clearResult();
  });
});

// Load "valid" preset by default
document.querySelector('[data-preset="valid"]').click();

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseSchema() {
  try {
    return { ok: true, value: JSON.parse(schemaEditor.value) };
  } catch (e) {
    return { ok: false, error: 'Schema is not valid JSON: ' + e.message };
  }
}

function setLoading(btn, loading) {
  btn.disabled = loading;
  if (loading) {
    btn._origHTML = btn.innerHTML;
    btn.innerHTML = `<span class="spinner"></span> Working…`;
  } else if (btn._origHTML) {
    btn.innerHTML = btn._origHTML;
  }
}

function clearResult() {
  resultPanel.innerHTML = `
    <div class="result-placeholder">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <p>Results will appear here after you click <strong>Validate</strong> or <strong>Generate .env.example</strong>.</p>
    </div>`;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Validate ──────────────────────────────────────────────────────────────────
validateBtn.addEventListener('click', async () => {
  const parsed = parseSchema();
  if (!parsed.ok) {
    showParseError(parsed.error);
    return;
  }
  setLoading(validateBtn, true);
  try {
    const res = await fetch('/api/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schema: parsed.value,
        envInput: envEditor.value,
        strict: strictMode.checked
      })
    });
    const data = await res.json();
    renderValidateResult(data);
  } catch (e) {
    showNetworkError(e);
  } finally {
    setLoading(validateBtn, false);
  }
});

function renderValidateResult(data) {
  if (data.type === 'success') {
    const entries = Object.entries(data.result);
    const rows = entries.map(([k, v]) => {
      const vtype = typeof v;
      return `<tr>
        <td>${escHtml(k)}</td>
        <td class="type-${vtype}">${escHtml(JSON.stringify(v))}</td>
        <td>${escHtml(vtype)}</td>
      </tr>`;
    }).join('');
    resultPanel.innerHTML = `
      <div class="result-success">
        <div class="result-header"><span class="icon">✅</span> Validation passed — ${entries.length} variable${entries.length !== 1 ? 's' : ''} coerced</div>
        <table class="coerced-table">
          <thead><tr><th>Variable</th><th>Coerced value</th><th>Type</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  } else if (data.type === 'validation_error') {
    const items = data.errors.map((e, i) => `
      <li class="error-item">
        <span class="err-num">${i + 1}</span>
        <span>${escHtml(e)}</span>
      </li>`).join('');
    resultPanel.innerHTML = `
      <div class="result-error">
        <div class="result-header"><span class="icon">❌</span> EnvValidationError — ${data.errors.length} error${data.errors.length !== 1 ? 's' : ''} found</div>
        <ul class="error-list">${items}</ul>
      </div>`;
  } else if (data.type === 'schema_error') {
    resultPanel.innerHTML = `
      <div class="result-schema-error">
        <div class="result-header"><span class="icon">⚠️</span> SchemaError — invalid schema</div>
        <div class="schema-error-box">${escHtml(data.message)}</div>
      </div>`;
  } else {
    resultPanel.innerHTML = `
      <div class="result-error">
        <div class="result-header"><span class="icon">🔥</span> Server error</div>
        <div class="schema-error-box">${escHtml(data.message || 'Unknown error')}</div>
      </div>`;
  }
}

// ── Generate .env.example ─────────────────────────────────────────────────────
exampleBtn.addEventListener('click', async () => {
  const parsed = parseSchema();
  if (!parsed.ok) {
    showParseError(parsed.error);
    return;
  }
  setLoading(exampleBtn, true);
  try {
    const res = await fetch('/api/example', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schema: parsed.value })
    });
    const data = await res.json();
    renderExampleResult(data);
  } catch (e) {
    showNetworkError(e);
  } finally {
    setLoading(exampleBtn, false);
  }
});

function renderExampleResult(data) {
  if (data.type === 'success') {
    resultPanel.innerHTML = `
      <div class="result-example">
        <div class="result-header"><span class="icon">📄</span> Generated .env.example</div>
        <div class="example-output-wrap">
          <button class="copy-btn" id="copy-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13">
              <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
            </svg>
            Copy
          </button>
          <pre class="example-output" id="example-content">${escHtml(data.content)}</pre>
        </div>
      </div>`;
    document.getElementById('copy-btn').addEventListener('click', () => {
      navigator.clipboard.writeText(data.content).then(() => {
        const btn = document.getElementById('copy-btn');
        btn.textContent = '✓ Copied!';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copy`;
          btn.classList.remove('copied');
        }, 2000);
      });
    });
  } else if (data.type === 'schema_error') {
    resultPanel.innerHTML = `
      <div class="result-schema-error">
        <div class="result-header"><span class="icon">⚠️</span> SchemaError</div>
        <div class="schema-error-box">${escHtml(data.message)}</div>
      </div>`;
  } else {
    resultPanel.innerHTML = `
      <div class="result-error">
        <div class="result-header"><span class="icon">🔥</span> Error</div>
        <div class="schema-error-box">${escHtml(data.message || 'Unknown error')}</div>
      </div>`;
  }
}

// ── Error helpers ─────────────────────────────────────────────────────────────
function showParseError(msg) {
  resultPanel.innerHTML = `
    <div class="result-schema-error">
      <div class="result-header"><span class="icon">⚠️</span> JSON parse error</div>
      <div class="schema-error-box">${escHtml(msg)}</div>
    </div>`;
}
function showNetworkError(e) {
  resultPanel.innerHTML = `
    <div class="result-error">
      <div class="result-header"><span class="icon">🔌</span> Network error</div>
      <div class="schema-error-box">${escHtml(e.message)}</div>
    </div>`;
}
