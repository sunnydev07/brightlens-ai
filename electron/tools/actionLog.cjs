const fs = require('fs');
const { app } = require('electron');
const path = require('path');

function sanitizeArguments(toolName, args = {}) {
  if (toolName === 'copy_to_clipboard') {
    return { textLength: String(args.text || '').length };
  }

  if (toolName === 'create_text_file') {
    return {
      path: args.path,
      contentLength: String(args.content || '').length,
    };
  }

  return args;
}

function summarizeResult(result) {
  if (!result || typeof result !== 'object') {
    return { ok: false };
  }

  return {
    ok: result.ok === true,
    ...(result.cancelled ? { cancelled: true } : {}),
    ...(result.message ? { message: result.message } : {}),
    ...(result.path ? { path: result.path } : {}),
    ...(result.error ? { error: result.error } : {}),
  };
}

async function logToolAction(entry) {
  try {
    const logPath = path.join(
      app.getPath('userData'),
      'mini-jarvis-actions.jsonl',
    );
    const record = {
      timestamp: new Date().toISOString(),
      ...entry,
      ...(entry.args
        ? { args: sanitizeArguments(entry.tool, entry.args) }
        : {}),
      ...(entry.result
        ? { result: summarizeResult(entry.result) }
        : {}),
    };
    await fs.promises.mkdir(path.dirname(logPath), { recursive: true });
    await fs.promises.appendFile(
      logPath,
      `${JSON.stringify(record)}\n`,
      'utf8',
    );
    return logPath;
  } catch (error) {
    console.error('Could not write Mini-Jarvis action log:', error);
    return null;
  }
}

module.exports = { logToolAction };
