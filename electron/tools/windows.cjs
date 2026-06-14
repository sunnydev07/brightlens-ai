const { execFile } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const appAliases = {
  chrome: 'chrome.exe',
  edge: 'msedge.exe',
  notepad: 'notepad.exe',
  calculator: 'calc.exe',
  calc: 'calc.exe',
  vscode: 'code.exe',
  'vs code': 'code.exe',
  explorer: 'explorer.exe',
};

async function startWindowsTarget(target) {
  await execFileAsync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      'Start-Process -FilePath $env:BRIGHTLENS_START_TARGET',
    ],
    {
      env: {
        ...process.env,
        BRIGHTLENS_START_TARGET: target,
      },
      timeout: 10000,
      windowsHide: true,
    },
  );
}

async function openApp(app) {
  const requestedApp = String(app).trim();
  const target = appAliases[requestedApp.toLowerCase()] || requestedApp;
  await startWindowsTarget(target);
  return { ok: true, message: `Opened ${requestedApp}` };
}

async function openUrl(url) {
  const requestedUrl = String(url).trim();
  const normalized = /^https?:\/\//i.test(requestedUrl)
    ? requestedUrl
    : `https://${requestedUrl}`;
  const parsedUrl = new URL(normalized);

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error(`Unsupported URL protocol: ${parsedUrl.protocol}`);
  }

  await startWindowsTarget(parsedUrl.toString());
  return { ok: true, message: `Opened ${parsedUrl.toString()}` };
}

async function runPowerShell(command) {
  const { stdout, stderr } = await execFileAsync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      String(command),
    ],
    {
      timeout: 30000,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    },
  );

  return { ok: true, stdout, stderr };
}

async function findFiles(query, limit = 10) {
  const roots = [
    path.join(os.homedir(), 'Desktop'),
    path.join(os.homedir(), 'Documents'),
    path.join(os.homedir(), 'Downloads'),
  ];
  const safeLimit = Math.min(100, Math.max(1, Math.floor(Number(limit) || 10)));
  const matches = [];
  const queue = roots.slice();
  const normalizedQuery = String(query).toLowerCase();

  while (queue.length > 0 && matches.length < safeLimit) {
    const directory = queue.shift();
    let entries;

    try {
      entries = await fs.promises.readdir(directory, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);

      if (entry.name.toLowerCase().includes(normalizedQuery)) {
        matches.push(fullPath);
        if (matches.length >= safeLimit) {
          break;
        }
      }

      if (entry.isDirectory()) {
        queue.push(fullPath);
      }
    }
  }

  return { ok: true, matches };
}

module.exports = { openApp, openUrl, runPowerShell, findFiles };
