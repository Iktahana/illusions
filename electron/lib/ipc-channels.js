/**
 * Shared IPC channel-name constants (#1434).
 *
 * Single source of truth for channel names, consumed by BOTH sides of the
 * bridge so the renderer/main contract cannot drift:
 * - preload (electron/preload.js) — ipcRenderer.invoke / ipcRenderer.send / ipcRenderer.on
 * - main (electron/ipc/*.js, electron/main.js, electron/window-manager.js)
 *   — ipcMain.handle / ipcMain.on / webContents.send
 *
 * Structure per namespace:
 * - `invoke`: request/response channels (ipcRenderer.invoke ↔ ipcMain.handle)
 * - `send`:   fire-and-forget renderer→main channels (ipcRenderer.send ↔ ipcMain.on)
 * - `event`:  push channels (webContents.send → ipcRenderer.on)
 *
 * IMPORTANT: these string values are the public IPC contract. Never rename
 * them; renderer payload semantics are pinned in types/electron.d.ts and the
 * drift test in electron/lib/__tests__/ipc-bridge.test.ts.
 *
 * Special send sites:
 * - MENU_CHANNELS.event values are dispatched data-driven from
 *   lib/menu/menu-template.js (`electronChannel` fields) through the generic
 *   dispatcher in electron/menu.js. menu-template.js stays literal-based
 *   because it is shared with the Next.js renderer; the drift test pins the
 *   literals against these constants instead.
 */

const STORAGE_CHANNELS = Object.freeze({
  invoke: Object.freeze({
    saveSession: "storage:save-session",
    loadSession: "storage:load-session",
    saveAppState: "storage:save-app-state",
    loadAppState: "storage:load-app-state",
    // Atomically merges a partial AppState in the main process and returns the
    // canonical persisted snapshot. This avoids renderer-to-renderer TOCTOU
    // races when more than one window updates preferences.
    updateAppState: "storage:update-app-state",
    addToRecent: "storage:add-to-recent",
    getRecentFiles: "storage:get-recent-files",
    removeFromRecent: "storage:remove-from-recent",
    clearRecent: "storage:clear-recent",
    saveEditorBuffer: "storage:save-editor-buffer",
    loadEditorBuffer: "storage:load-editor-buffer",
    clearEditorBuffer: "storage:clear-editor-buffer",
    clearAll: "storage:clear-all",
    addRecentProject: "storage:add-recent-project",
    getRecentProjects: "storage:get-recent-projects",
    removeRecentProject: "storage:remove-recent-project",
    setItem: "storage:set-item",
    getItem: "storage:get-item",
    removeItem: "storage:remove-item",
    getKeysByPrefix: "storage:get-keys-by-prefix",
  }),
  event: Object.freeze({
    // Canonical snapshot emitted after every successful updateAppState write.
    appStateUpdated: "storage:app-state-updated",
  }),
});

const DICT_CHANNELS = Object.freeze({
  invoke: Object.freeze({
    query: "dict:query",
    queryReading: "dict:query-reading",
    lookupBatch: "dict:lookup-batch",
    verify: "dict:verify",
    getStatus: "dict:get-status",
    checkUpdate: "dict:check-update",
    download: "dict:download",
  }),
  event: Object.freeze({
    downloadProgress: "dict:download-progress",
    updateAvailable: "dict:update-available",
  }),
});

// open/save/pending-file + system file-association pushes (electron/ipc/file-ipc.js)
const FILE_CHANNELS = Object.freeze({
  invoke: Object.freeze({
    openFile: "open-file",
    saveFile: "save-file",
    getPendingFile: "get-pending-file",
    readStandaloneFile: "read-standalone-file",
  }),
  event: Object.freeze({
    openFileFromSystem: "open-file-from-system",
    openAsProject: "open-as-project",
  }),
});

// Document export / print (electron/ipc/file-ipc.js)
const EXPORT_CHANNELS = Object.freeze({
  invoke: Object.freeze({
    generatePdfPreview: "generate-pdf-preview",
    cancelPdfPreview: "cancel-pdf-preview",
    generateHtmlPreview: "generate-html-preview",
    exportHtml: "export-html",
    exportMdiText: "export-mdi-text",
    copyMdiText: "copy-mdi-text",
    exportPdf: "export-pdf",
    exportEpub: "export-epub",
    exportDocx: "export-docx",
    printDocument: "print-document",
  }),
  event: Object.freeze({}),
});

