/* eslint-disable no-console */
// System, window, and safe-storage IPC handlers

const { ipcMain, BrowserWindow, safeStorage, powerMonitor } = require('electron')

function registerSystemHandlers() {
  ipcMain.handle('get-chrome-version', () => {
    const v = process.versions.chrome || '0'
    const major = Number.parseInt(String(v).split('.')[0] || '0', 10)
    return Number.isFinite(major) ? major : 0
  })

  ipcMain.handle('set-dirty', (event, dirty) => {
    // イベントを送信したウィンドウの dirty 状態を保持する
    const webContents = event.sender
    const win = BrowserWindow.fromWebContents(webContents)
    if (win) {
      win.setDocumentEdited(dirty)
    }
  })

  ipcMain.handle('save-before-close-done', (event) => {
    // イベントを送信したウィンドウを閉じる
    const webContents = event.sender
    const win = BrowserWindow.fromWebContents(webContents)
    if (win) {
      win.destroy()
    }
  })

  ipcMain.handle('new-window', async () => {
    // 新しいウィンドウを作成（ウェルカム画面を表示）
    const { createWindow } = require('../window-manager')
    const newWin = await createWindow({ showWelcome: true })
    return newWin ? true : false
  })

  ipcMain.handle('menu:rebuild', async () => {
    const { rebuildApplicationMenu } = require('../menu')
    await rebuildApplicationMenu()
    return true
  })

  // Sync UI state from renderer to update menu checked states
  ipcMain.handle('menu:sync-ui-state', async (_event, state) => {
    const { setMenuUiState, rebuildApplicationMenu } = require('../menu')
    setMenuUiState(state)
    await rebuildApplicationMenu()
    return true
  })

  // Sync keymap overrides from renderer to update menu accelerators
  ipcMain.handle('menu:update-keymap-overrides', async (_event, overrides) => {
    const { setKeymapOverrides, rebuildApplicationMenu } = require('../menu')
    setKeymapOverrides(overrides)
    await rebuildApplicationMenu()
    return true
  })

  // safeStorage: OS-level encryption (macOS Keychain / Windows DPAPI)
  ipcMain.handle('safe-storage:encrypt', (_event, plaintext) => {
    if (typeof plaintext !== 'string' || !plaintext) return null
    if (!safeStorage.isEncryptionAvailable()) return null
    const encrypted = safeStorage.encryptString(plaintext)
    return encrypted.toString('base64')
  })

  ipcMain.handle('safe-storage:decrypt', (_event, base64Cipher) => {
    if (typeof base64Cipher !== 'string' || !base64Cipher) return null
    if (!safeStorage.isEncryptionAvailable()) return null
    try {
      const buffer = Buffer.from(base64Cipher, 'base64')
      return safeStorage.decryptString(buffer)
    } catch {
      return null
    }
  })

  ipcMain.handle('safe-storage:is-available', () => {
    return safeStorage.isEncryptionAvailable()
  })

  // Power state IPC handlers
  ipcMain.handle('power:get-state', () => {
    return powerMonitor.isOnBatteryPower() ? 'battery' : 'ac'
  })
}

module.exports = { registerSystemHandlers }
