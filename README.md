# env-vanguard-demo

> **Live playground** for [`@aryankesarkar/env-vanguard`](https://www.npmjs.com/package/@aryankesarkar/env-vanguard) — a zero-dependency environment variable validator.

🚀 **Live URL:** _To be updated after deployment_

---

## What is this?

A small web app ("env-vanguard playground") that lets you interactively test the `@aryankesarkar/env-vanguard` npm package in your browser:

- **Schema editor** — define what env vars are expected (types, required, defaults, enum values)
- **Environment editor** — enter `KEY=VALUE` lines or a JSON object to test
- **Validate** — calls `validate(schema, { env })` from the package; shows all coerced values on success, or **every error at once** on failure (error aggregation is the killer feature)
- **Strict mode** — toggle strict option to reject undeclared variables
- **Generate .env.example** — calls `generateExample(schema)` and displays the output with a copy button
- **5 preset examples** — valid env, missing required, wrong types, invalid enum, strict mode
- **Package version** shown in header with links to npm and GitHub

## How the package is installed and used

```bash
npm install @aryankesarkar/env-vanguard
```

```js
const { validate, generateExample, EnvValidationError, SchemaError } = require('@aryankesarkar/env-vanguard');

// Validate — returns frozen object of coerced values, or throws
const env = validate(
  {
    PORT:         { type: 'number',  required: false, default: 3000 },
    NODE_ENV:     { type: 'enum',    values: ['development', 'production', 'test'] },
    DATABASE_URL: { type: 'string',  description: 'PostgreSQL connection URL' },
    DEBUG:        { type: 'boolean', required: false, default: false },
  },
  { env: process.env, strict: false }   // validates process.env by default
);

console.log(env.PORT);     // 3000  (number)
console.log(env.DEBUG);    // false (boolean)

// Generate .env.example
const content = generateExample(schema);
fs.writeFileSync('.env.example', content);
```

The backend (`server.js`) calls `validate()` and `generateExample()` on every POST request and returns the result to the frontend.

## Run locally

```bash
git clone https://github.com/kesarkararyan06-gif/env-vanguard-demo.git
cd env-vanguard-demo
npm install
npm start
# → http://localhost:3000
```

## Run tests

```bash
npm test
```

Tests use Node's built-in test runner (`node:test`) and cover:
- Valid env → coerced result
- Multiple missing required variables (error aggregation)
- Wrong types (number, boolean)
- Invalid enum value
- Strict mode (undeclared var rejection)
- Schema errors
- .env.example generation
- 100 KB input size limit

## Links

| | |
|---|---|
| npm package | https://www.npmjs.com/package/@aryankesarkar/env-vanguard |
| Package source | https://github.com/kesarkararyan06-gif/env-vanguard |
| Demo source | https://github.com/kesarkararyan06-gif/env-vanguard-demo |
| Author | [Aryan Kesarkar](https://github.com/kesarkararyan06-gif) |

## License

MIT
