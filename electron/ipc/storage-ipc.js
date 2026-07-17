/**
 * Storage IPC ハンドラー
 * ElectronStorageManager を使い、レンダラからの IPC 呼び出しに応答する
 */

const { ipcMain, BrowserWindow } = require("electron");
const { STORAGE_CHANNELS } = require("../lib/ipc-channels");
const { isDev } = require("../app-constants");

let storageManager = null;
// Serializes main-process read/merge/write transactions. Renderer requests can
// arrive concurrently from multiple windows, so a renderer-local mutex is not
// sufficient once Settings becomes its own window.
let appStateWriteQueue = Promise.resolve();

function getStorageManager() {
  if (!storageManager) {
    // Load lazily: storage handlers are not needed by narrow main-process
    // utilities, and this keeps the atomic handler independently testable.
    const { ElectronStorageManager } = require("../../lib/storage/electron-storage-manager");
    storageManager = new ElectronStorageManager();
  }
  return storageManager;
}

function isTrustedAppRenderer(webContents) {
  const win = BrowserWindow.fromWebContents(webContents);
  if (!win || win.isDestroyed() || win.webContents !== webContents || webContents.isDestroyed()) {
    return false;
  }

  const url = webContents.getURL();
  if (url.startsWith("file:")) return true;
  // Development renderers are served only from the local Next dev server.
  return isDev && /^http:\/\/localhost:3020(?:\/|$)/.test(url);
}

function broadcastAppState(appState) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (isTrustedAppRenderer(win.webContents)) {
      win.webContents.send(STORAGE_CHANNELS.event.appStateUpdated, appState);
    }
  }
}

/**
 * Build the atomic AppState patch handler separately for direct unit tests.
 * It validates both caller and payload before touching disk, returns the
 * canonical snapshot to the caller, then broadcasts the same snapshot only
 * to trusted application renderers.
 */
function createUpdateAppStateHandler({
  manager,
  isTrustedRenderer = isTrustedAppRenderer,
  broadcast = broadcastAppState,
}) {
  return async (event, updates) => {
    if (!isTrustedRenderer(event.sender)) {
      throw new Error("Unauthorized AppState update sender");
    }
    if (typeof updates !== "object" || updates === null || Array.isArray(updates)) {
      throw new Error("Invalid appState updates: expected object");
    }

    const write = async () => {
      const existing = (await manager.loadAppState()) ?? {};
      const canonical = { ...existing, ...updates };
      await manager.saveAppState(canonical);
      broadcast(canonical);
      return canonical;
    };

    // Keep the queue usable even after a failed write.
    const result = appStateWriteQueue.then(write, write);
    appStateWriteQueue = result.catch(() => undefined);
    return result;
  };
}

