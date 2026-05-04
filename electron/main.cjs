const { app, BrowserWindow, globalShortcut, desktopCapturer, ipcMain, Tray, Menu } = require('electron');
const path = require('path');

let tray = null;
let isQuitting = false;

let win;
let captureInProgress = false;
let restoreTimer = null;

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

app.whenReady().then(() => {
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