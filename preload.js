// Electron preload script.
// Expose a minimal, safe API surface to the renderer.
// Comments in code must be in English.

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  openFile: () => ipcRenderer.invoke('open-file'),
  saveFile: (filePath, content) => ipcRenderer.invoke('save-file', filePath, content),
  getChromeVersion: () => ipcRenderer.invoke('get-chrome-version'),
  setDirty: (dirty) => ipcRenderer.invoke('set-dirty', dirty),
  saveDoneAndClose: () => ipcRenderer.invoke('save-before-close-done'),
  onMenuNew: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('menu-new-triggered', handler)
    return () => ipcRenderer.removeListener('menu-new-triggered', handler)
  },
  onMenuOpen: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('menu-open-triggered', handler)
    return () => ipcRenderer.removeListener('menu-open-triggered', handler)
  },
  onMenuSave: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('menu-save-triggered', handler)
    return () => ipcRenderer.removeListener('menu-save-triggered', handler)
  },
  onMenuSaveAs: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('menu-save-as-triggered', handler)
    return () => ipcRenderer.removeListener('menu-save-as-triggered', handler)
  },
  onSaveBeforeClose: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('electron-request-save-before-close', handler)
    return () => ipcRenderer.removeListener('electron-request-save-before-close', handler)
  },
  onOpenFileFromSystem: (callback) => {
    const handler = (_event, payload) => callback(payload)
    ipcRenderer.on('open-file-from-system', handler)
    return () => ipcRenderer.removeListener('open-file-from-system', handler)
  },
})

