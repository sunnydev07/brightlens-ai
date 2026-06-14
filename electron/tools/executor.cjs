const { clipboard } = require('electron');
const {
  openApp,
  openUrl,
  runPowerShell,
  findFiles,
} = require('./windows.cjs');

function encodeQuery(query) {
  return encodeURIComponent(String(query));
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
    case 'set_volume':
      return runPowerShell(
        '(New-Object -ComObject WScript.Shell).SendKeys([char]175)',
      );
    case 'find_files':
      return findFiles(args.query, args.limit || 10);
    case 'run_powershell':
      return runPowerShell(args.command);
    default:
      return { ok: false, error: `No executor for tool: ${name}` };
  }
}

module.exports = { executeTool };
