const { app, BrowserWindow, globalShortcut, desktopCapturer, ipcMain, Tray, Menu, safeStorage } = require('electron');
const path = require('path');
const { fork } = require('child_process');
const fs = require('fs');

let tray = null;
let isQuitting = false;

let win;
let captureInProgress = false;
let restoreTimer = null;

let serverProcess = null;
let backendPort = 5000;
const keysPath = path.join(app.getPath('userData'), 'keys.json');

function startBackend() {
  const serverPath = path.join(__dirname, '../server/index.cjs');
  serverProcess = fork(serverPath, [], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
  });

  serverProcess.on('message', (msg) => {
    if (msg && msg.port) {
      backendPort = msg.port;
      console.log(`Electron main: backend is running on port ${backendPort}`);
    }
  });

  serverProcess.on('exit', (code, signal) => {
    console.log(`Backend exited with code ${code} and signal ${signal}`);
  });
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
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true
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

app.whenReady().then(() => {
  startBackend();
  createWindow();

  // ── Security: Content Security Policy ──────────────────────────────────────
  const { session } = require('electron');
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          `default-src 'self' http://localhost:5173 http://localhost:${backendPort} http://127.0.0.1:${backendPort}; ` +
          `script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:5173; ` +
          `style-src 'self' 'unsafe-inline' http://localhost:5173; ` +
          `img-src 'self' data: blob: http://localhost:5173; ` +
          `connect-src 'self' http://localhost:${backendPort} http://127.0.0.1:${backendPort} http://localhost:5173 ws://localhost:5173; ` +
          `font-src 'self' data: http://localhost:5173`
        ]
      }
    });
  });

  // ── Security: Prevent navigation to arbitrary URLs ─────────────────────────
  app.on('web-contents-created', (event, contents) => {
    contents.on('will-navigate', (event, url) => {
      const allowedOrigins = ['http://localhost:5173', `http://localhost:${backendPort}`, `http://127.0.0.1:${backendPort}`];
      const allowed = allowedOrigins.some(origin => url.startsWith(origin));
      if (!allowed) {
        console.warn('Blocked navigation to:', url);
        event.preventDefault();
      }
    });

    // Block new window creation
    contents.setWindowOpenHandler(({ url }) => {
      console.warn('Blocked new window:', url);
      return { action: 'deny' };
    });
  });


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

  // Dynamic port retrieval
  ipcMain.handle('GET_BACKEND_PORT', () => {
    return backendPort;
  });

  // safeStorage Key handlers
  ipcMain.handle('GET_SECURE_KEYS', () => {
    if (!fs.existsSync(keysPath)) {
      return {};
    }
    try {
      const raw = fs.readFileSync(keysPath, 'utf8');
      const data = JSON.parse(raw);
      const decrypted = {};
      for (const key of ['gemini', 'openrouter', 'nvidia']) {
        if (data[key]) {
          if (safeStorage.isEncryptionAvailable()) {
            decrypted[key] = safeStorage.decryptString(Buffer.from(data[key], 'base64'));
          } else {
            decrypted[key] = Buffer.from(data[key], 'base64').toString('utf8');
          }
        }
      }
      return decrypted;
    } catch (err) {
      console.error('Error loading secure keys:', err);
      return {};
    }
  });

  ipcMain.handle('SAVE_SECURE_KEYS', (_event, keys) => {
    try {
      const encrypted = {};
      for (const key of ['gemini', 'openrouter', 'nvidia']) {
        if (keys[key] !== undefined) {
          if (safeStorage.isEncryptionAvailable() && keys[key]) {
            encrypted[key] = safeStorage.encryptString(keys[key]).toString('base64');
          } else {
            encrypted[key] = Buffer.from(keys[key] || '').toString('base64');
          }
        }
      }
      fs.writeFileSync(keysPath, JSON.stringify(encrypted), 'utf8');
      return { success: true };
    } catch (err) {
      console.error('Error saving secure keys:', err);
      return { success: false, error: err.message };
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (serverProcess) {
    serverProcess.kill();
  }
});