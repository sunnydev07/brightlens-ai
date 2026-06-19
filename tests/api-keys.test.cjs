const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server', 'index.cjs'), 'utf8');
const routerSource = fs.readFileSync(path.join(__dirname, '..', 'server', 'aiRouter.cjs'), 'utf8');

test('Express routes extract keys overrides from custom headers', () => {
  assert.match(serverSource, /geminiKey: req\.headers\["x-gemini-key"\]/);
  assert.match(serverSource, /openrouterKey: req\.headers\["x-openrouter-key"\]/);
  assert.match(serverSource, /nvidiaKey: req\.headers\["x-nvidia-key"\]/);
});

test('Router endpoints prioritize passed keys over env files', () => {
  assert.match(routerSource, /keys\?.openrouterKey || OPENROUTER_API_KEY/);
  assert.match(routerSource, /keys\?.nvidiaKey || NVIDIA_API_KEY/);
  assert.match(routerSource, /keys\?.geminiKey || process\.env\.GEMINI_API_KEY/);
});
