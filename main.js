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
const { registerStorageHandlers, getStorageManager } = require('./electron-storage-ipc-handlers')
const { registerVFSHandlers } = require('./electron-vfs-ipc-handlers')

// Configure module resolution paths for ASAR environment
if (app.isPackaged) {
  const unpackedPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'dist-main', 'node_modules')
  const packedPath = path.join(__dirname, 'node_modules')

  // Set NODE_PATH to include both packed and unpacked locations
  const existingPath = process.env.NODE_PATH || ''
  process.env.NODE_PATH = [unpackedPath, packedPath, existingPath]
    .filter(Boolean)
    .join(path.delimiter)

  // Reinitialize module paths
  require('module').Module._initPaths()

  console.log('[Main] Module paths configured for ASAR:')
  console.log('  Unpacked:', unpackedPath)
  console.log('  Packed:', packedPath)
}

const execFileAsync = promisify(execFile)

const isDev =
  process.env.NODE_ENV === 'development' || process.env.ELECTRON_DEV === '1'

const APP_NAME = 'illusions'

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

// UI state synced from renderer for menu checked states
let menuUiState = {
  compactMode: false,
  showParagraphNumbers: true,
  themeMode: 'auto', // 'auto' | 'light' | 'dark'
  autoCharsPerLine: true,
}

function buildApplicationMenu(recentProjects = []) {
  const isMac = process.platform === 'darwin'

  /** Send an IPC message to the focused window instead of mainWindow */
  const sendToFocused = (channel, ...args) => {
    const win = BrowserWindow.getFocusedWindow()
    if (win) win.webContents.send(channel, ...args)
  }

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
          createWindow({ showWelcome: true })
        },
      },
      {
        label: '最近のプロジェクトを開く',
        submenu: recentProjects.length > 0
          ? recentProjects.map((project) => ({
              label: project.name,
              click: () => {
                sendToFocused('menu-open-recent-project', project.id)
              },
            }))
          : [{ label: '項目なし', enabled: false }],
      },
      {
        label: 'プロジェクトを開く',
        click: () => {
          sendToFocused('menu-open-project')
        },
      },
      { type: 'separator' },
      {
        label: 'ファイルを開く...',
        accelerator: 'CmdOrCtrl+O',
        click: () => {
          sendToFocused('menu-open-triggered')
        },
      },
      {
        label: '保存',
        accelerator: 'CmdOrCtrl+S',
        click: () => {
          sendToFocused('menu-save-triggered')
        },
      },
      {
        label: '別名で保存...',
        accelerator: 'Shift+CmdOrCtrl+S',
        click: () => {
          sendToFocused('menu-save-as-triggered')
        },
      },
      { type: 'separator' },
      {
        label: '閉じる',
        accelerator: 'CmdOrCtrl+W',
        click: () => {
          BrowserWindow.getFocusedWindow()?.close()
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
           sendToFocused('menu-paste-as-plaintext')
         },
       },
       { type: 'separator' },
       { role: 'selectAll', label: 'すべて選択' },
     ],
   })

  // 書式
  template.push({
    label: '書式',
    submenu: [
      {
        label: '行間',
        submenu: [
          { label: '広くする', accelerator: 'CmdOrCtrl+]', click: () => sendToFocused('menu-format', 'lineHeight', 'increase') },
          { label: '狭くする', accelerator: 'CmdOrCtrl+[', click: () => sendToFocused('menu-format', 'lineHeight', 'decrease') },
        ],
      },
      {
        label: '段落間隔',
        submenu: [
          { label: '広くする', click: () => sendToFocused('menu-format', 'paragraphSpacing', 'increase') },
          { label: '狭くする', click: () => sendToFocused('menu-format', 'paragraphSpacing', 'decrease') },
        ],
      },
      {
        label: '字下げ',
        submenu: [
          { label: '深くする', click: () => sendToFocused('menu-format', 'textIndent', 'increase') },
          { label: '浅くする', click: () => sendToFocused('menu-format', 'textIndent', 'decrease') },
          { label: 'なし', click: () => sendToFocused('menu-format', 'textIndent', 'none') },
        ],
      },
      { type: 'separator' },
      {
        label: '1行あたりの文字数',
        submenu: [
          {
            label: '自動',
            type: 'checkbox',
            checked: menuUiState.autoCharsPerLine,
            click: () => sendToFocused('menu-format', 'charsPerLine', 'auto'),
          },
          { type: 'separator' },
          { label: '増やす', enabled: !menuUiState.autoCharsPerLine, click: () => sendToFocused('menu-format', 'charsPerLine', 'increase') },
          { label: '減らす', enabled: !menuUiState.autoCharsPerLine, click: () => sendToFocused('menu-format', 'charsPerLine', 'decrease') },
        ],
      },
      { type: 'separator' },
      {
        label: '段落番号を表示',
        type: 'checkbox',
        checked: menuUiState.showParagraphNumbers,
        click: () => sendToFocused('menu-format', 'paragraphNumbers', 'toggle'),
      },
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

  // ウィンドウ
  template.push({
    label: 'ウィンドウ',
    submenu: [
      {
        label: 'コンパクトモード',
        type: 'checkbox',
        checked: menuUiState.compactMode,
        accelerator: 'CmdOrCtrl+Shift+M',
        click: () => {
          sendToFocused('menu-toggle-compact-mode')
        },
      },
      {
        label: 'ダークモード',
        submenu: [
          { label: '自動', type: 'radio', checked: menuUiState.themeMode === 'auto', click: () => sendToFocused('menu-theme', 'auto') },
          { label: 'オフ', type: 'radio', checked: menuUiState.themeMode === 'light', click: () => sendToFocused('menu-theme', 'light') },
          { label: 'オン', type: 'radio', checked: menuUiState.themeMode === 'dark', click: () => sendToFocused('menu-theme', 'dark') },
        ],
      },
      { type: 'separator' },
      ...(isMac ? [
        { role: 'minimize', label: '最小化' },
        { role: 'zoom', label: '拡大/縮小' },
        { type: 'separator' },
        { role: 'front', label: 'すべてを手前に移動' },
        { type: 'separator' },
        { role: 'window', label: 'ウィンドウ' },
      ] : [
        { role: 'minimize', label: '最小化' },
      ]),
    ],
  })

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
      { type: 'separator' },
      {
        label: '公式サイトへ',
        click: () => {
          shell.openExternal('https://www.illusions.app/')
        },
      },
    ],
  })

  return template
}

