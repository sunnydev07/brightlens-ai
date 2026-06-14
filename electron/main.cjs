const {
  app,
  BrowserWindow,
  globalShortcut,
  desktopCapturer,
  ipcMain,
  Tray,
  Menu,
  dialog,
} = require('electron');
const path = require('path');
const { planToolCalls } = require('./tools/planner.cjs');
const {
  validateToolCall,
  requiresConfirmation,
} = require('./tools/safety.cjs');
const { executeTool } = require('./tools/executor.cjs');
const { initializeReminders } = require('./tools/reminders.cjs');
const { logToolAction } = require('./tools/actionLog.cjs');

let tray = null;
let isQuitting = false;

let win;
let captureInProgress = false;
let restoreTimer = null;

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
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  win.loadURL('http://localhost:5173');

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

  // Robustly resolve icon path using __dirname, which works for both dev and in app.asar for prod
  const iconPath = path.join(__dirname, '../assets/tray-icon.png');
  try {
    const fs = require('fs');
    if (fs.existsSync(iconPath)) {
      tray = new Tray(iconPath);
    } else {
      throw new Error('File does not exist');
    }
  } catch (error) {
    console.error('Tray icon not found, using an empty image fallback:', error.message);
    const { nativeImage } = require('electron');
    // Using a 1x1 transparent PNG so Windows Tray doesn't crash on empty nativeImage
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

  ipcMain.on('SCREEN_CAPTURE_DONE', () => {
    restoreWindowAfterCapture();
  });

  ipcMain.on('close-app', () => {
    if (win) {
      win.close();
    }
  });

  ipcMain.on('minimize-app', () => {
    if (win) {
      win.minimize();
    }
  });

  ipcMain.on('maximize-app', () => {
    if (win) {
      if (win.isMaximized()) {
        win.unmaximize();
      } else {
        win.maximize();
      }
    }
  });

  ipcMain.handle('miniJarvis:runCommand', async (event, userCommand) => {
    const command = String(userCommand || '').trim();
    if (!command) {
      return { ok: false, message: 'Command is required.' };
    }

    try {
      const senderWindow = BrowserWindow.fromWebContents(event.sender);
      const toolCalls = await planToolCalls(command);

      if (toolCalls.length === 0) {
        return { ok: false, message: 'No matching tool found.' };
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
          continue;
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
            results.push({
              ok: false,
              cancelled: true,
              tool: tool.name,
            });
            continue;
          }
        }

        try {
          const result = await executeTool(tool.name, args);
          await logToolAction({
            event: 'execution_completed',
            tool: tool.name,
            safety: tool.safety,
            args,
            result,
          });
          results.push({ tool: tool.name, result });
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
        }
      }

      return {
        ok: results.some((entry) => entry.result?.ok === true),
        results,
      };
    } catch (error) {
      console.error('Mini-Jarvis command failed:', error);
      return {
        ok: false,
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

  ipcMain.on('REQUEST_SCREEN_CAPTURE', doScreenCapture);
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