function registerStorageHandlers() {
  const manager = getStorageManager();

  // セッション保存
  ipcMain.handle(STORAGE_CHANNELS.invoke.saveSession, async (_event, session) => {
    if (typeof session !== "object" || session === null) {
      throw new Error("Invalid session: expected object");
    }
    try {
      await manager.saveSession(session);
    } catch (error) {
      console.error("[Storage IPC] saveSession failed:", error);
      throw error;
    }
  });

  // セッション読み込み
  ipcMain.handle(STORAGE_CHANNELS.invoke.loadSession, async () => {
    try {
      return await manager.loadSession();
    } catch (error) {
      console.error("[Storage IPC] loadSession failed:", error);
      throw error;
    }
  });

  // AppState 保存
  ipcMain.handle(STORAGE_CHANNELS.invoke.saveAppState, async (_event, appState) => {
    if (typeof appState !== "object" || appState === null) {
      throw new Error("Invalid appState: expected object");
    }
    try {
      await manager.saveAppState(appState);
    } catch (error) {
      console.error("[Storage IPC] saveAppState failed:", error);
      throw error;
    }
  });

  // AppState 読み込み
  ipcMain.handle(STORAGE_CHANNELS.invoke.loadAppState, async () => {
    try {
      return await manager.loadAppState();
    } catch (error) {
      console.error("[Storage IPC] loadAppState failed:", error);
      throw error;
    }
  });

  // Canonical main-process AppState update. New renderer code must use this
  // rather than loadAppState + saveAppState so multi-window changes compose.
  ipcMain.handle(STORAGE_CHANNELS.invoke.updateAppState, createUpdateAppStateHandler({ manager }));

  // Recent Files 追加
  ipcMain.handle(STORAGE_CHANNELS.invoke.addToRecent, async (_event, file) => {
    if (
      typeof file !== "object" ||
      file === null ||
      typeof file.name !== "string" ||
      typeof file.path !== "string"
    ) {
      throw new Error("Invalid file: expected { name: string, path: string, ... }");
    }
    try {
      await manager.addToRecent(file);
    } catch (error) {
      console.error("[Storage IPC] addToRecent failed:", error);
      throw error;
    }
  });

  // Recent Files 取得
  ipcMain.handle(STORAGE_CHANNELS.invoke.getRecentFiles, async () => {
    try {
      return manager.getRecentFiles();
    } catch (error) {
      console.error("[Storage IPC] getRecentFiles failed:", error);
      throw error;
    }
  });

  // Recent Files から削除
  ipcMain.handle(STORAGE_CHANNELS.invoke.removeFromRecent, async (_event, path) => {
    if (typeof path !== "string") {
      throw new Error("Invalid path: expected string");
    }
    try {
      await manager.removeFromRecent(path);
    } catch (error) {
      console.error("[Storage IPC] removeFromRecent failed:", error);
      throw error;
    }
  });

  // Recent Files クリア
  ipcMain.handle(STORAGE_CHANNELS.invoke.clearRecent, async () => {
    try {
      await manager.clearRecent();
    } catch (error) {
      console.error("[Storage IPC] clearRecent failed:", error);
      throw error;
    }
  });

  // Editor Buffer 保存
  ipcMain.handle(STORAGE_CHANNELS.invoke.saveEditorBuffer, async (_event, buffer) => {
    if (typeof buffer !== "object" || buffer === null) {
      throw new Error("Invalid buffer: expected object");
    }
    try {
      await manager.saveEditorBuffer(buffer);
    } catch (error) {
      console.error("[Storage IPC] saveEditorBuffer failed:", error);
      throw error;
    }
  });

  // Editor Buffer 読み込み
  ipcMain.handle(STORAGE_CHANNELS.invoke.loadEditorBuffer, async () => {
    try {
      return manager.loadEditorBuffer();
    } catch (error) {
      console.error("[Storage IPC] loadEditorBuffer failed:", error);
      throw error;
    }
  });

  // Editor Buffer クリア
  ipcMain.handle(STORAGE_CHANNELS.invoke.clearEditorBuffer, async () => {
    try {
      await manager.clearEditorBuffer();
    } catch (error) {
      console.error("[Storage IPC] clearEditorBuffer failed:", error);
      throw error;
    }
  });

  // すべてクリア
  ipcMain.handle(STORAGE_CHANNELS.invoke.clearAll, async () => {
    try {
      await manager.clearAll();
    } catch (error) {
      console.error("[Storage IPC] clearAll failed:", error);
      throw error;
    }
  });

  // Recent Projects 追加
  ipcMain.handle(STORAGE_CHANNELS.invoke.addRecentProject, async (_event, project) => {
    if (typeof project !== "object" || project === null) {
      throw new Error("Invalid project: expected object");
    }
    try {
      await manager.addRecentProject(project);
    } catch (error) {
      console.error("[Storage IPC] addRecentProject failed:", error);
      throw error;
    }
  });

  // Recent Projects 取得
  ipcMain.handle(STORAGE_CHANNELS.invoke.getRecentProjects, async () => {
    try {
      return await manager.getRecentProjects();
    } catch (error) {
      console.error("[Storage IPC] getRecentProjects failed:", error);
      throw error;
    }
  });

  // Recent Projects 削除
  ipcMain.handle(STORAGE_CHANNELS.invoke.removeRecentProject, async (_event, projectId) => {
    if (typeof projectId !== "string") {
      throw new Error("Invalid projectId: expected string");
    }
    try {
      await manager.removeRecentProject(projectId);
    } catch (error) {
      console.error("[Storage IPC] removeRecentProject failed:", error);
      throw error;
    }
  });

  // KV Store: set
  ipcMain.handle(STORAGE_CHANNELS.invoke.setItem, async (_event, key, value) => {
    if (typeof key !== "string") {
      throw new Error("Invalid key: expected string");
    }
    try {
      manager.setItem(key, value);
    } catch (error) {
      console.error("[Storage IPC] setItem failed:", error);
      throw error;
    }
  });

  // KV Store: get
  ipcMain.handle(STORAGE_CHANNELS.invoke.getItem, async (_event, key) => {
    if (typeof key !== "string") {
      throw new Error("Invalid key: expected string");
    }
    try {
      return manager.getItem(key);
    } catch (error) {
      console.error("[Storage IPC] getItem failed:", error);
      throw error;
    }
  });

  // KV Store: remove
  ipcMain.handle(STORAGE_CHANNELS.invoke.removeItem, async (_event, key) => {
    if (typeof key !== "string") {
      throw new Error("Invalid key: expected string");
    }
    try {
      manager.removeItem(key);
    } catch (error) {
      console.error("[Storage IPC] removeItem failed:", error);
      throw error;
    }
  });

  // KV Store: list keys by prefix
  ipcMain.handle(STORAGE_CHANNELS.invoke.getKeysByPrefix, async (_event, prefix) => {
    if (typeof prefix !== "string") {
      throw new Error("Invalid prefix: expected string");
    }
    try {
      return manager.getKeysByPrefix(prefix);
    } catch (error) {
      console.error("[Storage IPC] getKeysByPrefix failed:", error);
      throw error;
    }
  });
}

module.exports = {
  registerStorageHandlers,
  getStorageManager,
  createUpdateAppStateHandler,
  isTrustedAppRenderer,
  broadcastAppState,
};
