/**
 * Electron preload script.
 * Exposes a minimal, safe API to the renderer via contextBridge.
 */

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,
  openFile: () => ipcRenderer.invoke("open-file"),
  saveFile: (filePath: string | null, content: string) =>
    ipcRenderer.invoke("save-file", filePath, content),
  getChromeVersion: () => ipcRenderer.invoke("get-chrome-version"),
  setDirty: (dirty: boolean) => ipcRenderer.invoke("set-dirty", dirty),
  onSaveBeforeClose: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("electron-request-save-before-close", handler);
  },
  saveDoneAndClose: () => ipcRenderer.invoke("save-before-close-done"),
  onOpenFileFromSystem: (
    callback: (payload: { path: string; content: string }) => void
  ) => {
    const handler = (
      _event: unknown,
      payload: { path: string; content: string }
    ) => callback(payload);
    ipcRenderer.on("open-file-from-system", handler);
  },
  onMenuSave: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("menu-save-triggered", handler);
  },
  onMenuSaveAs: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("menu-save-as-triggered", handler);
  },
  storage: {
    saveSession: (session: unknown) =>
      ipcRenderer.invoke("storage:saveSession", session),
    loadSession: () => ipcRenderer.invoke("storage:loadSession"),
    saveAppState: (appState: unknown) =>
      ipcRenderer.invoke("storage:saveAppState", appState),
    loadAppState: () => ipcRenderer.invoke("storage:loadAppState"),
    addToRecent: (file: unknown) =>
      ipcRenderer.invoke("storage:addToRecent", file),
    getRecentFiles: () => ipcRenderer.invoke("storage:getRecentFiles"),
    removeFromRecent: (filePath: string) =>
      ipcRenderer.invoke("storage:removeFromRecent", filePath),
    clearRecent: () => ipcRenderer.invoke("storage:clearRecent"),
    saveEditorBuffer: (buffer: unknown) =>
      ipcRenderer.invoke("storage:saveEditorBuffer", buffer),
    loadEditorBuffer: () => ipcRenderer.invoke("storage:loadEditorBuffer"),
    clearEditorBuffer: () => ipcRenderer.invoke("storage:clearEditorBuffer"),
    clearAll: () => ipcRenderer.invoke("storage:clearAll"),
  },
});
