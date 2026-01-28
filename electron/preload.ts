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
  getWorkspaceState: () => ipcRenderer.invoke("get-workspace-state"),
  ai: {
    checkModelExists: (modelName: string) =>
      ipcRenderer.invoke("check-model-exists", modelName),
    listModels: () => ipcRenderer.invoke("list-models"),
    downloadModel: (url: string, modelName: string) =>
      ipcRenderer.invoke("download-model", url, modelName),
    onDownloadProgress: (callback: (data: { percent: number; modelName: string }) => void) => {
      const handler = (_: unknown, data: { percent: number; modelName: string }) =>
        callback(data);
      ipcRenderer.on("model-download-progress", handler);
    },
    initializeAI: (modelName: string) =>
      ipcRenderer.invoke("initialize-ai", modelName),
    proofreadText: (text: string) =>
      ipcRenderer.invoke("proofread-text", text),
  },
});
