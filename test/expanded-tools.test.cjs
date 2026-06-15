const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const {
  inferObviousToolCall,
} = require('../electron/tools/planner.cjs');
const {
  requiresConfirmation,
  validateToolCall,
} = require('../electron/tools/safety.cjs');
const {
  createFolder,
  createTextFile,
  listDirectory,
  movePath,
  renamePath,
  resolveAppTarget,
  resolveSafeUserPath,
} = require('../electron/tools/windows.cjs');

const commandCases = [
  ['get clipboard', 'get_clipboard', {}],
  ['clear clipboard', 'clear_clipboard', {}],
  ['take screenshot', 'take_screenshot', {}],
  ['get volume', 'get_volume', {}],
  ['set volume to 50', 'set_volume', { level: 50 }],
  ['mute volume', 'set_mute', { muted: true }],
  ['unmute', 'set_mute', { muted: false }],
  [
    'list files in Downloads',
    'list_directory',
    { path: 'Downloads' },
  ],
  [
    'create folder Desktop/Brightlens Test',
    'create_folder',
    { path: 'Desktop/Brightlens Test' },
  ],
  [
    'create file Desktop/Brightlens Test/note.txt with content hello',
    'create_text_file',
    {
      path: 'Desktop/Brightlens Test/note.txt',
      content: 'hello',
    },
  ],
  [
    'rename Desktop/Brightlens Test/note.txt to renamed.txt',
    'rename_path',
    {
      path: 'Desktop/Brightlens Test/note.txt',
      new_name: 'renamed.txt',
    },
  ],
  [
    'move Desktop/Brightlens Test/renamed.txt to Documents',
    'move_path',
    {
      source: 'Desktop/Brightlens Test/renamed.txt',
      destination: 'Documents',
    },
  ],
  [
    'delete Desktop/Brightlens Test',
    'delete_path',
    { path: 'Desktop/Brightlens Test' },
  ],
  ['close calculator', 'close_app', { app: 'calculator' }],
  ['get system information', 'get_system_info', {}],
  [
    'remind me in 10 minutes to stretch',
    'set_reminder',
    { message: 'stretch', delay_minutes: 10 },
  ],
  ['list reminders', 'list_reminders', {}],
  [
    'cancel reminder abc123',
    'cancel_reminder',
    { id: 'abc123' },
  ],
  [
    'minimize calculator',
    'manage_window',
    { app: 'calculator', action: 'minimize' },
  ],
  [
    'shutdown computer in 60 seconds',
    'shutdown_computer',
    { delay_seconds: 60 },
  ],
  [
    'restart in 2 minutes',
    'restart_computer',
    { delay_seconds: 120 },
  ],
  ['abort shutdown', 'abort_shutdown', {}],
  [
    'find files named report',
    'find_files',
    { query: 'report' },
  ],
  ['open calculator app', 'open_app', { app: 'calculator' }],
  ['close calculator app', 'close_app', { app: 'calculator' }],
];

test('maps expanded obvious commands to registered valid tool calls', () => {
  for (const [command, name, argumentsValue] of commandCases) {
    const toolCall = inferObviousToolCall(command);
    assert.deepEqual(toolCall, { name, arguments: argumentsValue }, command);
    assert.equal(validateToolCall(toolCall).ok, true, command);
  }
});

test('keeps state-changing and destructive tools behind confirmation', () => {
  const confirmationTools = [
    'create_folder',
    'create_text_file',
    'rename_path',
    'move_path',
    'delete_path',
    'close_app',
    'shutdown_computer',
    'restart_computer',
    'run_powershell',
  ];

  for (const command of commandCases.map(([value]) => value)) {
    const validation = validateToolCall(inferObviousToolCall(command));
    if (validation.ok && confirmationTools.includes(validation.tool.name)) {
      assert.equal(requiresConfirmation(validation.tool), true);
    }
  }
});

test('rejects invalid control arguments and protected process names', () => {
  assert.equal(validateToolCall({
    name: 'manage_window',
    arguments: { app: 'notepad', action: 'hide' },
  }).ok, false);
  assert.equal(validateToolCall({
    name: 'set_volume',
    arguments: { level: 101 },
  }).ok, false);
  assert.equal(validateToolCall({
    name: 'set_reminder',
    arguments: { message: 'test', delay_minutes: 0.01 },
  }).ok, false);
  assert.equal(validateToolCall({
    name: 'shutdown_computer',
    arguments: { delay_seconds: 5 },
  }).ok, false);
  assert.equal(validateToolCall({
    name: 'close_app',
    arguments: { app: 'explorer.exe' },
  }).ok, false);
  assert.equal(validateToolCall({
    name: 'open_url',
    arguments: {
      url: 'https://www.youtube.com',
      browser: 'chrome',
    },
  }).ok, true);
  assert.equal(validateToolCall({
    name: 'open_app',
    arguments: { app: 'chrome and youtube inside it' },
  }).ok, false);
});

test('resolves common Chrome names to a launchable executable target', () => {
  assert.equal(path.basename(resolveAppTarget('chrome')).toLowerCase(), 'chrome.exe');
  assert.equal(
    path.basename(resolveAppTarget('Google Chrome')).toLowerCase(),
    'chrome.exe',
  );
});

test('limits file operations to the current user profile', async () => {
  await assert.rejects(
    resolveSafeUserPath('C:\\Windows'),
    /limited to the current user profile/,
  );
  assert.match(
    await resolveSafeUserPath('Desktop'),
    /Desktop$/i,
  );
});

test('creates, lists, renames, and moves files inside the user profile', async () => {
  const root = path.join(
    os.tmpdir(),
    `brightlens-expanded-tools-${process.pid}-${Date.now()}`,
  );
  const relative = path.relative(os.homedir(), root);
  assert.equal(relative.startsWith('..') || path.isAbsolute(relative), false);

  try {
    await createFolder(root);
    await createTextFile(path.join(root, 'note.txt'), 'hello');
    await renamePath(path.join(root, 'note.txt'), 'renamed.txt');
    await createFolder(path.join(root, 'destination'));
    const moved = await movePath(
      path.join(root, 'renamed.txt'),
      path.join(root, 'destination'),
    );
    assert.equal(
      await fs.promises.readFile(moved.destination, 'utf8'),
      'hello',
    );

    const listing = await listDirectory(path.join(root, 'destination'));
    assert.deepEqual(
      listing.entries.map((entry) => entry.name),
      ['renamed.txt'],
    );
  } finally {
    const resolvedRoot = path.resolve(root);
    assert.equal(
      path.basename(resolvedRoot).startsWith('brightlens-expanded-tools-'),
      true,
    );
    await fs.promises.rm(resolvedRoot, { recursive: true, force: true });
  }
});