/** Rebuild the application menu with fresh recent projects from SQLite */
async function rebuildApplicationMenu() {
  try {
    const manager = getStorageManager()
    const projects = await manager.getRecentProjects()
    const menu = Menu.buildFromTemplate(buildApplicationMenu(projects))
    Menu.setApplicationMenu(menu)
  } catch (error) {
    console.error('[Main] Failed to rebuild menu:', error)
    // Fallback: build menu without recent projects
    const menu = Menu.buildFromTemplate(buildApplicationMenu())
    Menu.setApplicationMenu(menu)
  }
}

// 新しいウィンドウを作成（マルチウィンドウ対応）
// showWelcome: true の場合、自動復元をスキップしてウェルカム画面を表示する
async function createWindow({ showWelcome = false } = {}) {
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

  // 未保存の変更がある場合は終了前に確認ダイアログを表示する
  let isHandlingClose = false
  newWindow.on('close', (event) => {
    if (newWindow.isDocumentEdited() && !isHandlingClose) {
      event.preventDefault()
      isHandlingClose = true

      dialog
        .showMessageBox(newWindow, {
          type: 'question',
          buttons: ['保存', '保存しない', 'キャンセル'],
          defaultId: 0,
          cancelId: 2,
          message: '変更が保存されていません',
          detail: '保存しない場合、変更は失われます。',
        })
        .then(({ response }) => {
          if (response === 0) {
            // "Save": request renderer to save, then close
            newWindow.webContents.send('electron-request-save-before-close')
          } else if (response === 1) {
            // "Don't Save": discard changes and close immediately
            newWindow.destroy()
          }
          // response === 2 ("Cancel"): do nothing, keep window open
          isHandlingClose = false
        })
        .catch(() => {
          isHandlingClose = false
        })
    }
  })
  
  // ウィンドウ閉鎖時にセットから削除
  newWindow.on('closed', () => {
    allWindows.delete(newWindow)
    if (mainWindow === newWindow) {
      mainWindow = allWindows.values().next().value || null
    }
  })

  const welcomeQuery = showWelcome ? '?welcome' : ''
  if (isDev) {
    newWindow.loadURL(`http://localhost:3020${welcomeQuery}`)
    newWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    // Next.js の静的出力 — app.getAppPath() はパッケージのルートを返す
    const filePath = path.join(app.getAppPath(), 'out', 'index.html')
    const fileUrl = `file://${filePath}${welcomeQuery}`
    newWindow.loadURL(fileUrl)
  }

  // アプリメニューを設定（最近のプロジェクトを含む）
  await rebuildApplicationMenu()

  return newWindow
}

