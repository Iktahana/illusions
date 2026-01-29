/* eslint-disable no-console */
// Electron main process entry.
// Comments in code must be in English.

const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron')
const path = require('path')
const fs = require('fs/promises')
const { autoUpdater } = require('electron-updater')
const log = require('electron-log')

const isDev =
  process.env.NODE_ENV === 'development' || process.env.ELECTRON_DEV === '1'

const APP_NAME = 'Illusions'

// Configure auto-updater logging
autoUpdater.logger = log
autoUpdater.logger.transports.file.level = 'info'

let mainWindow = null
let isManualUpdateCheck = false

// Setup auto-update event handlers
function setupAutoUpdater() {
  // Only check for updates in production
  if (isDev) {
    log.info('Auto-updater disabled in development mode')
    return
  }

  // Event: Update available
  autoUpdater.on('update-available', (info) => {
    log.info('Update available:', info)
    if (mainWindow) {
      dialog
        .showMessageBox(mainWindow, {
          type: 'info',
          title: 'アップデート可能',
          message: `新しいバージョン ${info.version} が見つかりました`,
          detail: 'バックグラウンドでアップデートをダウンロードしています...',
          buttons: ['OK'],
        })
        .then(() => {
          // Start downloading the update
          autoUpdater.downloadUpdate()
        })
    }
  })

  // Event: Update downloaded
  autoUpdater.on('update-downloaded', (info) => {
    log.info('Update downloaded:', info)
    if (mainWindow) {
      dialog
        .showMessageBox(mainWindow, {
          type: 'info',
          title: 'アップデート準備完了',
          message: 'アップデートのダウンロードが完了しました',
          detail: 'アプリを再起動してインストールしますか？',
          buttons: ['今すぐ再起動', '後で'],
          defaultId: 0,
          cancelId: 1,
        })
        .then((result) => {
          if (result.response === 0) {
            // User clicked "Restart Now"
            autoUpdater.quitAndInstall()
          }
        })
    }
  })

  // Event: Error occurred
  autoUpdater.on('error', (error) => {
    log.error('Update error:', error)
    if (isManualUpdateCheck && mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: 'error',
        title: 'アップデートエラー',
        message: 'アップデートの確認中にエラーが発生しました',
        detail: error.message || '不明なエラー',
        buttons: ['OK'],
      })
    }
    isManualUpdateCheck = false
  })

  // Event: Checking for update
  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for updates...')
  })

  // Event: Update not available
  autoUpdater.on('update-not-available', (info) => {
    log.info('Update not available:', info)
    if (isManualUpdateCheck && mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'アップデート',
        message: '最新バージョンです',
        detail: `現在のバージョン: ${app.getVersion()}`,
        buttons: ['OK'],
      })
    }
    isManualUpdateCheck = false
  })

  // Event: Download progress
  autoUpdater.on('download-progress', (progressObj) => {
    const logMessage = `Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent}%`
    log.info(logMessage)
  })
}

// Check for updates (manual or automatic)
function checkForUpdates(manual = false) {
  if (isDev) {
    if (manual && mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'アップデート',
        message: '開発モード',
        detail: '開発モードではアップデート機能は無効です。',
        buttons: ['OK'],
      })
    }
    return
  }

  isManualUpdateCheck = manual
  autoUpdater.checkForUpdates()
}

