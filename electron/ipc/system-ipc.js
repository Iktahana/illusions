/* eslint-disable no-console */
// System, window, and safe-storage IPC handlers

const { ipcMain, BrowserWindow, safeStorage, powerMonitor } = require("electron");
const {
  SYSTEM_CHANNELS,
  MENU_CHANNELS,
  SAFE_STORAGE_CHANNELS,
  POWER_CHANNELS,
  UPDATE_CHANNELS,
} = require("../lib/ipc-channels");

function registerSystemHandlers() {
  ipcMain.handle(SYSTEM_CHANNELS.invoke.getChromeVersion, () => {
    const v = process.versions.chrome || "0";
    const major = Number.parseInt(String(v).split(".")[0] || "0", 10);
    return Number.isFinite(major) ? major : 0;
  });

  ipcMain.handle(SYSTEM_CHANNELS.invoke.setDirty, (event, dirty) => {
    // イベントを送信したウィンドウの dirty 状態を保持する
    const webContents = event.sender;
    const win = BrowserWindow.fromWebContents(webContents);
    if (win) {
      win.setDocumentEdited(dirty);
    }
  });

  // Phase 2: save 経路は削除されたが、この IPC は close handshake の終端トリガ
  // として引き続き使う（renderer は flush 完了後に呼んで window を destroy する）。
  // 命名は歴史的なため Phase 8 で必要に応じて改名する。
  ipcMain.handle(SYSTEM_CHANNELS.invoke.saveBeforeCloseDone, (event) => {
    const webContents = event.sender;
    const win = BrowserWindow.fromWebContents(webContents);
    if (win) {
      win.destroy();
    }
  });

  ipcMain.handle(SYSTEM_CHANNELS.invoke.newWindow, async () => {
    // 新しいウィンドウを作成（ウェルカム画面を表示）
    const { createWindow } = require("../window-manager");
    const newWin = await createWindow({ showWelcome: true });
    return newWin ? true : false;
  });

  ipcMain.handle(MENU_CHANNELS.invoke.rebuild, async () => {
    const { rebuildApplicationMenu } = require("../menu");
    await rebuildApplicationMenu();
    return true;
  });

  // Sync UI state from renderer to update menu checked states (per-window)
  ipcMain.handle(MENU_CHANNELS.invoke.syncUiState, async (event, state) => {
    const { setMenuUiState, rebuildApplicationMenu } = require("../menu");
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      setMenuUiState(state, win.id);
    }
    await rebuildApplicationMenu();
    return true;
  });

  // Sync keymap overrides from renderer to update menu accelerators (per-window)
  ipcMain.handle(MENU_CHANNELS.invoke.updateKeymapOverrides, async (event, overrides) => {
    const { setKeymapOverrides, rebuildApplicationMenu } = require("../menu");
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      setKeymapOverrides(overrides, win.id);
    }
    await rebuildApplicationMenu();
    return true;
  });

  // safeStorage: OS-level encryption (macOS Keychain / Windows DPAPI)
  ipcMain.handle(SAFE_STORAGE_CHANNELS.invoke.encrypt, (_event, plaintext) => {
    if (typeof plaintext !== "string" || !plaintext) return null;
    if (!safeStorage.isEncryptionAvailable()) return null;
    const encrypted = safeStorage.encryptString(plaintext);
    return encrypted.toString("base64");
  });

  ipcMain.handle(SAFE_STORAGE_CHANNELS.invoke.decrypt, (_event, base64Cipher) => {
    if (typeof base64Cipher !== "string" || !base64Cipher) return null;
    if (!safeStorage.isEncryptionAvailable()) return null;
    try {
      const buffer = Buffer.from(base64Cipher, "base64");
      return safeStorage.decryptString(buffer);
    } catch {
      return null;
    }
  });

  ipcMain.handle(SAFE_STORAGE_CHANNELS.invoke.isAvailable, () => {
    return safeStorage.isEncryptionAvailable();
  });

  // Power state IPC handlers
  ipcMain.handle(POWER_CHANNELS.invoke.getState, () => {
    return powerMonitor.isOnBatteryPower() ? "battery" : "ac";
  });

  // beta opt-in トグル変更時に channel を再評価し、更新確認を行う
  ipcMain.handle(UPDATE_CHANNELS.invoke.reevaluateChannel, async () => {
    const { reevaluateUpdateChannel } = require("../auto-updater");
    await reevaluateUpdateChannel();
    return true;
  });
}

module.exports = { registerSystemHandlers };
