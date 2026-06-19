const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const mainSource = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.cjs'), 'utf8');
const preloadSource = fs.readFileSync(path.join(__dirname, '..', 'electron', 'preload.cjs'), 'utf8');

test('main.cjs registers secure keys handlers', () => {
  assert.match(mainSource, /GET_SECURE_KEYS/);
  assert.match(mainSource, /SAVE_SECURE_KEYS/);
  assert.match(mainSource, /safeStorage\.encryptString/);
  assert.match(mainSource, /safeStorage\.decryptString/);
});

test('preload.cjs exposes secure keys methods', () => {
  assert.match(preloadSource, /getSecureKeys:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('GET_SECURE_KEYS'\)/);
  assert.match(preloadSource, /saveSecureKeys:\s*\(keys\)\s*=>\s*ipcRenderer\.invoke\('SAVE_SECURE_KEYS',\s*keys\)/);
});
