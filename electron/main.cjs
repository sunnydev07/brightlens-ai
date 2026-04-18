const { app, BrowserWindow, globalShortcut, desktopCapturer } = require('electron');
const path = require('path');

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 400,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  win.loadURL('http://localhost:5173');
}

app.whenReady().then(() => {
  createWindow();

  // 🔥 Global hotkey
  globalShortcut.register('CommandOrControl+Shift+S', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen']
    });

    // Send screenshot to frontend
    win.webContents.send('SCREEN_CAPTURE', sources[0]);
  });
});