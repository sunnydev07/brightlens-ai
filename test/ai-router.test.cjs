const assert = require('node:assert/strict');
const test = require('node:test');

const { buildPrompt } = require('../server/aiRouter.cjs');

test('normalizes missing prompts instead of sending undefined to the model', () => {
  const prompt = buildPrompt(undefined, null);

  assert.doesNotMatch(prompt, /undefined/);
  assert.match(prompt, /User request:\s*$/);
});
