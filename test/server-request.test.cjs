const assert = require('node:assert/strict');
const test = require('node:test');

const {
  normalizeAnalyzeRequest,
} = require('../server/request.cjs');

test('rejects empty and malformed analyze requests', () => {
  assert.throws(
    () => normalizeAnalyzeRequest({}),
    /Missing image or prompt/,
  );
  assert.throws(
    () => normalizeAnalyzeRequest({ prompt: '   ', image: {} }),
    /Missing image or prompt/,
  );
});

test('normalizes analyze request fields', () => {
  assert.deepEqual(
    normalizeAnalyzeRequest({
      prompt: '  explain this  ',
      image: ' data:image/png;base64,abc ',
      mode: 'offline',
      systemPrompt: '  be concise  ',
    }),
    {
      prompt: 'explain this',
      image: 'data:image/png;base64,abc',
      mode: 'offline',
      systemPrompt: 'be concise',
    },
  );
});