// 従来のコードに対応
async function createMainWindow() {
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

ipcMain.handle('open-external', async (_event, url) => {
  if (typeof url !== 'string') return false
  // Only allow http/https URLs
  if (!url.startsWith('https://') && !url.startsWith('http://')) return false
  await shell.openExternal(url)
  return true
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
  try {
    log.info(`ファイル保存を試行中: ${target}`)
    // Use open -> write -> sync -> close pattern for better compatibility with virtual file systems (e.g., Google Drive on Windows)
    const fileHandle = await fs.open(target, 'w')
    try {
      await fileHandle.writeFile(content, 'utf-8')
      // Explicitly sync to ensure data is flushed to disk (critical for Windows network drives)
      await fileHandle.sync()
    } finally {
      await fileHandle.close()
    }
    log.info(`ファイル保存成功: ${target}`)
    return target
  } catch (error) {
    log.error(`ファイルの保存に失敗しました (パス: ${target}):`, error)
    // Provide detailed error information for better debugging
    const errorDetails = {
      message: error.message || '不明なエラー',
      code: error.code || 'UNKNOWN',
      syscall: error.syscall || 'unknown',
      path: target,
    }
    log.error('詳細エラー情報:', errorDetails)
    return { success: false, error: errorDetails.message, code: errorDetails.code }
  }
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

ipcMain.handle('menu:rebuild', async () => {
  await rebuildApplicationMenu()
  return true
})

// Sync UI state from renderer to update menu checked states
ipcMain.handle('menu:sync-ui-state', async (_event, state) => {
  menuUiState = { ...menuUiState, ...state }
  await rebuildApplicationMenu()
  return true
})

ipcMain.handle('new-window', async () => {
   console.log('[Main Process] Creating new window (welcome)...')
   // 新しいウィンドウを作成（ウェルカム画面を表示）
   const newWin = await createWindow({ showWelcome: true })
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

// ネイティブコンテキストメニューを表示
ipcMain.handle('show-context-menu', (_event, items) => {
  const win = BrowserWindow.getFocusedWindow()
  if (!win) return null

  return new Promise((resolve) => {
    const template = items.map((item) =>
      item.action === '_separator'
        ? { type: 'separator' }
        : {
            label: item.label,
            accelerator: item.accelerator || undefined,
            click: () => resolve(item.action),
          }
    )
    const menu = Menu.buildFromTemplate(template)
    menu.popup({
      window: win,
      callback: () => resolve(null),
    })
  })
})

/**
 * Check if a directory contains a .illusions folder (project marker)
 * @param {string} dirPath - Directory path to check
 * @returns {Promise<boolean>} True if .illusions folder exists
 */
async function isProjectDirectory(dirPath) {
  try {
    const illusionsPath = path.join(dirPath, '.illusions')
    const stats = await fs.stat(illusionsPath)
    return stats.isDirectory()
  } catch {
    return false
  }
}

/**
 * Handle opening a .mdi file from the system
 * Detects if the file is part of a project and opens accordingly
 * @param {string} filePath - Path to the .mdi file
 */
async function handleMdiFileOpen(filePath) {
  if (!mainWindow || !mainWindow.webContents) {
    return false
  }

  try {
    const dirPath = path.dirname(filePath)
    const isProject = await isProjectDirectory(dirPath)

    if (isProject) {
      // Open as project with this file as initial file
      log.info('Opening as project:', dirPath, 'Initial file:', path.basename(filePath))
      mainWindow.webContents.send('open-as-project', {
        projectPath: dirPath,
        initialFile: path.basename(filePath),
      })
    } else {
      // Open as standalone file
      log.info('Opening as standalone file:', filePath)
      const content = await fs.readFile(filePath, 'utf-8')
      mainWindow.webContents.send('open-file-from-system', { path: filePath, content })
    }
    return true
  } catch (err) {
    log.error('システムからのファイルオープンに失敗しました:', err)
    return false
  }
}

// Handle .mdi file association (macOS: open-file event, Windows/Linux: process.argv)
let pendingFilePath = null

app.on('open-file', async (event, filePath) => {
  event.preventDefault()
  if (mainWindow && mainWindow.webContents) {
    await handleMdiFileOpen(filePath)
  } else {
    pendingFilePath = filePath
  }
})

app.whenReady().then(async () => {
  await createMainWindow()

  // Handle pending file from open-file event (received before window was ready)
  if (pendingFilePath) {
    const fileToOpen = pendingFilePath
    pendingFilePath = null
    mainWindow.webContents.once('did-finish-load', async () => {
      await handleMdiFileOpen(fileToOpen)
    })
  }

  installQuickLookPluginIfNeeded()

  // Register IPC handlers
  registerNlpHandlers()
  registerStorageHandlers()
  registerVFSHandlers()

  // ウィンドウ作成後に auto-updater を初期化
  setupAutoUpdater()

  // 起動時に自動でアップデート確認（少し遅らせる）
  setTimeout(() => {
    checkForUpdates(false)
  }, 3000)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
