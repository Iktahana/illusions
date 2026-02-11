// Electron の preload スクリプト
// レンダラへ最小限かつ安全なAPIだけを公開する

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  openFile: () => ipcRenderer.invoke('open-file'),
  saveFile: (filePath, content) => ipcRenderer.invoke('save-file', filePath, content),
  getChromeVersion: () => ipcRenderer.invoke('get-chrome-version'),
  setDirty: (dirty) => ipcRenderer.invoke('set-dirty', dirty),
  saveDoneAndClose: () => ipcRenderer.invoke('save-before-close-done'),
  newWindow: () => ipcRenderer.invoke('new-window'),
  openDictionaryPopup: (url, title) => ipcRenderer.invoke('open-dictionary-popup', url, title),
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
  onPasteAsPlaintext: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('menu-paste-as-plaintext', handler)
    return () => ipcRenderer.removeListener('menu-paste-as-plaintext', handler)
  },
  showInFileManager: (dirPath) => ipcRenderer.invoke('show-in-file-manager', dirPath),
  onMenuOpenProject: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('menu-open-project', handler)
    return () => ipcRenderer.removeListener('menu-open-project', handler)
  },
  onMenuOpenRecentProject: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('menu-open-recent-project', handler)
    return () => ipcRenderer.removeListener('menu-open-recent-project', handler)
  },
  onMenuShowInFileManager: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('menu-show-in-file-manager', handler)
    return () => ipcRenderer.removeListener('menu-show-in-file-manager', handler)
  },
  nlp: {
    init: (dicPath) => ipcRenderer.invoke('nlp:init', dicPath),
    tokenizeParagraph: (text) => ipcRenderer.invoke('nlp:tokenize-paragraph', text),
    tokenizeDocument: (paragraphs, onProgress) => {
      // Register progress listener if callback provided
      if (onProgress) {
        const handler = (event, progress) => onProgress(progress);
        ipcRenderer.on('nlp:tokenize-progress', handler);

        // Auto-cleanup after 60 seconds
        setTimeout(() => {
          ipcRenderer.removeListener('nlp:tokenize-progress', handler);
        }, 60000);
      }

      return ipcRenderer.invoke('nlp:tokenize-document', { paragraphs });
    },
    analyzeWordFrequency: (text) => ipcRenderer.invoke('nlp:analyze-word-frequency', text),
  },
  storage: {
    saveSession: (session) => ipcRenderer.invoke('storage:save-session', session),
    loadSession: () => ipcRenderer.invoke('storage:load-session'),
    saveAppState: (appState) => ipcRenderer.invoke('storage:save-app-state', appState),
    loadAppState: () => ipcRenderer.invoke('storage:load-app-state'),
    addToRecent: (file) => ipcRenderer.invoke('storage:add-to-recent', file),
    getRecentFiles: () => ipcRenderer.invoke('storage:get-recent-files'),
    removeFromRecent: (path) => ipcRenderer.invoke('storage:remove-from-recent', path),
    clearRecent: () => ipcRenderer.invoke('storage:clear-recent'),
    saveEditorBuffer: (buffer) => ipcRenderer.invoke('storage:save-editor-buffer', buffer),
    loadEditorBuffer: () => ipcRenderer.invoke('storage:load-editor-buffer'),
    clearEditorBuffer: () => ipcRenderer.invoke('storage:clear-editor-buffer'),
    clearAll: () => ipcRenderer.invoke('storage:clear-all'),
    addRecentProject: (project) => ipcRenderer.invoke('storage:add-recent-project', project),
    getRecentProjects: () => ipcRenderer.invoke('storage:get-recent-projects'),
    removeRecentProject: (projectId) => ipcRenderer.invoke('storage:remove-recent-project', projectId),
  },
  vfs: {
    openDirectory: () => ipcRenderer.invoke('vfs:open-directory'),
    setRoot: (rootPath) => ipcRenderer.invoke('vfs:set-root', rootPath),
    readFile: (filePath) => ipcRenderer.invoke('vfs:read-file', filePath),
    writeFile: (filePath, content) => ipcRenderer.invoke('vfs:write-file', filePath, content),
    readDirectory: (dirPath) => ipcRenderer.invoke('vfs:read-directory', dirPath),
    stat: (filePath) => ipcRenderer.invoke('vfs:stat', filePath),
    mkdir: (dirPath) => ipcRenderer.invoke('vfs:mkdir', dirPath),
    delete: (targetPath, options) => ipcRenderer.invoke('vfs:delete', targetPath, options),
  },
})