// Shell / OS integration (electron/ipc/shell-ipc.js)
const SHELL_CHANNELS = Object.freeze({
  invoke: Object.freeze({
    showInFileManager: "show-in-file-manager",
    revealInFileManager: "reveal-in-file-manager",
    openWithDefaultApp: "open-with-default-app",
    openExternal: "open-external",
    openDictionaryPopup: "open-dictionary-popup",
    showContextMenu: "show-context-menu",
  }),
  event: Object.freeze({}),
});

// System / window lifecycle (electron/ipc/system-ipc.js handles the invokes;
// electron/window-manager.js pushes the close-handshake events)
const SYSTEM_CHANNELS = Object.freeze({
  invoke: Object.freeze({
    getChromeVersion: "get-chrome-version",
    setDirty: "set-dirty",
    saveBeforeCloseDone: "save-before-close-done",
    newWindow: "new-window",
  }),
  send: Object.freeze({
    // #1839: renderer → main one-way signal that a requested close was aborted
    // (save failed / conflict). Lets the quit-and-install flow stop waiting for
    // a window that will not close, instead of hanging.
    closeAborted: "close-aborted",
  }),
  event: Object.freeze({
    requestSaveBeforeClose: "electron-request-save-before-close",
    requestFlushStateBeforeClose: "electron-request-flush-state-before-close",
  }),
});

// Native menu (invokes handled in electron/ipc/system-ipc.js; events are
// dispatched data-driven from lib/menu/menu-template.js via electron/menu.js)
const MENU_CHANNELS = Object.freeze({
  invoke: Object.freeze({
    rebuild: "menu:rebuild",
    syncUiState: "menu:sync-ui-state",
    updateKeymapOverrides: "menu:update-keymap-overrides",
    openSettingsWindow: "menu:open-settings-window",
  }),
  event: Object.freeze({
    newTriggered: "menu-new-triggered",
    openTriggered: "menu-open-triggered",
    saveTriggered: "menu-save-triggered",
    saveAsTriggered: "menu-save-as-triggered",
    closeTab: "menu-close-tab",
    newTab: "menu-new-tab",
    pasteAsPlaintext: "menu-paste-as-plaintext",
    openProject: "menu-open-project",
    openRecentProject: "menu-open-recent-project",
    showInFileManager: "menu-show-in-file-manager",
    toggleCompactMode: "menu-toggle-compact-mode",
    toggleWritingMode: "menu-toggle-writing-mode",
    format: "menu-format",
    theme: "menu-theme",
    print: "menu-print",
    exportHtml: "menu-export-html",
    exportTxt: "menu-export-txt",
    exportTxtRuby: "menu-export-txt-ruby",
    exportNarou: "menu-export-narou",
    exportKakuyomu: "menu-export-kakuyomu",
    exportAozora: "menu-export-aozora",
    exportNote: "menu-export-note",
    copyTxt: "menu-copy-txt",
    copyTxtRuby: "menu-copy-txt-ruby",
    copyNarou: "menu-copy-narou",
    copyKakuyomu: "menu-copy-kakuyomu",
    copyAozora: "menu-copy-aozora",
    copyNote: "menu-copy-note",
    exportPdf: "menu-export-pdf",
    exportEpub: "menu-export-epub",
    exportDocx: "menu-export-docx",
    reportBug: "menu-report-bug",
    reportAiInappropriate: "menu-report-ai-inappropriate",
    openSettings: "menu-open-settings",
  }),
});

// Virtual file system (electron/ipc/vfs-ipc.js)
const VFS_CHANNELS = Object.freeze({
  invoke: Object.freeze({
    openDirectory: "vfs:open-directory",
    openFile: "vfs:open-file",
    setRoot: "vfs:set-root",
    readFile: "vfs:read-file",
    writeFile: "vfs:write-file",
    readDirectory: "vfs:read-directory",
    stat: "vfs:stat",
    exists: "vfs:exists",
    mkdir: "vfs:mkdir",
    delete: "vfs:delete",
    rename: "vfs:rename",
    indexLockAcquire: "vfs:index-lock:acquire",
    indexLockRelease: "vfs:index-lock:release",
  }),
  event: Object.freeze({}),
});

