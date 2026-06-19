const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Filter out the IPC event object — only pass data args to renderer
  onScreenCapture: (callback) => ipcRenderer.on('SCREEN_CAPTURE', (_event, ...args) => callback(...args)),
  captureDone: () => ipcRenderer.send('SCREEN_CAPTURE_DONE'),
  requestScreenCapture: () => ipcRenderer.send('REQUEST_SCREEN_CAPTURE'),
  closeApp: () => ipcRenderer.send('close-app'),
  minimizeApp: () => ipcRenderer.send('minimize-app'),
  maximizeApp: () => ipcRenderer.send('maximize-app')
});