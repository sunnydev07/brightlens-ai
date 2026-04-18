const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onScreenCapture: (callback) => ipcRenderer.on('SCREEN_CAPTURE', callback),
  captureDone: () => ipcRenderer.send('SCREEN_CAPTURE_DONE')
});