function buildApplicationMenu() {
  const isMac = process.platform === 'darwin'

  const template = []

  // App menu (macOS only)
  if (isMac) {
    template.push({
      label: APP_NAME,
      submenu: [
        { role: 'about', label: `${APP_NAME}について` },
        { type: 'separator' },
        { role: 'services', label: 'サービス' },
        { type: 'separator' },
        { role: 'hide', label: `${APP_NAME}を隠す` },
        { role: 'hideOthers', label: '他を隠す' },
        { role: 'unhide', label: 'すべてを表示' },
        { type: 'separator' },
        { role: 'quit', label: `${APP_NAME}を終了` },
      ],
    })
  }

  // File menu
  template.push({
    label: 'ファイル',
    submenu: [
      {
        label: '新規',
        accelerator: 'CmdOrCtrl+N',
        click: () => {
          mainWindow?.webContents.send('menu-new-triggered')
        },
      },
      {
        label: '開く...',
        accelerator: 'CmdOrCtrl+O',
        click: () => {
          mainWindow?.webContents.send('menu-open-triggered')
        },
      },
      { type: 'separator' },
      {
        label: '保存',
        accelerator: 'CmdOrCtrl+S',
        click: () => {
          mainWindow?.webContents.send('menu-save-triggered')
        },
      },
      {
        label: '別名で保存...',
        accelerator: 'Shift+CmdOrCtrl+S',
        click: () => {
          mainWindow?.webContents.send('menu-save-as-triggered')
        },
      },
      { type: 'separator' },
      {
        label: '閉じる',
        accelerator: 'CmdOrCtrl+W',
        click: () => {
          mainWindow?.close()
        },
      },
      ...(isMac ? [] : [{ type: 'separator' }]),
      ...(isMac ? [] : [{ role: 'quit', label: '終了' }]),
    ],
  })

   // Edit menu
   template.push({
     label: '編集',
     submenu: [
       { role: 'undo', label: '元に戻す' },
       { role: 'redo', label: 'やり直す' },
       { type: 'separator' },
       { role: 'cut', label: '切り取り' },
       { role: 'copy', label: 'コピー' },
       { role: 'paste', label: '貼り付け' },
       {
         label: 'プレーンテキストとして貼り付け',
         accelerator: 'Shift+CmdOrCtrl+V',
         click: () => {
           mainWindow?.webContents.send('menu-paste-as-plaintext')
         },
       },
       { type: 'separator' },
       { role: 'selectAll', label: 'すべて選択' },
     ],
   })

  // View menu
  template.push({
    label: '表示',
    submenu: [
      { role: 'reload', label: '再読み込み' },
      { role: 'forceReload', label: '強制再読み込み' },
      { role: 'toggleDevTools', label: '開発者ツールを切り替え' },
      { type: 'separator' },
      { role: 'resetZoom', label: '実際のサイズ' },
      { role: 'zoomIn', label: '拡大' },
      { role: 'zoomOut', label: '縮小' },
      { type: 'separator' },
      { role: 'togglefullscreen', label: '全画面表示を切り替え' },
    ],
  })

  // Window menu (macOS only)
  if (isMac) {
    template.push({
      label: 'ウィンドウ',
      submenu: [
        { role: 'minimize', label: '最小化' },
        { role: 'zoom', label: '拡大/縮小' },
        { type: 'separator' },
        { role: 'front', label: 'すべてを手前に移動' },
        { type: 'separator' },
        { role: 'window', label: 'ウィンドウ' },
      ],
    })
  }

  // Help menu
  template.push({
    label: 'ヘルプ',
    submenu: [
      {
        label: 'アップデートを確認',
        click: () => {
          checkForUpdates(true)
        },
      },
      { type: 'separator' },
      {
        label: `バージョン ${app.getVersion()}`,
        enabled: false,
      },
    ],
  })

  return template
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  // Handle window close with unsaved changes check
  mainWindow.on('close', (event) => {
    if (mainWindow.isDocumentEdited()) {
      event.preventDefault()
      mainWindow.webContents.send('electron-request-save-before-close')
    }
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    // Next.js static export output.
    mainWindow.loadFile(path.join(__dirname, 'out', 'index.html'))
  }

  // Set up application menu
  const menu = Menu.buildFromTemplate(buildApplicationMenu())
  Menu.setApplicationMenu(menu)
}

ipcMain.handle('get-chrome-version', () => {
  const v = process.versions.chrome || '0'
  const major = Number.parseInt(String(v).split('.')[0] || '0', 10)
  return Number.isFinite(major) ? major : 0
})

ipcMain.handle('open-file', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'MDI Document', extensions: ['mdi'] },
      { name: 'Markdown', extensions: ['md'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  })
  if (canceled || !filePaths[0]) return null
  const filePath = filePaths[0]
  const content = await fs.readFile(filePath, 'utf-8')
  return { path: filePath, content }
})

ipcMain.handle('save-file', async (_event, filePath, content) => {
  let target = filePath
  if (!target) {
    const result = await dialog.showSaveDialog({
      filters: [
        { name: 'MDI Document', extensions: ['mdi'] },
        { name: 'Markdown', extensions: ['md'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      defaultPath: 'untitled.mdi',
    })
    if (result.canceled || !result.filePath) return null
    target = result.filePath
  }
  await fs.writeFile(target, content, 'utf-8')
  return target
})

ipcMain.handle('set-dirty', (_event, dirty) => {
  // Track dirty state for window close handling
  if (mainWindow) {
    mainWindow.setDocumentEdited(dirty)
  }
})

ipcMain.handle('save-before-close-done', () => {
  // Close window after save is complete
  if (mainWindow) {
    mainWindow.destroy()
  }
})

app.whenReady().then(() => {
  createMainWindow()

  // Initialize auto-updater after window is created
  setupAutoUpdater()

  // Auto-check for updates on startup (after a short delay)
  setTimeout(() => {
    checkForUpdates(false)
  }, 3000)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

