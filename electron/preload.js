// Electron の preload スクリプト
// レンダラへ最小限かつ安全なAPIだけを公開する

const { contextBridge, ipcRenderer } = require("electron");
const { invokeChannel, eventChannel } = require("./lib/ipc-bridge");
const { STORAGE_CHANNELS, DICT_CHANNELS } = require("./lib/ipc-channels");

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,
  openFile: () => ipcRenderer.invoke("open-file"),
  saveFile: (filePath, content, fileType) =>
    ipcRenderer.invoke("save-file", filePath, content, fileType),
  getChromeVersion: () => ipcRenderer.invoke("get-chrome-version"),
  setDirty: (dirty) => ipcRenderer.invoke("set-dirty", dirty),
  // 歴史的命名: flush 完了後にウィンドウを実際に閉じるためのシグナル。
  // Phase 2 で save 経路は消滅したが、close handshake の終端トリガとして引き続き利用する。
  saveDoneAndClose: () => ipcRenderer.invoke("save-before-close-done"),
  newWindow: () => ipcRenderer.invoke("new-window"),
  openDictionaryPopup: (url, title) => ipcRenderer.invoke("open-dictionary-popup", url, title),
  showContextMenu: (items) => ipcRenderer.invoke("show-context-menu", items),
  onMenuNew: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("menu-new-triggered", handler);
    return () => ipcRenderer.removeListener("menu-new-triggered", handler);
  },
  onMenuOpen: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("menu-open-triggered", handler);
    return () => ipcRenderer.removeListener("menu-open-triggered", handler);
  },
  onMenuSave: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("menu-save-triggered", handler);
    return () => ipcRenderer.removeListener("menu-save-triggered", handler);
  },
  onMenuSaveAs: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("menu-save-as-triggered", handler);
    return () => ipcRenderer.removeListener("menu-save-as-triggered", handler);
  },
  onMenuCloseTab: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("menu-close-tab", handler);
    return () => ipcRenderer.removeListener("menu-close-tab", handler);
  },
  onMenuNewTab: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("menu-new-tab", handler);
    return () => ipcRenderer.removeListener("menu-new-tab", handler);
  },
  onSaveBeforeClose: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("electron-request-save-before-close", handler);
    return () => ipcRenderer.removeListener("electron-request-save-before-close", handler);
  },
  onFlushStateBeforeClose: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("electron-request-flush-state-before-close", handler);
    return () => ipcRenderer.removeListener("electron-request-flush-state-before-close", handler);
  },
  onOpenFileFromSystem: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("open-file-from-system", handler);
    return () => ipcRenderer.removeListener("open-file-from-system", handler);
  },
  onOpenAsProject: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("open-as-project", handler);
    return () => ipcRenderer.removeListener("open-as-project", handler);
  },
  getPendingFile: () => ipcRenderer.invoke("get-pending-file"),
  onPasteAsPlaintext: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("menu-paste-as-plaintext", handler);
    return () => ipcRenderer.removeListener("menu-paste-as-plaintext", handler);
  },
  showInFileManager: (dirPath) => ipcRenderer.invoke("show-in-file-manager", dirPath),
  revealInFileManager: (filePath) => ipcRenderer.invoke("reveal-in-file-manager", filePath),
  openWithDefaultApp: (filePath) => ipcRenderer.invoke("open-with-default-app", filePath),
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
  onMenuOpenProject: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("menu-open-project", handler);
    return () => ipcRenderer.removeListener("menu-open-project", handler);
  },
  onMenuOpenRecentProject: (callback) => {
    const handler = (_event, projectId) => callback(projectId);
    ipcRenderer.on("menu-open-recent-project", handler);
    return () => ipcRenderer.removeListener("menu-open-recent-project", handler);
  },
  rebuildMenu: () => ipcRenderer.invoke("menu:rebuild"),
  syncMenuUiState: (state) => ipcRenderer.invoke("menu:sync-ui-state", state),
  updateKeymapOverrides: (overrides) =>
    ipcRenderer.invoke("menu:update-keymap-overrides", overrides),
  onMenuShowInFileManager: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("menu-show-in-file-manager", handler);
    return () => ipcRenderer.removeListener("menu-show-in-file-manager", handler);
  },
  onToggleCompactMode: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("menu-toggle-compact-mode", handler);
    return () => ipcRenderer.removeListener("menu-toggle-compact-mode", handler);
  },
  onFormatChange: (callback) => {
    const handler = (_event, setting, action) => callback(setting, action);
    ipcRenderer.on("menu-format", handler);
    return () => ipcRenderer.removeListener("menu-format", handler);
  },
  onThemeChange: (callback) => {
    const handler = (_event, mode) => callback(mode);
    ipcRenderer.on("menu-theme", handler);
    return () => ipcRenderer.removeListener("menu-theme", handler);
  },
  // Export
  generatePdfPreview: (content, options) =>
    ipcRenderer.invoke("generate-pdf-preview", content, options),
  exportPDF: (content, options) => ipcRenderer.invoke("export-pdf", content, options),
  exportEPUB: (content, options) => ipcRenderer.invoke("export-epub", content, options),
  exportDOCX: (content, options) => ipcRenderer.invoke("export-docx", content, options),
  printDocument: (content, options) => ipcRenderer.invoke("print-document", content, options),
  onMenuPrint: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("menu-print", handler);
    return () => ipcRenderer.removeListener("menu-print", handler);
  },
  onMenuExportTxt: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("menu-export-txt", handler);
    return () => ipcRenderer.removeListener("menu-export-txt", handler);
  },
  onMenuExportTxtRuby: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("menu-export-txt-ruby", handler);
    return () => ipcRenderer.removeListener("menu-export-txt-ruby", handler);
  },
  onMenuExportPDF: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("menu-export-pdf", handler);
    return () => ipcRenderer.removeListener("menu-export-pdf", handler);
  },
  onMenuExportEPUB: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("menu-export-epub", handler);
    return () => ipcRenderer.removeListener("menu-export-epub", handler);
  },
  onMenuExportDOCX: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("menu-export-docx", handler);
    return () => ipcRenderer.removeListener("menu-export-docx", handler);
  },
  nlp: {
    init: (dicPath) => ipcRenderer.invoke("nlp:init", dicPath),
    tokenizeParagraph: (text) => ipcRenderer.invoke("nlp:tokenize-paragraph", text),
    tokenizeDocument: (paragraphs, onProgress) => {
      // Generate a unique requestId so parallel calls don't interfere with each other
      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      if (onProgress) {
        // Only forward progress events that belong to this specific request
        const handler = (_event, progress) => {
          if (progress.requestId === requestId) {
            onProgress(progress);
          }
        };
        ipcRenderer.on("nlp:tokenize-progress", handler);

        return ipcRenderer
          .invoke("nlp:tokenize-document", { paragraphs, requestId })
          .finally(() => {
            ipcRenderer.removeListener("nlp:tokenize-progress", handler);
          });
      }

      return ipcRenderer.invoke("nlp:tokenize-document", { paragraphs, requestId });
    },
    analyzeWordFrequency: (text) => ipcRenderer.invoke("nlp:analyze-word-frequency", text),
  },
  // #1434: declarative bridge — channel names shared with electron/ipc/storage-ipc.js
  storage: {
    saveSession: invokeChannel(STORAGE_CHANNELS.invoke.saveSession, { arity: 1 }),
    loadSession: invokeChannel(STORAGE_CHANNELS.invoke.loadSession, { arity: 0 }),
    saveAppState: invokeChannel(STORAGE_CHANNELS.invoke.saveAppState, { arity: 1 }),
    loadAppState: invokeChannel(STORAGE_CHANNELS.invoke.loadAppState, { arity: 0 }),
    addToRecent: invokeChannel(STORAGE_CHANNELS.invoke.addToRecent, { arity: 1 }),
    getRecentFiles: invokeChannel(STORAGE_CHANNELS.invoke.getRecentFiles, { arity: 0 }),
    removeFromRecent: invokeChannel(STORAGE_CHANNELS.invoke.removeFromRecent, { arity: 1 }),
    clearRecent: invokeChannel(STORAGE_CHANNELS.invoke.clearRecent, { arity: 0 }),
    saveEditorBuffer: invokeChannel(STORAGE_CHANNELS.invoke.saveEditorBuffer, { arity: 1 }),
    loadEditorBuffer: invokeChannel(STORAGE_CHANNELS.invoke.loadEditorBuffer, { arity: 0 }),
    clearEditorBuffer: invokeChannel(STORAGE_CHANNELS.invoke.clearEditorBuffer, { arity: 0 }),
    clearAll: invokeChannel(STORAGE_CHANNELS.invoke.clearAll, { arity: 0 }),
    addRecentProject: invokeChannel(STORAGE_CHANNELS.invoke.addRecentProject, { arity: 1 }),
    getRecentProjects: invokeChannel(STORAGE_CHANNELS.invoke.getRecentProjects, { arity: 0 }),
    removeRecentProject: invokeChannel(STORAGE_CHANNELS.invoke.removeRecentProject, { arity: 1 }),
    setItem: invokeChannel(STORAGE_CHANNELS.invoke.setItem, { arity: 2 }),
    getItem: invokeChannel(STORAGE_CHANNELS.invoke.getItem, { arity: 1 }),
    removeItem: invokeChannel(STORAGE_CHANNELS.invoke.removeItem, { arity: 1 }),
  },
  vfs: {
    openDirectory: () => ipcRenderer.invoke("vfs:open-directory"),
    openFile: (opts) => ipcRenderer.invoke("vfs:open-file", opts),
    // #1476: rehydration — projectId added for project-scoped approval persistence
    setRoot: (rootPath, projectId) => ipcRenderer.invoke("vfs:set-root", rootPath, projectId),
    readFile: (filePath) => ipcRenderer.invoke("vfs:read-file", filePath),
    writeFile: (filePath, content) => ipcRenderer.invoke("vfs:write-file", filePath, content),
    readDirectory: (dirPath) => ipcRenderer.invoke("vfs:read-directory", dirPath),
    stat: (filePath) => ipcRenderer.invoke("vfs:stat", filePath),
    exists: (filePath) => ipcRenderer.invoke("vfs:exists", filePath),
    mkdir: (dirPath) => ipcRenderer.invoke("vfs:mkdir", dirPath),
    delete: (targetPath, options) => ipcRenderer.invoke("vfs:delete", targetPath, options),
    rename: (oldPath, newPath) => ipcRenderer.invoke("vfs:rename", oldPath, newPath),
    indexLockAcquire: (key) => ipcRenderer.invoke("vfs:index-lock:acquire", key),
    indexLockRelease: (key) => ipcRenderer.invoke("vfs:index-lock:release", key),
  },
  auth: {
    startLogin: () => ipcRenderer.invoke("auth:start-login"),
    exchangeCode: (params) => ipcRenderer.invoke("auth:exchange-code", params),
    refreshToken: (refreshToken) => ipcRenderer.invoke("auth:refresh-token", refreshToken),
    getUserInfo: (accessToken) => ipcRenderer.invoke("auth:get-userinfo", accessToken),
    logout: () => ipcRenderer.invoke("auth:logout"),
    onCallback: (callback) => {
      const handler = (_event, data) => callback(data);
      ipcRenderer.on("auth:callback", handler);
      return () => ipcRenderer.removeListener("auth:callback", handler);
    },
  },
  safeStorage: {
    encrypt: (plaintext) => ipcRenderer.invoke("safe-storage:encrypt", plaintext),
    decrypt: (base64Cipher) => ipcRenderer.invoke("safe-storage:decrypt", base64Cipher),
    isAvailable: () => ipcRenderer.invoke("safe-storage:is-available"),
  },
  power: {
    // Returns an unsubscribe function that removes ONLY this wrapper.
    // (removeOnPowerStateChange was removed in #1567 S3: it used
    // removeAllListeners, which nuked other components' listeners.)
    onPowerStateChange: (callback) => {
      const handler = (_event, state) => callback(state);
      ipcRenderer.on("power:state-changed", handler);
      return () => ipcRenderer.removeListener("power:state-changed", handler);
    },
    getPowerState: () => ipcRenderer.invoke("power:get-state"),
  },
  editor: {
    popoutPanel: (bufferId, content, fileName, fileType) =>
      ipcRenderer.invoke("editor:popout-panel", { bufferId, content, fileName, fileType }),
    sendBufferSync: (bufferId, content) =>
      ipcRenderer.send("editor:buffer-sync", { bufferId, content }),
    onBufferSync: (callback) => {
      const handler = (_event, data) => callback(data);
      ipcRenderer.on("editor:buffer-sync-broadcast", handler);
      return () => ipcRenderer.removeListener("editor:buffer-sync-broadcast", handler);
    },
    sendBufferClose: (bufferId) => ipcRenderer.send("editor:buffer-close", bufferId),
    onBufferClose: (callback) => {
      const handler = (_event, bufferId) => callback(bufferId);
      ipcRenderer.on("editor:buffer-close-broadcast", handler);
      return () => ipcRenderer.removeListener("editor:buffer-close-broadcast", handler);
    },
    removeAllListeners: () => {
      ipcRenderer.removeAllListeners("editor:buffer-sync-broadcast");
      ipcRenderer.removeAllListeners("editor:buffer-close-broadcast");
    },
  },
  // #1434: declarative bridge — channel names shared with electron/ipc/dict-ipc.js
  dict: {
    query: invokeChannel(DICT_CHANNELS.invoke.query, (term, limit) => ({ term, limit })),
    queryByReading: invokeChannel(DICT_CHANNELS.invoke.queryReading, (reading, limit) => ({
      reading,
      limit,
    })),
    getStatus: invokeChannel(DICT_CHANNELS.invoke.getStatus, { arity: 0 }),
    checkUpdate: invokeChannel(DICT_CHANNELS.invoke.checkUpdate, { arity: 0 }),
    download: invokeChannel(DICT_CHANNELS.invoke.download, { arity: 0 }),
    onDownloadProgress: eventChannel(DICT_CHANNELS.event.downloadProgress),
    onUpdateAvailable: eventChannel(DICT_CHANNELS.event.updateAvailable),
  },
  pty: {
    /** Spawn a new PTY session. Returns { sessionId } or { error }. */
    spawn: (options) => ipcRenderer.invoke("pty:spawn", options),
    /** Re-attach to an existing session and retrieve buffered output. */
    attach: (sessionId) => ipcRenderer.invoke("pty:attach", sessionId),
    /** Write keystroke data to a PTY session. */
    write: (sessionId, data) => ipcRenderer.invoke("pty:write", { sessionId, data }),
    /** Resize the terminal dimensions. */
    resize: (sessionId, cols, rows) => ipcRenderer.invoke("pty:resize", { sessionId, cols, rows }),
    /** Kill a PTY session (idempotent). */
    kill: (sessionId) => ipcRenderer.invoke("pty:kill", sessionId),
    /** Query the state of a PTY session. */
    status: (sessionId) => ipcRenderer.invoke("pty:status", sessionId),
    /**
     * Listen for PTY output data pushed from main process.
     * Returns a cleanup function that removes the listener.
     * @param {function({ sessionId: string, data: string }): void} callback
     * @returns {() => void}
     */
    onData: (callback) => {
      const handler = (_event, payload) => callback(payload);
      ipcRenderer.on("pty:data", handler);
      return () => ipcRenderer.removeListener("pty:data", handler);
    },
    /**
     * Listen for PTY process exit notification.
     * Returns a cleanup function that removes the listener.
     * @param {function({ sessionId: string, exitCode: number }): void} callback
     * @returns {() => void}
     */
    onExit: (callback) => {
      const handler = (_event, payload) => callback(payload);
      ipcRenderer.on("pty:exit", handler);
      return () => ipcRenderer.removeListener("pty:exit", handler);
    },
  },
});
