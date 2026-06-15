const {
  app,
  BrowserWindow,
  globalShortcut,
  desktopCapturer,
  ipcMain,
  Tray,
  Menu,
  dialog,
  nativeImage,
  shell,
} = require('electron');
const path = require('path');
const { isTrustedRendererUrl } = require('./rendererSecurity.cjs');
const { planToolCalls } = require('./tools/planner.cjs');
const {
  validateToolCall,
  requiresConfirmation,
} = require('./tools/safety.cjs');
const { executeTool } = require('./tools/executor.cjs');
const { initializeReminders } = require('./tools/reminders.cjs');
const { logToolAction } = require('./tools/actionLog.cjs');
const { logAction } = require('./tools/logger.cjs');

let tray = null;
let isQuitting = false;

let win;
let captureInProgress = false;
let restoreTimer = null;

const DEV_RENDERER_URL = process.env.BRIGHTLENS_RENDERER_URL
  || 'http://127.0.0.1:5173';
const PRODUCTION_RENDERER_FILE = path.join(__dirname, '../dist/index.html');
const TRAY_ICON_PATH = path.join(__dirname, '../src/assets/hero.png');

function isTrustedUrl(url) {
  return isTrustedRendererUrl(url, {
    devOrigin: DEV_RENDERER_URL,
    productionFile: PRODUCTION_RENDERER_FILE,
  });
}

function isTrustedIpcEvent(event) {
  const senderUrl = event.senderFrame?.url || event.sender?.getURL?.() || '';
  const trusted = isTrustedUrl(senderUrl);
  if (!trusted) {
    console.warn(`Blocked IPC request from untrusted renderer: ${senderUrl}`);
  }
  return trusted;
}

async function confirmRiskyTool(mainWindow, tool, args) {
  const options = {
    type: tool.safety === 'dangerous' ? 'warning' : 'question',
    buttons: ['Cancel', 'Allow'],
    defaultId: 0,
    cancelId: 0,
    title: `Allow Brightlens tool: ${tool.name}?`,
    message: `Brightlens wants to run: ${tool.name}`,
    detail: JSON.stringify(args, null, 2),
  };
  const result = mainWindow && !mainWindow.isDestroyed()
    ? await dialog.showMessageBox(mainWindow, options)
    : await dialog.showMessageBox(options);

  return result.response === 1;
}

function restoreWindowAfterCapture() {
  if (!win || win.isDestroyed()) {
    captureInProgress = false;
    return;
  }

  if (restoreTimer) {
    clearTimeout(restoreTimer);
    restoreTimer = null;
  }

  if (!win.isVisible()) {
    win.show();
  }

  win.focus();
  captureInProgress = false;
}

function createWindow() {
  win = new BrowserWindow({
    width: 450,
    height: 750,
    frame: false,
    transparent: true,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (isTrustedUrl(url)) {
      return;
    }

    event.preventDefault();
    if (/^https?:/i.test(url)) {
      void shell.openExternal(url);
    }
  });

  const loadRenderer = app.isPackaged
    ? win.loadFile(PRODUCTION_RENDERER_FILE)
    : win.loadURL(DEV_RENDERER_URL);
  void loadRenderer.catch((error) => {
    console.error('Could not load the Brightlens renderer:', error);
  });

  // Intercept the close event to hide the window instead
  win.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      win.hide();
    }
  });
}

