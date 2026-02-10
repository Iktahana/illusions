/* eslint-disable no-console */
// Electron のメインプロセス入口

const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron')
const path = require('path')
const fs = require('fs/promises')
const os = require('os')
const { execFile } = require('child_process')
const { promisify } = require('util')
const { autoUpdater } = require('electron-updater')
const log = require('electron-log')
const { registerNlpHandlers } = require('./nlp-service/nlp-ipc-handlers')
const { registerStorageHandlers } = require('./electron-storage-ipc-handlers')

const execFileAsync = promisify(execFile)

const isDev =
  process.env.NODE_ENV === 'development' || process.env.ELECTRON_DEV === '1'

const APP_NAME = 'Illusions'

// auto-updater のログ設定
autoUpdater.logger = log
autoUpdater.logger.transports.file.level = 'info'

let mainWindow = null
let isManualUpdateCheck = false
const allWindows = new Set() // すべてのウィンドウを追跡

// auto-updater のイベントハンドラ設定
function setupAutoUpdater() {
  // 開発モードではアップデート確認をしない
  if (isDev) {
    log.info('開発モードのため auto-updater は無効です')
    return
  }

  // イベント: アップデートあり
  autoUpdater.on('update-available', (info) => {
    log.info('アップデートが見つかりました:', info)
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
          // ダウンロード開始
          autoUpdater.downloadUpdate()
        })
    }
  })

  // イベント: ダウンロード完了
  autoUpdater.on('update-downloaded', (info) => {
    log.info('アップデートのダウンロードが完了しました:', info)
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
            // 「今すぐ再起動」
            autoUpdater.quitAndInstall()
          }
        })
    }
  })

  // イベント: エラー
  autoUpdater.on('error', (error) => {
    log.error('アップデートでエラーが発生しました:', error)
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

  // イベント: 確認中
  autoUpdater.on('checking-for-update', () => {
    log.info('アップデートを確認しています...')
  })

  // イベント: アップデートなし
  autoUpdater.on('update-not-available', (info) => {
    log.info('アップデートはありません:', info)
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

  // イベント: ダウンロード進捗
  autoUpdater.on('download-progress', (progressObj) => {
    const logMessage = `ダウンロード速度: ${progressObj.bytesPerSecond} - 進捗: ${progressObj.percent}%`
    log.info(logMessage)
  })
}

// アップデート確認（手動/自動）
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

  // アプリ（macOSのみ）
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

  // ファイル
  template.push({
    label: 'ファイル',
    submenu: [
      {
        label: '新規ウィンドウ',
        accelerator: 'CmdOrCtrl+N',
        click: () => {
          createWindow()
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
        label: 'プロジェクトフォルダを開く',
        click: () => {
          mainWindow?.webContents.send('menu-show-in-file-manager')
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

  // 編集
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

  // 表示
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

  // ウィンドウ（macOSのみ）
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

  // ヘルプ
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

// 新しいウィンドウを作成（マルチウィンドウ対応）
function createWindow() {
  const preloadPath = path.join(__dirname, 'preload.js')
  console.log('[Main] __dirname:', __dirname)
  console.log('[Main] Preload path:', preloadPath)
  console.log('[Main] Preload exists:', require('fs').existsSync(preloadPath))
  console.log('[Main] isDev:', isDev)

  const newWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
    },
  })

  // Preload error detection
  newWindow.webContents.on('preload-error', (_event, _preloadPath, error) => {
    console.error('[Main] Preload error:', _preloadPath, error)
  })

  // ウィンドウをセットに追加
  allWindows.add(newWindow)
  
  // 最初のウィンドウの場合はメインウィンドウに設定
  if (!mainWindow) {
    mainWindow = newWindow
  }

  newWindow.once('ready-to-show', () => {
    newWindow?.show()
  })

  // 未保存の変更がある場合は終了前に保存を促す
  newWindow.on('close', (event) => {
    if (newWindow.isDocumentEdited()) {
      event.preventDefault()
      newWindow.webContents.send('electron-request-save-before-close')
    }
  })
  
  // ウィンドウ閉鎖時にセットから削除
  newWindow.on('closed', () => {
    allWindows.delete(newWindow)
    if (mainWindow === newWindow) {
      mainWindow = allWindows.values().next().value || null
    }
  })

  if (isDev) {
    newWindow.loadURL('http://localhost:3000')
    newWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    // Next.js の静的出力
    newWindow.loadFile(path.join(__dirname, 'out', 'index.html'))
  }

  // アプリメニューを設定
  const menu = Menu.buildFromTemplate(buildApplicationMenu())
  Menu.setApplicationMenu(menu)
  
  return newWindow
}

// 従来のコードに対応
function createMainWindow() {
  return createWindow()
}

async function installQuickLookPluginIfNeeded() {
  if (process.platform !== 'darwin') {
    return
  }

  if (!app.isPackaged) {
    return
  }

  const markerPath = path.join(
    app.getPath('userData'),
    `quicklook-installed-${app.getVersion()}`
  )

  try {
    await fs.stat(markerPath)
    return
  } catch {
    // インストール処理を続行
  }

  const sourcePath = path.join(
    process.resourcesPath,
    'Library',
    'QuickLook',
    'MDIQuickLook.qlgenerator'
  )

  try {
    await fs.stat(sourcePath)
  } catch (error) {
    log.warn('アプリリソース内に Quick Look プラグインが見つかりません:', error)
    return
  }

  const destDir = path.join(os.homedir(), 'Library', 'QuickLook')
  const destPath = path.join(destDir, 'MDIQuickLook.qlgenerator')

  try {
    await fs.mkdir(destDir, { recursive: true })
    await fs.rm(destPath, { recursive: true, force: true })
    await fs.cp(sourcePath, destPath, { recursive: true })
    await execFileAsync('/usr/bin/qlmanage', ['-r'])
    await fs.writeFile(markerPath, new Date().toISOString())
    log.info('Quick Look プラグインをインストールしました')
  } catch (error) {
    log.warn('Quick Look のインストールに失敗しました:', error)
  }
}

ipcMain.handle('show-in-file-manager', async (_event, dirPath) => {
  if (!dirPath) return false
  const result = await shell.openPath(dirPath)
  return result === '' // empty string = success
})

ipcMain.handle('get-chrome-version', () => {
  const v = process.versions.chrome || '0'
  const major = Number.parseInt(String(v).split('.')[0] || '0', 10)
  return Number.isFinite(major) ? major : 0
})

ipcMain.handle('open-file', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'illusions MDI Document', extensions: ['mdi'] },
      { name: 'Markdown', extensions: ['md'] },
      { name: 'すべてのファイル', extensions: ['*'] },
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
        { name: 'illusions MDI Document', extensions: ['mdi'] },
        { name: 'Markdown', extensions: ['md'] },
        { name: 'すべてのファイル', extensions: ['*'] },
      ],
      defaultPath: 'untitled.mdi',
    })
    if (result.canceled || !result.filePath) return null
    target = result.filePath
  }
  await fs.writeFile(target, content, 'utf-8')
  return target
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

ipcMain.handle('new-window', () => {
   console.log('[Main Process] Creating new window...')
   // 新しいウィンドウを作成
   const newWin = createWindow()
   console.log('[Main Process] New window created:', newWin ? 'success' : 'failed')
   return newWin ? true : false
 })

// 辞書ポップアップウィンドウを開く
ipcMain.handle('open-dictionary-popup', (_event, url, title) => {
  const popupWindow = new BrowserWindow({
    width: 800,
    height: 600,
    title: title || '辞典',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  popupWindow.loadURL(url)
  return true
})

app.whenReady().then(() => {
  createMainWindow()
  installQuickLookPluginIfNeeded()

  // Register IPC handlers
  registerNlpHandlers()
  registerStorageHandlers()

  // ウィンドウ作成後に auto-updater を初期化
  setupAutoUpdater()

  // 起動時に自動でアップデート確認（少し遅らせる）
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
