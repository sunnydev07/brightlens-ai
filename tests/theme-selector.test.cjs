const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.tsx'), 'utf8');
const themeSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'theme.ts'), 'utf8');
const chatAreaSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'ChatArea.tsx'), 'utf8');

test('BrightLens exposes the expected theme choices and persistence key', () => {
  assert.match(appSource, /brightlens_theme/);
  assert.match(themeSource, /Default/);
  assert.match(themeSource, /Dracula Glass/);
  assert.match(themeSource, /GitHub Dark Glass/);
});

test('theme tokens cover markdown and glass UI surfaces', () => {
  for (const token of ['appIcon', 'panel', 'input', 'markdown', 'accent']) {
    assert.match(themeSource, new RegExp(token));
  }
});

test('query loading renders submitted question with compact shimmering thinking state', () => {
  assert.match(chatAreaSource, /Thinking/);
  assert.match(chatAreaSource, /thinking-shimmer/);
});

test('screen capture preview is compact so response text remains primary', () => {
  assert.match(chatAreaSource, /visual-context-thumbnail/);
  assert.match(chatAreaSource, /Visual Context/);
  assert.match(chatAreaSource, /120px/);
});
