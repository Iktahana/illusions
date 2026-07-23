// Electron の preload スクリプト
// レンダラへ最小限かつ安全なAPIだけを公開する
//
// #1434: IPC ブリッジは electron/lib/ipc-bridge.js の宣言的ヘルパーで定義する。
// channel 名は electron/lib/ipc-channels.js で main 側と共有され、契約の drift は
// electron/lib/__tests__/ipc-bridge.test.ts が防止する。
// 特殊な wrapper（nlp.tokenizeDocument の requestId フィルタ、
// editor.removeAllListeners）のみ意図的に手書きのまま残す。

const { contextBridge, ipcRenderer } = require("electron");
const { invokeChannel, sendChannel, eventChannel } = require("./lib/ipc-bridge");
const {
  STORAGE_CHANNELS,
  DICT_CHANNELS,
  FILE_CHANNELS,
  EXPORT_CHANNELS,
  SHELL_CHANNELS,
  SYSTEM_CHANNELS,
  MENU_CHANNELS,
  VFS_CHANNELS,
  AUTH_CHANNELS,
  SAFE_STORAGE_CHANNELS,
  ANALYTICS_CHANNELS,
  ERROR_REPORTING_CHANNELS,
  POWER_CHANNELS,
  EDITOR_CHANNELS,
  NLP_CHANNELS,
  PTY_CHANNELS,
  UPDATE_CHANNELS,
  RULESETS_CHANNELS,
} = require("./lib/ipc-channels");

function detectDistributionProvider() {
  if (process.windowsStore === true) return "microsoft-store";
  if (process.mas === true) return "app-store";
  return "direct";
}

