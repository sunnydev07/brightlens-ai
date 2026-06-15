'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

// The package is an ES module and the renderer's utilities are TypeScript with
// extensionless imports, so load them through tsx's loader and dynamic
// import(). Type-checking is handled separately by `tsc --noEmit`.
require('tsx/esm/api').register()

const src = (p) => pathToFileURL(path.join(__dirname, '..', 'src', p)).href

let modes
let conversations
let jarvis

test.before(async () => {
  modes = await import(src('lib/modes.ts'))
  conversations = await import(src('lib/conversations.ts'))
  jarvis = await import(src('lib/jarvis.ts'))
})

test('parseModes falls back to defaults for invalid input', () => {
  assert.deepEqual(modes.parseModes(null), modes.DEFAULT_MODES)
  assert.deepEqual(modes.parseModes('nope'), modes.DEFAULT_MODES)
  assert.deepEqual(modes.parseModes([{ bad: true }]), modes.DEFAULT_MODES)
})

test('parseModes dedupes names case-insensitively and trims prompts', () => {
  const result = modes.parseModes([
    { name: '  Coder ', systemPrompt: '  be terse  ' },
    { name: 'coder', systemPrompt: 'dupe' },
    { name: 'Writer', systemPrompt: '' },
  ])
  assert.equal(result.length, 2)
  assert.deepEqual(result[0], { name: 'Coder', systemPrompt: 'be terse' })
  assert.deepEqual(result[1], { name: 'Writer', systemPrompt: null })
})

test('modeNameExists matches regardless of case/whitespace', () => {
  const list = [{ name: 'Default', systemPrompt: null }]
  assert.equal(modes.modeNameExists(list, '  default '), true)
  assert.equal(modes.modeNameExists(list, 'Coder'), false)
})

test('titleFromText truncates and handles empty input', () => {
  assert.equal(conversations.titleFromText('   '), 'New conversation')
  assert.equal(conversations.titleFromText('hello   world'), 'hello world')
  const long = 'a'.repeat(80)
  const title = conversations.titleFromText(long, 48)
  assert.equal(title.length, 48)
  assert.ok(title.endsWith('…'))
})

test('parseConversationStore drops malformed conversations and messages', () => {
  const store = conversations.parseConversationStore({
    conversations: [
      {
        id: 'c1',
        title: 'Valid',
        messages: [{ id: 'm1', role: 'user', content: 'hi', createdAt: 1 }],
        createdAt: 1,
        updatedAt: 2,
      },
      { id: 'broken' },
      'garbage',
    ],
  })
  assert.equal(store.version, 1)
  assert.equal(store.conversations.length, 1)
  assert.equal(store.conversations[0].pinned, false)
})

test('sortConversations puts pinned first then newest', () => {
  const sorted = conversations.sortConversations([
    { id: 'a', title: 'a', messages: [], pinned: false, createdAt: 0, updatedAt: 10 },
    { id: 'b', title: 'b', messages: [], pinned: true, createdAt: 0, updatedAt: 1 },
    { id: 'c', title: 'c', messages: [], pinned: false, createdAt: 0, updatedAt: 30 },
  ])
  assert.deepEqual(
    sorted.map((c) => c.id),
    ['b', 'c', 'a'],
  )
})

test('searchConversations matches title and message content', () => {
  const list = [
    {
      id: 'a',
      title: 'Taxes',
      messages: [{ id: 'm', role: 'user', content: 'invoice', createdAt: 1 }],
      pinned: false,
      createdAt: 0,
      updatedAt: 0,
    },
  ]
  assert.equal(conversations.searchConversations(list, 'tax').length, 1)
  assert.equal(conversations.searchConversations(list, 'INVOICE').length, 1)
  assert.equal(conversations.searchConversations(list, 'missing').length, 0)
  assert.equal(conversations.searchConversations(list, '  ').length, 1)
})

test('pruneByRetention keeps pinned and recent conversations', () => {
  const now = 1_000_000_000_000
  const day = 24 * 60 * 60 * 1000
  const list = [
    { id: 'old', title: 'old', messages: [], pinned: false, createdAt: 0, updatedAt: now - 10 * day },
    { id: 'oldPinned', title: 'p', messages: [], pinned: true, createdAt: 0, updatedAt: now - 10 * day },
    { id: 'fresh', title: 'f', messages: [], pinned: false, createdAt: 0, updatedAt: now - 1 * day },
  ]
  const kept = conversations.pruneByRetention(list, 7, now).map((c) => c.id)
  assert.deepEqual(kept.sort(), ['fresh', 'oldPinned'])
  // 0 retention keeps everything
  assert.equal(conversations.pruneByRetention(list, 0, now).length, 3)
})

test('slugify produces safe filenames', () => {
  assert.equal(conversations.slugify('Hello, World!'), 'hello-world')
  assert.equal(conversations.slugify('   '), 'conversation')
})

test('toJarvisCards summarizes a successful multi-tool result', () => {
  const cards = jarvis.toJarvisCards({
    ok: true,
    message: 'ok',
    results: [
      { tool: 'open_app', ok: true, result: { message: 'Opened Safari' } },
      { tool: 'read_clipboard', ok: true, result: { text: 'hi' } },
      { tool: 'do_thing', cancelled: true },
      { tool: 'fail_thing', error: 'nope' },
    ],
  })
  assert.equal(cards.length, 4)
  assert.deepEqual(
    cards.map((c) => c.status),
    ['success', 'success', 'cancelled', 'error'],
  )
  assert.equal(cards[0].tool, 'Open App')
  assert.equal(cards[1].message, 'Clipboard: hi')
  assert.equal(cards[3].error, 'nope')
})

test('toJarvisCards handles an empty result list', () => {
  const ok = jarvis.toJarvisCards({ ok: true, message: 'All done' })
  assert.equal(ok.length, 1)
  assert.equal(ok[0].status, 'success')
  const bad = jarvis.toJarvisCards({ ok: false, message: 'boom' })
  assert.equal(bad[0].status, 'error')
  assert.equal(bad[0].error, 'boom')
})

test('jarvisHeading reflects ok flag', () => {
  assert.equal(jarvis.jarvisHeading({ ok: true }), 'Done')
  assert.match(jarvis.jarvisHeading({ ok: false }), /Couldn't complete/)
})