app.whenReady().then(async () => {
  await initializeReminders();
  createWindow();

  try {
    const trayImage = nativeImage.createFromPath(TRAY_ICON_PATH);
    if (trayImage.isEmpty()) {
      throw new Error(`Could not load ${TRAY_ICON_PATH}`);
    }
    tray = new Tray(trayImage.resize({ width: 16, height: 16 }));
  } catch (error) {
    console.error('Tray icon could not be loaded, using a fallback:', error.message);
    const base64Icon = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAANSURBVBhXY3jP4PgfAAWgA2Hn+rM8AAAAAElFTkSuQmCC';
    tray = new Tray(nativeImage.createFromDataURL(base64Icon));
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Brightlens',
      click: () => {
        if (win) {
          win.show();
          win.focus();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('Brightlens AI');
  tray.setContextMenu(contextMenu);

  // Toggle window on single left-click
  tray.on('click', () => {
    if (win) {
      if (win.isVisible()) {
        win.hide();
      } else {
        win.show();
        win.focus();
      }
    }
  });

  ipcMain.on('SCREEN_CAPTURE_DONE', (event) => {
    if (!isTrustedIpcEvent(event)) return;
    restoreWindowAfterCapture();
  });

  ipcMain.on('close-app', (event) => {
    if (!isTrustedIpcEvent(event)) return;
    if (win) {
      win.close();
    }
  });

  ipcMain.on('minimize-app', (event) => {
    if (!isTrustedIpcEvent(event)) return;
    if (win) {
      win.minimize();
    }
  });

  ipcMain.on('maximize-app', (event) => {
    if (!isTrustedIpcEvent(event)) return;
    if (win) {
      if (win.isMaximized()) {
        win.unmaximize();
      } else {
        win.maximize();
      }
    }
  });

  ipcMain.handle('miniJarvis:runCommand', async (event, userCommand) => {
    if (!isTrustedIpcEvent(event)) {
      return {
        ok: false,
        handled: true,
        message: 'Blocked request from an untrusted renderer.',
      };
    }

    const command = String(userCommand || '').trim();
    if (!command) {
      return {
        ok: false,
        handled: false,
        message: 'Tell me what you want to do.',
      };
    }

    try {
      const senderWindow = BrowserWindow.fromWebContents(event.sender);
      const toolCalls = await planToolCalls(command);

      if (toolCalls.length === 0) {
        return {
          ok: false,
          handled: false,
          message: 'I could not match that request to a desktop action.',
        };
      }

      const results = [];

      for (const toolCall of toolCalls) {
        const validation = validateToolCall(toolCall);
        if (!validation.ok) {
          await logToolAction({
            event: 'validation_rejected',
            tool: toolCall?.name || toolCall?.function?.name || 'unknown',
            result: { ok: false, error: validation.reason },
          });
          results.push({
            ok: false,
            error: validation.reason,
            toolCall,
          });
          break;
        }

        const { tool, args } = validation;
        await logToolAction({
          event: 'validated',
          tool: tool.name,
          safety: tool.safety,
          args,
        });
        if (requiresConfirmation(tool)) {
          const allowed = await confirmRiskyTool(senderWindow, tool, args);
          await logToolAction({
            event: 'confirmation_result',
            tool: tool.name,
            safety: tool.safety,
            args,
            result: {
              ok: allowed,
              cancelled: !allowed,
              message: allowed ? 'Allowed by user.' : 'Cancelled by user.',
            },
          });
          if (!allowed) {
            logAction({ tool: tool.name, args, cancelled: true });
            results.push({
              ok: false,
              cancelled: true,
              tool: tool.name,
            });
            break;
          }
        }

        try {
          const result = await executeTool(tool.name, args);
          logAction({ tool: tool.name, args, result });
          await logToolAction({
            event: 'execution_completed',
            tool: tool.name,
            safety: tool.safety,
            args,
            result,
          });
          results.push({ tool: tool.name, result });
          if (result?.ok !== true) {
            break;
          }
        } catch (error) {
          await logToolAction({
            event: 'execution_failed',
            tool: tool.name,
            safety: tool.safety,
            args,
            result: {
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            },
          });
          results.push({
            ok: false,
            tool: tool.name,
            error: error instanceof Error ? error.message : String(error),
          });
          break;
        }
      }

      return {
        ok: (
          results.length === toolCalls.length
          && results.every((entry) => entry.result?.ok === true)
        ),
        handled: true,
        results,
      };
    } catch (error) {
      console.error('Mini-Jarvis command failed:', error);
      return {
        ok: false,
        handled: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  });

  const doScreenCapture = async () => {
    if (!win || win.isDestroyed() || captureInProgress) {
      return;
    }

    captureInProgress = true;

    if (win.isVisible()) {
      win.hide();
    }

    // Keep the app hidden while the renderer grabs the frame.
    restoreTimer = setTimeout(() => {
      restoreWindowAfterCapture();
    }, 4000);

    try {
      setTimeout(async () => {
        try {
          const sources = await desktopCapturer.getSources({
            types: ['screen']
          });

          if (!sources.length) {
            restoreWindowAfterCapture();
            return;
          }

          // Send screenshot source to frontend while app window is hidden.
          win.webContents.send('SCREEN_CAPTURE', sources[0]);
        } catch (error) {
          console.error('Screen source fetch failed:', error);
          restoreWindowAfterCapture();
        }
      }, 180);
    } catch (error) {
      console.error('Screen capture start failed:', error);
      restoreWindowAfterCapture();
    }
  };

  // 🔥 Global hotkeys
  globalShortcut.register('CommandOrControl+Shift+S', doScreenCapture);

  globalShortcut.register('CommandOrControl+O', () => {
    if (!win || win.isDestroyed()) return;
    
    // If it is visible and currently active/focused, hide it
    if (win.isVisible() && !win.isMinimized() && win.isFocused()) {
      win.hide();
    } else {
      // Otherwise, restore/show it
      if (!win.isVisible()) {
        win.show();
      }
      if (win.isMinimized()) {
        win.restore();
      }
      win.focus();
    }
  });

  ipcMain.on('REQUEST_SCREEN_CAPTURE', (event) => {
    if (!isTrustedIpcEvent(event)) return;
    void doScreenCapture();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