function detectReleaseChannel(version) {
  if (/-beta(?:\.|$)/.test(version)) return "beta";
  if (/-dev(?:\.|$)/.test(version)) return "dev";
  if (/-alpha(?:\.|$)/.test(version)) return "alpha";
  return "stable";
}

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,
  appRuntime: {
    distributionProvider: detectDistributionProvider(),
    releaseChannel: detectReleaseChannel(process.env.npm_package_version || "0.0.0"),
    // Development uses an unsigned Electron host. Restoring safeStorage tokens
    // there can synchronously block the main thread in macOS Keychain before
    // the editor finishes booting, so the renderer skips startup auth restore.
    isDevelopment: process.env.ELECTRON_DEV === "1",
  },
  openFile: invokeChannel(FILE_CHANNELS.invoke.openFile, { arity: 0 }),
  saveFile: invokeChannel(FILE_CHANNELS.invoke.saveFile, { arity: 3 }),
  getChromeVersion: invokeChannel(SYSTEM_CHANNELS.invoke.getChromeVersion, { arity: 0 }),
  setDirty: invokeChannel(SYSTEM_CHANNELS.invoke.setDirty, { arity: 1 }),
  // 歴史的命名: flush 完了後にウィンドウを実際に閉じるためのシグナル。
  // Phase 2 で save 経路は消滅したが、close handshake の終端トリガとして引き続き利用する。
  saveDoneAndClose: invokeChannel(SYSTEM_CHANNELS.invoke.saveBeforeCloseDone, { arity: 0 }),
  // #1839: tell main a requested close was aborted (save failed/conflict) so the
  // quit-and-install flow stops waiting for a window that will not close.
  notifyCloseAborted: sendChannel(SYSTEM_CHANNELS.send.closeAborted, { arity: 0 }),
  newWindow: invokeChannel(SYSTEM_CHANNELS.invoke.newWindow, { arity: 0 }),
  reevaluateUpdateChannel: invokeChannel(UPDATE_CHANNELS.invoke.reevaluateChannel, { arity: 0 }),
  openDictionaryPopup: invokeChannel(SHELL_CHANNELS.invoke.openDictionaryPopup, { arity: 2 }),
  showContextMenu: invokeChannel(SHELL_CHANNELS.invoke.showContextMenu, { arity: 1 }),
  onMenuNew: eventChannel(MENU_CHANNELS.event.newTriggered, { arity: 0 }),
  onMenuOpen: eventChannel(MENU_CHANNELS.event.openTriggered, { arity: 0 }),
  onMenuSave: eventChannel(MENU_CHANNELS.event.saveTriggered, { arity: 0 }),
  onMenuSaveAs: eventChannel(MENU_CHANNELS.event.saveAsTriggered, { arity: 0 }),
  onMenuCloseTab: eventChannel(MENU_CHANNELS.event.closeTab, { arity: 0 }),
  onMenuNewTab: eventChannel(MENU_CHANNELS.event.newTab, { arity: 0 }),
  onMenuOpenSettings: eventChannel(MENU_CHANNELS.event.openSettings, { arity: 0 }),
  onSaveBeforeClose: eventChannel(SYSTEM_CHANNELS.event.requestSaveBeforeClose, { arity: 0 }),
  onFlushStateBeforeClose: eventChannel(SYSTEM_CHANNELS.event.requestFlushStateBeforeClose, {
    arity: 0,
  }),
  onOpenFileFromSystem: eventChannel(FILE_CHANNELS.event.openFileFromSystem),
  onOpenAsProject: eventChannel(FILE_CHANNELS.event.openAsProject),
  getPendingFile: invokeChannel(FILE_CHANNELS.invoke.getPendingFile, { arity: 0 }),
  // #1965: re-read a previously-opened standalone file for session restore.
  readStandaloneFile: invokeChannel(FILE_CHANNELS.invoke.readStandaloneFile, { arity: 1 }),
  onPasteAsPlaintext: eventChannel(MENU_CHANNELS.event.pasteAsPlaintext, { arity: 0 }),
  showInFileManager: invokeChannel(SHELL_CHANNELS.invoke.showInFileManager, { arity: 1 }),
  revealInFileManager: invokeChannel(SHELL_CHANNELS.invoke.revealInFileManager, { arity: 1 }),
  openWithDefaultApp: invokeChannel(SHELL_CHANNELS.invoke.openWithDefaultApp, { arity: 1 }),
  openExternal: invokeChannel(SHELL_CHANNELS.invoke.openExternal, { arity: 1 }),
  onMenuOpenProject: eventChannel(MENU_CHANNELS.event.openProject, { arity: 0 }),
  onMenuOpenRecentProject: eventChannel(MENU_CHANNELS.event.openRecentProject),
  rebuildMenu: invokeChannel(MENU_CHANNELS.invoke.rebuild, { arity: 0 }),
  openSettingsWindow: invokeChannel(MENU_CHANNELS.invoke.openSettingsWindow, { arity: 0 }),
  syncMenuUiState: invokeChannel(MENU_CHANNELS.invoke.syncUiState, { arity: 1 }),
  updateKeymapOverrides: invokeChannel(MENU_CHANNELS.invoke.updateKeymapOverrides, { arity: 1 }),
  onMenuShowInFileManager: eventChannel(MENU_CHANNELS.event.showInFileManager, { arity: 0 }),
  onToggleCompactMode: eventChannel(MENU_CHANNELS.event.toggleCompactMode, { arity: 0 }),
  onToggleWritingMode: eventChannel(MENU_CHANNELS.event.toggleWritingMode, { arity: 0 }),
  onFormatChange: eventChannel(MENU_CHANNELS.event.format, { arity: 2 }),
  onThemeChange: eventChannel(MENU_CHANNELS.event.theme),
  // Export
  generatePdfPreview: invokeChannel(EXPORT_CHANNELS.invoke.generatePdfPreview, { arity: 3 }),
  cancelPdfPreview: invokeChannel(EXPORT_CHANNELS.invoke.cancelPdfPreview, { arity: 0 }),
  renderMdiText: invokeChannel(EXPORT_CHANNELS.invoke.renderMdiText, { arity: 4 }),
  exportPDF: invokeChannel(EXPORT_CHANNELS.invoke.exportPdf, { arity: 2 }),
  exportEPUB: invokeChannel(EXPORT_CHANNELS.invoke.exportEpub, { arity: 2 }),
  exportDOCX: invokeChannel(EXPORT_CHANNELS.invoke.exportDocx, { arity: 2 }),
  printDocument: invokeChannel(EXPORT_CHANNELS.invoke.printDocument, { arity: 2 }),
  onMenuPrint: eventChannel(MENU_CHANNELS.event.print, { arity: 0 }),
  onMenuExportTxt: eventChannel(MENU_CHANNELS.event.exportTxt, { arity: 0 }),
  onMenuExportTxtRuby: eventChannel(MENU_CHANNELS.event.exportTxtRuby, { arity: 0 }),
  onMenuExportNarou: eventChannel(MENU_CHANNELS.event.exportNarou, { arity: 0 }),
  onMenuExportKakuyomu: eventChannel(MENU_CHANNELS.event.exportKakuyomu, { arity: 0 }),
  onMenuExportAozora: eventChannel(MENU_CHANNELS.event.exportAozora, { arity: 0 }),
  onMenuExportPDF: eventChannel(MENU_CHANNELS.event.exportPdf, { arity: 0 }),
  onMenuExportEPUB: eventChannel(MENU_CHANNELS.event.exportEpub, { arity: 0 }),
  onMenuExportDOCX: eventChannel(MENU_CHANNELS.event.exportDocx, { arity: 0 }),
  onMenuReportBug: eventChannel(MENU_CHANNELS.event.reportBug, { arity: 0 }),
  onMenuReportAiInappropriate: eventChannel(MENU_CHANNELS.event.reportAiInappropriate, {
    arity: 0,
  }),
  nlp: {
    init: invokeChannel(NLP_CHANNELS.invoke.init, { arity: 1 }),
    tokenizeParagraph: invokeChannel(NLP_CHANNELS.invoke.tokenizeParagraph, { arity: 1 }),
    // 意図的に手書き (#1434): requestId の生成と progress イベントの
    // requestId フィルタリング + finally での listener 解除が必要なため、
    // 宣言的ヘルパーでは表現できない。
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
        ipcRenderer.on(NLP_CHANNELS.event.tokenizeProgress, handler);

        return ipcRenderer
          .invoke(NLP_CHANNELS.invoke.tokenizeDocument, { paragraphs, requestId })
          .finally(() => {
            ipcRenderer.removeListener(NLP_CHANNELS.event.tokenizeProgress, handler);
          });
      }

      return ipcRenderer.invoke(NLP_CHANNELS.invoke.tokenizeDocument, { paragraphs, requestId });
    },
    analyzeWordFrequency: invokeChannel(NLP_CHANNELS.invoke.analyzeWordFrequency, { arity: 1 }),
  },
  storage: {
    saveSession: invokeChannel(STORAGE_CHANNELS.invoke.saveSession, { arity: 1 }),
    loadSession: invokeChannel(STORAGE_CHANNELS.invoke.loadSession, { arity: 0 }),
    saveAppState: invokeChannel(STORAGE_CHANNELS.invoke.saveAppState, { arity: 1 }),
    loadAppState: invokeChannel(STORAGE_CHANNELS.invoke.loadAppState, { arity: 0 }),
    updateAppState: invokeChannel(STORAGE_CHANNELS.invoke.updateAppState, { arity: 1 }),
    onAppStateUpdated: eventChannel(STORAGE_CHANNELS.event.appStateUpdated, { arity: 1 }),
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
    getKeysByPrefix: invokeChannel(STORAGE_CHANNELS.invoke.getKeysByPrefix, { arity: 1 }),
  },
  vfs: {
    openDirectory: invokeChannel(VFS_CHANNELS.invoke.openDirectory, { arity: 0 }),
    openFile: invokeChannel(VFS_CHANNELS.invoke.openFile, { arity: 1 }),
    // #1476: rehydration — projectId added for project-scoped approval persistence
    setRoot: invokeChannel(VFS_CHANNELS.invoke.setRoot, { arity: 2 }),
    readFile: invokeChannel(VFS_CHANNELS.invoke.readFile, { arity: 1 }),
    writeFile: invokeChannel(VFS_CHANNELS.invoke.writeFile, { arity: 2 }),
    readDirectory: invokeChannel(VFS_CHANNELS.invoke.readDirectory, { arity: 1 }),
    stat: invokeChannel(VFS_CHANNELS.invoke.stat, { arity: 1 }),
    exists: invokeChannel(VFS_CHANNELS.invoke.exists, { arity: 1 }),
    mkdir: invokeChannel(VFS_CHANNELS.invoke.mkdir, { arity: 1 }),
    delete: invokeChannel(VFS_CHANNELS.invoke.delete, { arity: 2 }),
    rename: invokeChannel(VFS_CHANNELS.invoke.rename, { arity: 2 }),
    indexLockAcquire: invokeChannel(VFS_CHANNELS.invoke.indexLockAcquire, { arity: 1 }),
    indexLockRelease: invokeChannel(VFS_CHANNELS.invoke.indexLockRelease, { arity: 1 }),
  },
  auth: {
    startLogin: invokeChannel(AUTH_CHANNELS.invoke.startLogin, { arity: 0 }),
    exchangeCode: invokeChannel(AUTH_CHANNELS.invoke.exchangeCode, { arity: 1 }),
    refreshToken: invokeChannel(AUTH_CHANNELS.invoke.refreshToken, { arity: 1 }),
    getUserInfo: invokeChannel(AUTH_CHANNELS.invoke.getUserInfo, { arity: 1 }),
    logout: invokeChannel(AUTH_CHANNELS.invoke.logout, { arity: 0 }),
    onCallback: eventChannel(AUTH_CHANNELS.event.callback),
  },
  safeStorage: {
    encrypt: invokeChannel(SAFE_STORAGE_CHANNELS.invoke.encrypt, { arity: 1 }),
    decrypt: invokeChannel(SAFE_STORAGE_CHANNELS.invoke.decrypt, { arity: 1 }),
    isAvailable: invokeChannel(SAFE_STORAGE_CHANNELS.invoke.isAvailable, { arity: 0 }),
  },
  analytics: {
    // イベント名 + ホワイトリスト化した引数のみを渡す。同意フラグの判定と実送信は
    // main process（electron/ipc/analytics-ipc.js）で行う。
    trackEvent: invokeChannel(ANALYTICS_CHANNELS.invoke.trackEvent, { arity: 2 }),
  },
  errorReporting: {
    captureRendererError: invokeChannel(ERROR_REPORTING_CHANNELS.invoke.captureRendererError, {
      arity: 1,
    }),
  },
  power: {
    // Returns an unsubscribe function that removes ONLY this wrapper.
    // (removeOnPowerStateChange was removed in #1567 S3: it used
    // removeAllListeners, which nuked other components' listeners.)
    onPowerStateChange: eventChannel(POWER_CHANNELS.event.stateChanged),
    getPowerState: invokeChannel(POWER_CHANNELS.invoke.getState, { arity: 0 }),
    /** Fires when the system wakes from sleep (M-1/M-2). */
    onResume: eventChannel(POWER_CHANNELS.event.resumed),
    /** Fires just before the system suspends (M-1/M-2). */
    onSuspend: eventChannel(POWER_CHANNELS.event.suspended),
    /** Fires when the screen is locked (macOS/Windows, M-5). */
    onLockScreen: eventChannel(POWER_CHANNELS.event.lockScreen),
  },
  editor: {
    popoutPanel: invokeChannel(
      EDITOR_CHANNELS.invoke.popoutPanel,
      (bufferId, content, fileName, fileType) => ({ bufferId, content, fileName, fileType }),
    ),
    sendBufferSync: sendChannel(EDITOR_CHANNELS.send.bufferSync, (bufferId, content) => ({
      bufferId,
      content,
    })),
    onBufferSync: eventChannel(EDITOR_CHANNELS.event.bufferSyncBroadcast),
    sendBufferClose: sendChannel(EDITOR_CHANNELS.send.bufferClose, { arity: 1 }),
    onBufferClose: eventChannel(EDITOR_CHANNELS.event.bufferCloseBroadcast),
    // 意図的に手書き (#1434): popout ウィンドウ破棄時に broadcast 系 listener を
    // まとめて全解除する歴史的 API。eventChannel の unsubscribe とは意味が異なる。
    removeAllListeners: () => {
      ipcRenderer.removeAllListeners(EDITOR_CHANNELS.event.bufferSyncBroadcast);
      ipcRenderer.removeAllListeners(EDITOR_CHANNELS.event.bufferCloseBroadcast);
    },
  },
  dict: {
    query: invokeChannel(DICT_CHANNELS.invoke.query, (term, limit) => ({ term, limit })),
    queryByReading: invokeChannel(DICT_CHANNELS.invoke.queryReading, (reading, limit) => ({
      reading,
      limit,
    })),
    lookupBatch: invokeChannel(DICT_CHANNELS.invoke.lookupBatch, (terms, normalize) => ({
      terms,
      normalize,
    })),
    verify: invokeChannel(DICT_CHANNELS.invoke.verify, { arity: 0 }),
    getStatus: invokeChannel(DICT_CHANNELS.invoke.getStatus, { arity: 0 }),
    checkUpdate: invokeChannel(DICT_CHANNELS.invoke.checkUpdate, { arity: 0 }),
    download: invokeChannel(DICT_CHANNELS.invoke.download, { arity: 0 }),
    onDownloadProgress: eventChannel(DICT_CHANNELS.event.downloadProgress),
    onUpdateAvailable: eventChannel(DICT_CHANNELS.event.updateAvailable),
  },
  rulesets: {
    /** List installed (downloaded) official/external rulesets on disk. */
    listInstalled: invokeChannel(RULESETS_CHANNELS.invoke.listInstalled, { arity: 0 }),
    /** Download/update every official ruleset that is missing or out of date. */
    sync: invokeChannel(RULESETS_CHANNELS.invoke.sync, { arity: 0 }),
    /** Check latest release tags vs installed, without downloading. */
    checkUpdate: invokeChannel(RULESETS_CHANNELS.invoke.checkUpdate, { arity: 0 }),
    /** Read a verified ruleset module (code + manifest) for the external loader. */
    readModule: invokeChannel(RULESETS_CHANNELS.invoke.readModule, { arity: 1 }),
    /** Uninstall a third-party ruleset (official/built-in are refused in main). */
    uninstall: invokeChannel(RULESETS_CHANNELS.invoke.uninstall, { arity: 1 }),
    /** Per-ruleset sync progress pushes. */
    onSyncProgress: eventChannel(RULESETS_CHANNELS.event.syncProgress),
    /** Announcement that installed rulesets changed (installed/updated/uninstalled). */
    onChanged: eventChannel(RULESETS_CHANNELS.event.changed),
  },
  pty: {
    /** Spawn a new PTY session. Returns { sessionId } or { error }. */
    spawn: invokeChannel(PTY_CHANNELS.invoke.spawn, { arity: 1 }),
    /** Re-attach to an existing session and retrieve buffered output. */
    attach: invokeChannel(PTY_CHANNELS.invoke.attach, { arity: 1 }),
    /** Write keystroke data to a PTY session. */
    write: invokeChannel(PTY_CHANNELS.invoke.write, (sessionId, data) => ({ sessionId, data })),
    /** Resize the terminal dimensions. */
    resize: invokeChannel(PTY_CHANNELS.invoke.resize, (sessionId, cols, rows) => ({
      sessionId,
      cols,
      rows,
    })),
    /** Kill a PTY session (idempotent). */
    kill: invokeChannel(PTY_CHANNELS.invoke.kill, { arity: 1 }),
    /** Query the state of a PTY session. */
    status: invokeChannel(PTY_CHANNELS.invoke.status, { arity: 1 }),
    /**
     * Listen for PTY output data pushed from main process.
     * Returns a cleanup function that removes the listener.
     * @param {function({ sessionId: string, data: string }): void} callback
     * @returns {() => void}
     */
    onData: eventChannel(PTY_CHANNELS.event.data),
    /**
     * Listen for PTY process exit notification.
     * Returns a cleanup function that removes the listener.
     * @param {function({ sessionId: string, exitCode: number }): void} callback
     * @returns {() => void}
     */
    onExit: eventChannel(PTY_CHANNELS.event.exit),
  },
});
