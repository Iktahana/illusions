// Electron の preload スクリプト
// レンダラへ最小限かつ安全なAPIだけを公開する

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  openFile: () => ipcRenderer.invoke('open-file'),
  saveFile: (filePath, content, fileType) => ipcRenderer.invoke('save-file', filePath, content, fileType),
  getChromeVersion: () => ipcRenderer.invoke('get-chrome-version'),
  setDirty: (dirty) => ipcRenderer.invoke('set-dirty', dirty),
  saveDoneAndClose: () => ipcRenderer.invoke('save-before-close-done'),
  newWindow: () => ipcRenderer.invoke('new-window'),
  openDictionaryPopup: (url, title) => ipcRenderer.invoke('open-dictionary-popup', url, title),
  showContextMenu: (items) => ipcRenderer.invoke('show-context-menu', items),
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
  onMenuCloseTab: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('menu-close-tab', handler)
    return () => ipcRenderer.removeListener('menu-close-tab', handler)
  },
  onMenuNewTab: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('menu-new-tab', handler)
    return () => ipcRenderer.removeListener('menu-new-tab', handler)
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
  onOpenAsProject: (callback) => {
    const handler = (_event, payload) => callback(payload)
    ipcRenderer.on('open-as-project', handler)
    return () => ipcRenderer.removeListener('open-as-project', handler)
  },
  getPendingFile: () => ipcRenderer.invoke('get-pending-file'),
  onPasteAsPlaintext: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('menu-paste-as-plaintext', handler)
    return () => ipcRenderer.removeListener('menu-paste-as-plaintext', handler)
  },
  showInFileManager: (dirPath) => ipcRenderer.invoke('show-in-file-manager', dirPath),
  revealInFileManager: (filePath) => ipcRenderer.invoke('reveal-in-file-manager', filePath),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  onMenuOpenProject: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('menu-open-project', handler)
    return () => ipcRenderer.removeListener('menu-open-project', handler)
  },
  onMenuOpenRecentProject: (callback) => {
    const handler = (_event, projectId) => callback(projectId)
    ipcRenderer.on('menu-open-recent-project', handler)
    return () => ipcRenderer.removeListener('menu-open-recent-project', handler)
  },
  rebuildMenu: () => ipcRenderer.invoke('menu:rebuild'),
  syncMenuUiState: (state) => ipcRenderer.invoke('menu:sync-ui-state', state),
  onMenuShowInFileManager: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('menu-show-in-file-manager', handler)
    return () => ipcRenderer.removeListener('menu-show-in-file-manager', handler)
  },
  onToggleCompactMode: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('menu-toggle-compact-mode', handler)
    return () => ipcRenderer.removeListener('menu-toggle-compact-mode', handler)
  },
  onFormatChange: (callback) => {
    const handler = (_event, setting, action) => callback(setting, action)
    ipcRenderer.on('menu-format', handler)
    return () => ipcRenderer.removeListener('menu-format', handler)
  },
  onThemeChange: (callback) => {
    const handler = (_event, mode) => callback(mode)
    ipcRenderer.on('menu-theme', handler)
    return () => ipcRenderer.removeListener('menu-theme', handler)
  },
  // Export
  exportPDF: (content, options) => ipcRenderer.invoke('export-pdf', content, options),
  exportEPUB: (content, options) => ipcRenderer.invoke('export-epub', content, options),
  exportDOCX: (content, options) => ipcRenderer.invoke('export-docx', content, options),
  onMenuExportPDF: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('menu-export-pdf', handler)
    return () => ipcRenderer.removeListener('menu-export-pdf', handler)
  },
  onMenuExportEPUB: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('menu-export-epub', handler)
    return () => ipcRenderer.removeListener('menu-export-epub', handler)
  },
  onMenuExportDOCX: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('menu-export-docx', handler)
    return () => ipcRenderer.removeListener('menu-export-docx', handler)
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
  llm: {
    getModels: () => ipcRenderer.invoke('llm:get-models'),
    downloadModel: (modelId) => ipcRenderer.invoke('llm:download-model', modelId),
    deleteModel: (modelId) => ipcRenderer.invoke('llm:delete-model', modelId),
    loadModel: (modelId) => ipcRenderer.invoke('llm:load-model', modelId),
    unloadModel: () => ipcRenderer.invoke('llm:unload-model'),
    isModelLoaded: () => ipcRenderer.invoke('llm:is-model-loaded'),
    infer: (prompt, options) => ipcRenderer.invoke('llm:infer', { prompt, ...options }),
    getStorageUsage: () => ipcRenderer.invoke('llm:get-storage-usage'),
    setIdlingStop: (enabled) => ipcRenderer.invoke('llm:set-idling-stop', { enabled }),
    onDownloadProgress: (callback) => {
      ipcRenderer.on('llm:download-progress', (_event, progress) => callback(progress));
    },
    removeDownloadProgressListener: () => {
      ipcRenderer.removeAllListeners('llm:download-progress');
    },
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
    rename: (oldPath, newPath) => ipcRenderer.invoke('vfs:rename', oldPath, newPath),
  },
  safeStorage: {
    encrypt: (plaintext) => ipcRenderer.invoke('safe-storage:encrypt', plaintext),
    decrypt: (base64Cipher) => ipcRenderer.invoke('safe-storage:decrypt', base64Cipher),
    isAvailable: () => ipcRenderer.invoke('safe-storage:is-available'),
  },
  power: {
    onPowerStateChange: (callback) => {
      const handler = (_event, state) => callback(state)
      ipcRenderer.on('power:state-changed', handler)
      return () => ipcRenderer.removeListener('power:state-changed', handler)
    },
    getPowerState: () => ipcRenderer.invoke('power:get-state'),
    removeOnPowerStateChange: () => {
      ipcRenderer.removeAllListeners('power:state-changed')
    },
  },
})
