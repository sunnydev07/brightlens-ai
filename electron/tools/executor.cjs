const fs = require('fs');
const path = require('path');
const {
  app,
  clipboard,
  desktopCapturer,
  screen,
  shell,
} = require('electron');
const {
  abortShutdown,
  closeApp,
  createFolder,
  createTextFile,
  findFiles,
  getSystemInfo,
  getVolume,
  listDirectory,
  manageWindow,
  movePath,
  openApp,
  openUrl,
  renamePath,
  resolveSafeUserPath,
  runPowerShell,
  scheduleShutdown,
  setMute,
  setVolume,
} = require('./windows.cjs');
const {
  cancelReminder,
  listReminders,
  setReminder,
} = require('./reminders.cjs');

function encodeQuery(query) {
  return encodeURIComponent(String(query));
}

async function takeScreenshot() {
  const display = screen.getPrimaryDisplay();
  const scaleFactor = display.scaleFactor || 1;
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width: Math.round(display.size.width * scaleFactor),
      height: Math.round(display.size.height * scaleFactor),
    },
  });
  const source = sources.find(
    (entry) => entry.display_id === String(display.id),
  ) || sources[0];
  if (!source || source.thumbnail.isEmpty()) {
    throw new Error('Could not capture the primary display.');
  }

  const directory = path.join(
    app.getPath('pictures'),
    'Brightlens Screenshots',
  );
  await fs.promises.mkdir(directory, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const screenshotPath = path.join(directory, `brightlens-${timestamp}.png`);
  await fs.promises.writeFile(screenshotPath, source.thumbnail.toPNG());
  return { ok: true, path: screenshotPath, message: 'Screenshot saved.' };
}

async function deletePath(inputPath) {
  const targetPath = await resolveSafeUserPath(inputPath, { mustExist: true });
  await shell.trashItem(targetPath);
  return {
    ok: true,
    path: targetPath,
    message: 'Moved path to the Recycle Bin.',
  };
}

async function executeTool(name, args) {
  switch (name) {
    case 'open_app':
      return openApp(args.app);
    case 'open_url':
      return openUrl(args.url);
    case 'web_search':
      return openUrl(
        `https://www.google.com/search?q=${encodeQuery(args.query)}`,
      );
    case 'youtube_search':
      return openUrl(
        `https://www.youtube.com/results?search_query=${encodeQuery(args.query)}`,
      );
    case 'copy_to_clipboard':
      clipboard.writeText(String(args.text));
      return { ok: true, message: 'Copied text to clipboard.' };
    case 'get_clipboard':
      return { ok: true, text: clipboard.readText() };
    case 'clear_clipboard':
      clipboard.clear();
      return { ok: true, message: 'Clipboard cleared.' };
    case 'take_screenshot':
      return takeScreenshot();
    case 'get_volume':
      return getVolume();
    case 'set_volume':
      return setVolume(args.level);
    case 'set_mute':
      return setMute(args.muted);
    case 'find_files':
      return findFiles(args.query, args.limit || 10);
    case 'list_directory':
      return listDirectory(args.path, args.limit || 25);
    case 'create_folder':
      return createFolder(args.path);
    case 'create_text_file':
      return createTextFile(args.path, args.content || '');
    case 'rename_path':
      return renamePath(args.path, args.new_name);
    case 'move_path':
      return movePath(args.source, args.destination);
    case 'delete_path':
      return deletePath(args.path);
    case 'close_app':
      return closeApp(args.app);
    case 'manage_window':
      return manageWindow(args.app, args.action);
    case 'get_system_info':
      return getSystemInfo();
    case 'set_reminder':
      return setReminder(args.message, args.delay_minutes);
    case 'list_reminders':
      return listReminders();
    case 'cancel_reminder':
      return cancelReminder(args.id);
    case 'shutdown_computer':
      return scheduleShutdown('shutdown', args.delay_seconds);
    case 'restart_computer':
      return scheduleShutdown('restart', args.delay_seconds);
    case 'abort_shutdown':
      return abortShutdown();
    case 'run_powershell':
      return runPowerShell(args.command);
    default:
      return { ok: false, error: `No executor for tool: ${name}` };
  }
}

module.exports = { executeTool };
