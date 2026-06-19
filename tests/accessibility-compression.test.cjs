const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.tsx'), 'utf8');
const titleBarSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'TitleBar.tsx'), 'utf8');
const inputAreaSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'InputArea.tsx'), 'utf8');
const settingsModalSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'SettingsModal.tsx'), 'utf8');
const createModeModalSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'CreateModeModal.tsx'), 'utf8');

test('App.tsx contains JPEG compression and main landmark tag', () => {
  // Verifying JPEG compression
  assert.match(appSource, /image\/jpeg/);
  assert.match(appSource, /canvas\.toDataURL\("image\/jpeg",\s*0\.8\)/);

  // Verifying main landmark tag
  assert.match(appSource, /<main\s+style=\{/);
  assert.match(appSource, /<\/main>/);
});

test('TitleBar.tsx wraps in header and has aria-label tags', () => {
  assert.match(titleBarSource, /<header\s+style=\{/);
  assert.match(titleBarSource, /<\/header>/);
  assert.match(titleBarSource, /aria-label=\{isRecording\s*\?/);
  assert.match(titleBarSource, /aria-label="Minimize application"/);
  assert.match(titleBarSource, /aria-label="Maximize application"/);
  assert.match(titleBarSource, /aria-label="Close application"/);
});

test('InputArea.tsx has required aria-labels and menu roles', () => {
  assert.match(inputAreaSource, /aria-label="Question prompt"/);
  assert.match(inputAreaSource, /aria-label="Capture screen screenshot for context"/);
  assert.match(inputAreaSource, /aria-label="Smart processing indicator"/);
  assert.match(inputAreaSource, /aria-label=\{`Select AI system prompt mode, current mode:\s*\$\{selectedModeName\}`\}/);
  assert.match(inputAreaSource, /role="menu"/);
  assert.match(inputAreaSource, /role="menuitem"/);
  assert.match(inputAreaSource, /aria-label="Upload audio file to transcribe"/);
  assert.match(inputAreaSource, /aria-label="Clear current question, image preview, and response"/);
  assert.match(inputAreaSource, /aria-label="Open application settings modal"/);
  assert.match(inputAreaSource, /aria-label="Stop generating AI response"/);
  assert.match(inputAreaSource, /aria-label="Submit question to AI"/);
});

test('SettingsModal.tsx has role="dialog", Escape key handling, and focus trapping', () => {
  assert.match(settingsModalSource, /role="dialog"/);
  assert.match(settingsModalSource, /aria-modal="true"/);
  assert.match(settingsModalSource, /aria-labelledby="settings-modal-title"/);
  assert.match(settingsModalSource, /const modalRef = useRef/);
  assert.match(settingsModalSource, /Escape/);
  assert.match(settingsModalSource, /Tab/);
});

test('CreateModeModal.tsx has role="dialog", Escape key handling, and focus trapping', () => {
  assert.match(createModeModalSource, /role="dialog"/);
  assert.match(createModeModalSource, /aria-modal="true"/);
  assert.match(createModeModalSource, /aria-labelledby="create-mode-modal-title"/);
  assert.match(createModeModalSource, /const modalRef = useRef/);
  assert.match(createModeModalSource, /Escape/);
  assert.match(createModeModalSource, /Tab/);
});
