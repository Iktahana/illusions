/* eslint-disable no-console */
/**
 * Storage IPC ハンドラー
 * ElectronStorageManager を使い、レンダラからの IPC 呼び出しに応答する
 */

const { ipcMain } = require('electron');
const { ElectronStorageManager } = require('./lib/electron-storage-manager');

let storageManager = null;

function getStorageManager() {
  if (!storageManager) {
    storageManager = new ElectronStorageManager();
  }
  return storageManager;
}

function registerStorageHandlers() {
  const manager = getStorageManager();

  // セッション保存
  ipcMain.handle('storage:save-session', async (_event, session) => {
    try {
      manager.saveSession(session);
    } catch (error) {
      console.error('[Storage IPC] saveSession failed:', error);
      throw error;
    }
  });

  // セッション読み込み
  ipcMain.handle('storage:load-session', async () => {
    try {
      return manager.loadSession();
    } catch (error) {
      console.error('[Storage IPC] loadSession failed:', error);
      throw error;
    }
  });

  // AppState 保存
  ipcMain.handle('storage:save-app-state', async (_event, appState) => {
    try {
      manager.saveAppState(appState);
    } catch (error) {
      console.error('[Storage IPC] saveAppState failed:', error);
      throw error;
    }
  });

  // AppState 読み込み
  ipcMain.handle('storage:load-app-state', async () => {
    try {
      return manager.loadAppState();
    } catch (error) {
      console.error('[Storage IPC] loadAppState failed:', error);
      throw error;
    }
  });

  // Recent Files 追加
  ipcMain.handle('storage:add-to-recent', async (_event, file) => {
    try {
      manager.addToRecent(file);
    } catch (error) {
      console.error('[Storage IPC] addToRecent failed:', error);
      throw error;
    }
  });

  // Recent Files 取得
  ipcMain.handle('storage:get-recent-files', async () => {
    try {
      return manager.getRecentFiles();
    } catch (error) {
      console.error('[Storage IPC] getRecentFiles failed:', error);
      throw error;
    }
  });

  // Recent Files から削除
  ipcMain.handle('storage:remove-from-recent', async (_event, path) => {
    try {
      manager.removeFromRecent(path);
    } catch (error) {
      console.error('[Storage IPC] removeFromRecent failed:', error);
      throw error;
    }
  });

  // Recent Files クリア
  ipcMain.handle('storage:clear-recent', async () => {
    try {
      manager.clearRecent();
    } catch (error) {
      console.error('[Storage IPC] clearRecent failed:', error);
      throw error;
    }
  });

  // Editor Buffer 保存
  ipcMain.handle('storage:save-editor-buffer', async (_event, buffer) => {
    try {
      manager.saveEditorBuffer(buffer);
    } catch (error) {
      console.error('[Storage IPC] saveEditorBuffer failed:', error);
      throw error;
    }
  });

  // Editor Buffer 読み込み
  ipcMain.handle('storage:load-editor-buffer', async () => {
    try {
      return manager.loadEditorBuffer();
    } catch (error) {
      console.error('[Storage IPC] loadEditorBuffer failed:', error);
      throw error;
    }
  });

  // Editor Buffer クリア
  ipcMain.handle('storage:clear-editor-buffer', async () => {
    try {
      manager.clearEditorBuffer();
    } catch (error) {
      console.error('[Storage IPC] clearEditorBuffer failed:', error);
      throw error;
    }
  });

  // すべてクリア
  ipcMain.handle('storage:clear-all', async () => {
    try {
      manager.clearAll();
    } catch (error) {
      console.error('[Storage IPC] clearAll failed:', error);
      throw error;
    }
  });

  console.log('[Storage IPC] Storage handlers registered');
}

module.exports = { registerStorageHandlers };
