const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server', 'index.cjs'), 'utf8');

test('Express server contains analyzeSchema Zod validation', () => {
  assert.match(serverSource, /analyzeSchema/);
  assert.match(serverSource, /z\.object/);
  assert.match(serverSource, /prompt: z\.string/);
  assert.match(serverSource, /mode: z\.enum/);
  assert.match(serverSource, /systemPrompt: z\.string/);
});

test('Express server contains CSRF Origin header validation', () => {
  assert.match(serverSource, /allowedOrigins/);
  assert.match(serverSource, /req\.headers\.origin/);
  assert.match(serverSource, /403/);
});

test('Express server contains system prompt sanitization', () => {
  assert.match(serverSource, /sanitizeSystemPrompt/);
  assert.match(serverSource, /replace\(\/\[\\x00-\\x09\\x0B\\x0C\\x0E-\\x1F\\x7F\]\/g/);
});
