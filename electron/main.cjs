const { app, BrowserWindow, globalShortcut, desktopCapturer, ipcMain } = require('electron');
const path = require('path');

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
}

app.whenReady().then(() => {
  createWindow();

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

  // 🔥 Global hotkey
  globalShortcut.register('CommandOrControl+Shift+S', doScreenCapture);

  ipcMain.on('REQUEST_SCREEN_CAPTURE', doScreenCapture);
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});