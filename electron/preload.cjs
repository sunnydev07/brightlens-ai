const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onScreenCapture: (callback) => ipcRenderer.on('SCREEN_CAPTURE', callback),
  captureDone: () => ipcRenderer.send('SCREEN_CAPTURE_DONE'),
  requestScreenCapture: () => ipcRenderer.send('REQUEST_SCREEN_CAPTURE'),
  closeApp: () => ipcRenderer.send('close-app'),
  minimizeApp: () => ipcRenderer.send('minimize-app'),
  maximizeApp: () => ipcRenderer.send('maximize-app')
});