// OAuth login (electron/ipc/auth-ipc.js)
const AUTH_CHANNELS = Object.freeze({
  invoke: Object.freeze({
    startLogin: "auth:start-login",
    exchangeCode: "auth:exchange-code",
    refreshToken: "auth:refresh-token",
    getUserInfo: "auth:get-userinfo",
    logout: "auth:logout",
  }),
  event: Object.freeze({
    callback: "auth:callback",
  }),
});

// safeStorage encryption (electron/ipc/system-ipc.js)
const SAFE_STORAGE_CHANNELS = Object.freeze({
  invoke: Object.freeze({
    encrypt: "safe-storage:encrypt",
    decrypt: "safe-storage:decrypt",
    isAvailable: "safe-storage:is-available",
  }),
  event: Object.freeze({}),
});

// Usage analytics / Aptabase (electron/ipc/analytics-ipc.js)
const ANALYTICS_CHANNELS = Object.freeze({
  invoke: Object.freeze({
    trackEvent: "analytics:track-event",
  }),
  event: Object.freeze({}),
});

const ERROR_REPORTING_CHANNELS = Object.freeze({
  invoke: Object.freeze({
    captureRendererError: "error-reporting:capture-renderer-error",
  }),
  event: Object.freeze({}),
});

// Power monitoring (invoke in electron/ipc/system-ipc.js; event pushed from
// electron/window-manager.js)
const POWER_CHANNELS = Object.freeze({
  invoke: Object.freeze({
    getState: "power:get-state",
  }),
  event: Object.freeze({
    stateChanged: "power:state-changed",
    /** Fired when the system resumes from sleep/suspend. */
    resumed: "power:resumed",
    /** Fired when the system is about to suspend (sleep). */
    suspended: "power:suspended",
    /** Fired when the screen is locked. */
    lockScreen: "power:lock-screen",
  }),
});

// Editor popout / multi-window buffer sync (electron/ipc/editor-ipc.js)
const EDITOR_CHANNELS = Object.freeze({
  invoke: Object.freeze({
    popoutPanel: "editor:popout-panel",
  }),
  send: Object.freeze({
    bufferSync: "editor:buffer-sync",
    bufferClose: "editor:buffer-close",
  }),
  event: Object.freeze({
    bufferSyncBroadcast: "editor:buffer-sync-broadcast",
    bufferCloseBroadcast: "editor:buffer-close-broadcast",
  }),
});

// Morphological analysis (electron/ipc/nlp-ipc.js)
const NLP_CHANNELS = Object.freeze({
  invoke: Object.freeze({
    init: "nlp:init",
    tokenizeParagraph: "nlp:tokenize-paragraph",
    tokenizeDocument: "nlp:tokenize-document",
    analyzeWordFrequency: "nlp:analyze-word-frequency",
  }),
  event: Object.freeze({
    tokenizeProgress: "nlp:tokenize-progress",
  }),
});

// Auto-update channel control (electron/ipc/system-ipc.js)
const UPDATE_CHANNELS = Object.freeze({
  invoke: Object.freeze({
    reevaluateChannel: "update:reevaluate-channel",
  }),
  event: Object.freeze({}),
});

// Official校正ルールセットの自動DL/更新 (electron/ipc/rulesets-ipc.js)
const RULESETS_CHANNELS = Object.freeze({
  invoke: Object.freeze({
    listInstalled: "rulesets:list-installed",
    sync: "rulesets:sync",
    checkUpdate: "rulesets:check-update",
    readModule: "rulesets:read-module",
    uninstall: "rulesets:uninstall",
  }),
  event: Object.freeze({
    syncProgress: "rulesets:sync-progress",
    changed: "rulesets:changed",
  }),
});

// Integrated terminal PTY sessions (electron/ipc/pty-ipc.js)
const PTY_CHANNELS = Object.freeze({
  invoke: Object.freeze({
    spawn: "pty:spawn",
    attach: "pty:attach",
    write: "pty:write",
    resize: "pty:resize",
    kill: "pty:kill",
    status: "pty:status",
  }),
  event: Object.freeze({
    data: "pty:data",
    exit: "pty:exit",
  }),
});

module.exports = {
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
};
