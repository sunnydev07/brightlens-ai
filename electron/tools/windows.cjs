const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);
const userHome = path.resolve(os.homedir());

const appAliases = {
  'command prompt': 'cmd.exe',
  chrome: 'chrome.exe',
  'control panel': 'control.exe',
  discord: 'Discord.exe',
  edge: 'msedge.exe',
  excel: 'excel.exe',
  'file explorer': 'explorer.exe',
  files: 'explorer.exe',
  notepad: 'notepad.exe',
  calculator: 'calc.exe',
  calc: 'calc.exe',
  paint: 'mspaint.exe',
  powershell: 'powershell.exe',
  settings: 'ms-settings:',
  'snipping tool': 'snippingtool.exe',
  spotify: 'spotify.exe',
  'task manager': 'taskmgr.exe',
  terminal: 'wt.exe',
  vscode: 'code.exe',
  'vs code': 'code.exe',
  word: 'winword.exe',
  explorer: 'explorer.exe',
};

const processAliases = {
  calculator: 'CalculatorApp',
  calc: 'CalculatorApp',
  chrome: 'chrome',
  discord: 'Discord',
  edge: 'msedge',
  excel: 'EXCEL',
  notepad: 'notepad',
  paint: 'mspaint',
  powershell: 'powershell',
  spotify: 'Spotify',
  'task manager': 'Taskmgr',
  terminal: 'WindowsTerminal',
  vscode: 'Code',
  'vs code': 'Code',
  word: 'WINWORD',
};

const windowTitleAliases = {
  calculator: 'Calculator',
  calc: 'Calculator',
  chrome: 'Google Chrome',
  discord: 'Discord',
  edge: 'Microsoft Edge',
  excel: 'Excel',
  notepad: 'Notepad',
  paint: 'Paint',
  powershell: 'PowerShell',
  spotify: 'Spotify',
  'task manager': 'Task Manager',
  terminal: 'Terminal',
  vscode: 'Visual Studio Code',
  'vs code': 'Visual Studio Code',
  word: 'Word',
};

const userFolderAliases = {
  desktop: path.join(userHome, 'Desktop'),
  documents: path.join(userHome, 'Documents'),
  downloads: path.join(userHome, 'Downloads'),
  home: userHome,
  pictures: path.join(userHome, 'Pictures'),
  videos: path.join(userHome, 'Videos'),
};

const audioInteropScript = String.raw`
if (-not ('BrightlensAudio' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public enum EDataFlow { eRender, eCapture, eAll }
public enum ERole { eConsole, eMultimedia, eCommunications }

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
public class MMDeviceEnumeratorComObject {}

[ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown),
 Guid("A95664D2-9614-4F35-A746-DE8DB63617E6")]
public interface IMMDeviceEnumerator {
  int EnumAudioEndpoints(EDataFlow dataFlow, int stateMask, out IntPtr devices);
  int GetDefaultAudioEndpoint(EDataFlow dataFlow, ERole role, out IMMDevice endpoint);
}

[ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown),
 Guid("D666063F-1587-4E43-81F1-B948E807363F")]
public interface IMMDevice {
  int Activate(ref Guid iid, int context, IntPtr activationParams,
    [MarshalAs(UnmanagedType.IUnknown)] out object interfaceObject);
}

[ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown),
 Guid("5CDF2C82-841E-4546-9722-0CF74078229A")]
public interface IAudioEndpointVolume {
  int RegisterControlChangeNotify(IntPtr notify);
  int UnregisterControlChangeNotify(IntPtr notify);
  int GetChannelCount(out uint channelCount);
  int SetMasterVolumeLevel(float levelDb, Guid eventContext);
  int SetMasterVolumeLevelScalar(float level, Guid eventContext);
  int GetMasterVolumeLevel(out float levelDb);
  int GetMasterVolumeLevelScalar(out float level);
  int SetChannelVolumeLevel(uint channelNumber, float levelDb, Guid eventContext);
  int SetChannelVolumeLevelScalar(uint channelNumber, float level, Guid eventContext);
  int GetChannelVolumeLevel(uint channelNumber, out float levelDb);
  int GetChannelVolumeLevelScalar(uint channelNumber, out float level);
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool muted, Guid eventContext);
  int GetMute([MarshalAs(UnmanagedType.Bool)] out bool muted);
}

public static class BrightlensAudio {
  private static IAudioEndpointVolume GetEndpoint() {
    var enumerator = (IMMDeviceEnumerator)new MMDeviceEnumeratorComObject();
    IMMDevice device;
    Marshal.ThrowExceptionForHR(
      enumerator.GetDefaultAudioEndpoint(EDataFlow.eRender, ERole.eMultimedia, out device)
    );
    Guid iid = typeof(IAudioEndpointVolume).GUID;
    object endpoint;
    Marshal.ThrowExceptionForHR(device.Activate(ref iid, 23, IntPtr.Zero, out endpoint));
    return (IAudioEndpointVolume)endpoint;
  }

  public static float GetVolume() {
    float level;
    Marshal.ThrowExceptionForHR(GetEndpoint().GetMasterVolumeLevelScalar(out level));
    return level;
  }

  public static bool GetMute() {
    bool muted;
    Marshal.ThrowExceptionForHR(GetEndpoint().GetMute(out muted));
    return muted;
  }

  public static void SetVolume(float level) {
    Marshal.ThrowExceptionForHR(
      GetEndpoint().SetMasterVolumeLevelScalar(level, Guid.Empty)
    );
  }

  public static void SetMute(bool muted) {
    Marshal.ThrowExceptionForHR(GetEndpoint().SetMute(muted, Guid.Empty));
  }
}
'@
}
`;

