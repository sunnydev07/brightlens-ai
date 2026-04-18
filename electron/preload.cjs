const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onScreenCapture: (callback) => ipcRenderer.on('SCREEN_CAPTURE', callback)
});