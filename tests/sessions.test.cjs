const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dbSource = fs.readFileSync(path.join(__dirname, '..', 'server', 'db.cjs'), 'utf8');
const indexSource = fs.readFileSync(path.join(__dirname, '..', 'server', 'index.cjs'), 'utf8');

test('db.cjs supports multiple sessions', () => {
  assert.match(dbSource, /listSessions/);
  assert.match(dbSource, /deleteSession/);
  assert.match(dbSource, /setActiveSession/);
  assert.match(dbSource, /startNewSession/);
  assert.match(dbSource, /GROUP BY sessionId/);
});

test('server/index.cjs exposes sessions and history endpoints', () => {
  assert.match(indexSource, /\/api\/sessions/);
  assert.match(indexSource, /\/api\/history/);
  assert.match(indexSource, /\/api\/sessions\/active/);
  assert.match(indexSource, /\/api\/sessions\/new/);
  assert.match(indexSource, /\/api\/sessions\/:sessionId/);
  assert.match(indexSource, /\/api\/ollama\/models/);
});
