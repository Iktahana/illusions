// Electron preload script.
// Expose a minimal, safe API surface to the renderer.
// Comments in code must be in English.

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  openFile: () => ipcRenderer.invoke('open-file'),
  saveFile: (filePath, content) => ipcRenderer.invoke('save-file', filePath, content),
  getChromeVersion: () => ipcRenderer.invoke('get-chrome-version'),
})