const windowInteropScript = String.raw`
if (-not ('BrightlensWindow' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class BrightlensWindow {
  [DllImport("user32.dll")]
  [return: MarshalAs(UnmanagedType.Bool)]
  public static extern bool ShowWindowAsync(IntPtr windowHandle, int command);

  [DllImport("user32.dll")]
  [return: MarshalAs(UnmanagedType.Bool)]
  public static extern bool SetForegroundWindow(IntPtr windowHandle);
}
'@
}
`;

function isWithinUserHome(targetPath) {
  const relative = path.relative(userHome, targetPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function expandUserPath(inputPath) {
  const requested = String(inputPath || '').trim().replace(/^["']|["']$/g, '');
  if (!requested) {
    throw new Error('A path is required.');
  }

  const normalizedKey = requested
    .replace(/^[~][\\/]+?/, '')
    .replace(/[\\/]+$/, '')
    .toLowerCase();
  if (userFolderAliases[normalizedKey]) {
    return userFolderAliases[normalizedKey];
  }

  const aliasMatch = requested.match(
    /^(?:~[\\/]*)?(desktop|documents|downloads|pictures|videos)(?:[\\/](.*))?$/i,
  );
  if (aliasMatch) {
    return path.resolve(
      userFolderAliases[aliasMatch[1].toLowerCase()],
      aliasMatch[2] || '',
    );
  }

  if (requested === '~') {
    return userHome;
  }

  if (/^~[\\/]/.test(requested)) {
    return path.resolve(userHome, requested.slice(2));
  }

  return path.isAbsolute(requested)
    ? path.resolve(requested)
    : path.resolve(userHome, requested);
}

async function findExistingAncestor(targetPath) {
  let current = targetPath;

  while (true) {
    try {
      await fs.promises.access(current);
      return current;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) {
        throw new Error(`No accessible ancestor found for ${targetPath}`);
      }
      current = parent;
    }
  }
}

async function resolveSafeUserPath(inputPath, options = {}) {
  const targetPath = expandUserPath(inputPath);
  if (!isWithinUserHome(targetPath)) {
    throw new Error('File operations are limited to the current user profile.');
  }

  const existingAncestor = await findExistingAncestor(targetPath);
  const realAncestor = await fs.promises.realpath(existingAncestor);
  if (!isWithinUserHome(realAncestor)) {
    throw new Error('The path resolves outside the current user profile.');
  }

  if (options.mustExist) {
    const realTarget = await fs.promises.realpath(targetPath);
    if (!isWithinUserHome(realTarget)) {
      throw new Error('The path resolves outside the current user profile.');
    }
    return realTarget;
  }

  return targetPath;
}

async function runInternalPowerShell(command, env = {}, timeout = 30000) {
  return execFileAsync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      command,
    ],
    {
      env: { ...process.env, ...env },
      timeout,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    },
  );
}

async function startWindowsTarget(target) {
  await runInternalPowerShell(
    'Start-Process -FilePath $env:BRIGHTLENS_START_TARGET',
    { BRIGHTLENS_START_TARGET: target },
    10000,
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
  const { stdout, stderr } = await runInternalPowerShell(String(command));
  return { ok: true, stdout: stdout.trimEnd(), stderr: stderr.trimEnd() };
}

async function findFiles(query, limit = 10) {
  const roots = [
    path.join(userHome, 'Desktop'),
    path.join(userHome, 'Documents'),
    path.join(userHome, 'Downloads'),
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

async function listDirectory(inputPath, limit = 100) {
  const directory = await resolveSafeUserPath(inputPath, { mustExist: true });
  const stats = await fs.promises.stat(directory);
  if (!stats.isDirectory()) {
    throw new Error(`${directory} is not a directory.`);
  }

  const safeLimit = Math.min(500, Math.max(1, Math.floor(Number(limit) || 100)));
  const entries = await fs.promises.readdir(directory, { withFileTypes: true });
  return {
    ok: true,
    path: directory,
    entries: entries
      .slice(0, safeLimit)
      .map((entry) => ({
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : 'file',
        path: path.join(directory, entry.name),
      })),
    truncated: entries.length > safeLimit,
  };
}

async function createFolder(inputPath) {
  const targetPath = await resolveSafeUserPath(inputPath);
  await fs.promises.mkdir(targetPath);
  return { ok: true, path: targetPath, message: 'Folder created.' };
}

async function createTextFile(inputPath, content = '') {
  const targetPath = await resolveSafeUserPath(inputPath);
  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.promises.writeFile(targetPath, String(content), {
    encoding: 'utf8',
    flag: 'wx',
  });
  return { ok: true, path: targetPath, message: 'Text file created.' };
}

async function renamePath(inputPath, newName) {
  const source = await resolveSafeUserPath(inputPath, { mustExist: true });
  const destination = await resolveSafeUserPath(
    path.join(path.dirname(source), String(newName)),
  );
  await fs.promises.rename(source, destination);
  return { ok: true, source, destination, message: 'Path renamed.' };
}

async function movePath(sourcePath, destinationPath) {
  const source = await resolveSafeUserPath(sourcePath, { mustExist: true });
  let destination = await resolveSafeUserPath(destinationPath);

  try {
    if ((await fs.promises.stat(destination)).isDirectory()) {
      destination = path.join(destination, path.basename(source));
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  await fs.promises.access(destination)
    .then(() => {
      throw new Error(`Destination already exists: ${destination}`);
    })
    .catch((error) => {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    });

  await fs.promises.rename(source, destination);
  return { ok: true, source, destination, message: 'Path moved.' };
}

function getProcessName(app) {
  const requestedApp = String(app).trim();
  return processAliases[requestedApp.toLowerCase()]
    || path.basename(requestedApp, path.extname(requestedApp));
}

function getWindowTitleHint(app) {
  const requestedApp = String(app).trim();
  return windowTitleAliases[requestedApp.toLowerCase()] || requestedApp;
}

async function closeApp(app) {
  const processName = getProcessName(app);
  const titleHint = getWindowTitleHint(app);
  const { stdout } = await runInternalPowerShell(
    String.raw`
$processes = @(
  Get-Process -Name $env:BRIGHTLENS_PROCESS_NAME -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowHandle -ne 0 }
)
if ($processes.Count -eq 0) {
  $titleHint = $env:BRIGHTLENS_WINDOW_TITLE
  $processes = @(
    Get-Process |
      Where-Object {
        $_.MainWindowHandle -ne 0 -and
        $_.MainWindowTitle.IndexOf(
          $titleHint,
          [StringComparison]::OrdinalIgnoreCase
        ) -ge 0
      }
  )
}
if ($processes.Count -eq 0) {
  throw "No visible application window found for $env:BRIGHTLENS_WINDOW_TITLE"
}
$closed = 0
foreach ($process in $processes) {
  if ($process.CloseMainWindow()) {
    $closed++
  }
}
if ($closed -eq 0) {
  throw "Application did not accept the close request."
}
@{
  process = @($processes | Select-Object -ExpandProperty ProcessName -Unique)
  requestedProcess = $env:BRIGHTLENS_PROCESS_NAME
  title = $env:BRIGHTLENS_WINDOW_TITLE
  requested = $processes.Count
  closed = $closed
} |
  ConvertTo-Json -Compress
`,
    {
      BRIGHTLENS_PROCESS_NAME: processName,
      BRIGHTLENS_WINDOW_TITLE: titleHint,
    },
  );
  return { ok: true, ...JSON.parse(stdout.trim()) };
}

async function manageWindow(app, action) {
  const processName = getProcessName(app);
  const titleHint = getWindowTitleHint(app);
  const { stdout } = await runInternalPowerShell(
    `${windowInteropScript}
$process = Get-Process -Name $env:BRIGHTLENS_PROCESS_NAME -ErrorAction SilentlyContinue |
  Where-Object { $_.MainWindowHandle -ne 0 } |
  Select-Object -First 1
if (-not $process) {
  $titleHint = $env:BRIGHTLENS_WINDOW_TITLE
  $process = Get-Process |
    Where-Object {
      $_.MainWindowHandle -ne 0 -and
      $_.MainWindowTitle.IndexOf(
        $titleHint,
        [StringComparison]::OrdinalIgnoreCase
      ) -ge 0
    } |
    Select-Object -First 1
}
if (-not $process) {
  throw "No visible window found for $env:BRIGHTLENS_WINDOW_TITLE"
}
$commands = @{ minimize = 6; maximize = 3; restore = 9; focus = 9 }
$action = $env:BRIGHTLENS_WINDOW_ACTION
$changed = [BrightlensWindow]::ShowWindowAsync(
  $process.MainWindowHandle,
  $commands[$action]
)
$focused = $false
if ($action -eq 'focus') {
  $focused = [BrightlensWindow]::SetForegroundWindow($process.MainWindowHandle)
}
@{
  process = $process.ProcessName
  requestedProcess = $env:BRIGHTLENS_PROCESS_NAME
  action = $action
  changed = $changed
  focused = $focused
} | ConvertTo-Json -Compress
`,
    {
      BRIGHTLENS_PROCESS_NAME: processName,
      BRIGHTLENS_WINDOW_TITLE: titleHint,
      BRIGHTLENS_WINDOW_ACTION: String(action),
    },
  );
  return { ok: true, ...JSON.parse(stdout.trim()) };
}

function parseJsonOutput(stdout, operation) {
  const output = stdout.trim();
  if (!output) {
    throw new Error(`${operation} returned no data.`);
  }
  return JSON.parse(output);
}

async function getVolume() {
  const { stdout } = await runInternalPowerShell(
    `${audioInteropScript}
@{
  level = [Math]::Round([BrightlensAudio]::GetVolume() * 100)
  muted = [BrightlensAudio]::GetMute()
} | ConvertTo-Json -Compress
`,
  );
  return { ok: true, ...parseJsonOutput(stdout, 'Volume query') };
}

async function setVolume(level) {
  const scalar = Number(level) / 100;
  const { stdout } = await runInternalPowerShell(
    `${audioInteropScript}
[BrightlensAudio]::SetVolume(
  [float]::Parse($env:BRIGHTLENS_VOLUME, [Globalization.CultureInfo]::InvariantCulture)
)
@{
  level = [Math]::Round([BrightlensAudio]::GetVolume() * 100)
  muted = [BrightlensAudio]::GetMute()
} | ConvertTo-Json -Compress
`,
    { BRIGHTLENS_VOLUME: scalar.toFixed(4) },
  );
  return { ok: true, ...parseJsonOutput(stdout, 'Set volume') };
}

async function setMute(muted) {
  const { stdout } = await runInternalPowerShell(
    `${audioInteropScript}
[BrightlensAudio]::SetMute($env:BRIGHTLENS_MUTED -eq 'true')
@{
  level = [Math]::Round([BrightlensAudio]::GetVolume() * 100)
  muted = [BrightlensAudio]::GetMute()
} | ConvertTo-Json -Compress
`,
    { BRIGHTLENS_MUTED: String(Boolean(muted)) },
  );
  return { ok: true, ...parseJsonOutput(stdout, 'Set mute') };
}

function getSystemInfo() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  return {
    ok: true,
    hostname: os.hostname(),
    platform: os.platform(),
    release: os.release(),
    architecture: os.arch(),
    cpu: os.cpus()[0]?.model || 'Unknown',
    cpuCores: os.cpus().length,
    memory: {
      totalBytes: totalMemory,
      freeBytes: freeMemory,
      usedPercent: Math.round(((totalMemory - freeMemory) / totalMemory) * 100),
    },
    uptimeSeconds: Math.floor(os.uptime()),
  };
}

async function scheduleShutdown(mode, delaySeconds) {
  const restart = mode === 'restart';
  const args = [
    restart ? '/r' : '/s',
    '/t',
    String(Math.floor(Number(delaySeconds))),
    '/d',
    'p:0:0',
    '/c',
    `Brightlens scheduled this ${restart ? 'restart' : 'shutdown'}.`,
  ];
  await execFileAsync('shutdown.exe', args, {
    timeout: 10000,
    windowsHide: true,
  });
  return {
    ok: true,
    mode,
    delaySeconds: Math.floor(Number(delaySeconds)),
    message: `${restart ? 'Restart' : 'Shutdown'} scheduled.`,
  };
}

async function abortShutdown() {
  await execFileAsync('shutdown.exe', ['/a'], {
    timeout: 10000,
    windowsHide: true,
  });
  return { ok: true, message: 'Pending shutdown or restart cancelled.' };
}

module.exports = {
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
};
