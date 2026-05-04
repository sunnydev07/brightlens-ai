const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.tsx'), 'utf8');

test('BrightLens exposes the expected theme choices and persistence key', () => {
  assert.match(appSource, /brightlens_theme/);
  assert.match(appSource, /Default/);
  assert.match(appSource, /Dracula Glass/);
  assert.match(appSource, /GitHub Dark Glass/);
});

test('theme tokens cover markdown and glass UI surfaces', () => {
  for (const token of ['appIcon', 'panel', 'input', 'markdown', 'accent']) {
    assert.match(appSource, new RegExp(token));
  }
});

test('query loading renders submitted question with compact shimmering thinking state', () => {
  assert.match(appSource, /submittedQuestion/);
  assert.match(appSource, /Thinking/);
  assert.match(appSource, /thinkingShimmer/);
});

test('screen capture preview is compact so response text remains primary', () => {
  assert.match(appSource, /visual-context-thumbnail/);
  assert.match(appSource, /Visual Context/);
  assert.match(appSource, /170px/);
});
