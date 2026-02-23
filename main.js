/* eslint-disable no-console */
// Electron のメインプロセス入口

const { app, BrowserWindow, ipcMain, dialog, Menu, shell, safeStorage, powerMonitor } = require('electron')
const path = require('path')
const fs = require('fs/promises')
const os = require('os')
const { execFile } = require('child_process')
const { promisify } = require('util')
const { autoUpdater } = require('electron-updater')
const log = require('electron-log')
const { registerNlpHandlers } = require('./nlp-service/nlp-ipc-handlers')
const { registerLlmHandlers, disposeLlmEngine } = require('./llm-service/llm-ipc-handlers')
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

}

const execFileAsync = promisify(execFile)

const isDev =
  process.env.NODE_ENV === 'development' || process.env.ELECTRON_DEV === '1'

const APP_NAME = 'illusions'

// --- Single-instance lock ---
// Ensure only one instance of the app is running. On Windows/Linux this prevents
// duplicate windows when a user double-clicks a .mdi file while the app is already open.
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, commandLine) => {
    // Focus existing window
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
    // Extract .mdi path from argv (Windows/Linux pass file path as CLI argument)
    const mdiArg = commandLine.find(a => a.endsWith('.mdi') && !a.startsWith('-'))
    if (mdiArg) {
      const resolvedPath = path.resolve(mdiArg)
      void handleMdiFileOpen(resolvedPath)
    }
  })
}

// auto-updater のログ設定
autoUpdater.logger = log
autoUpdater.logger.transports.file.level = 'info'

// Set update channel based on app version suffix (e.g., 0.1.123-beta → beta)
// Only 'latest' (stable) channel is the default; alpha/beta users stay on their channel
const versionMatch = app.getVersion().match(/-(.+)$/)
if (versionMatch) {
  autoUpdater.channel = versionMatch[1]
  autoUpdater.allowPrerelease = true
}

let mainWindow = null
let isManualUpdateCheck = false
const allWindows = new Set() // すべてのウィンドウを追跡

// --- Power state monitoring ---
let powerDebounceTimer = null

function broadcastPowerState(state) {
  clearTimeout(powerDebounceTimer)
  powerDebounceTimer = setTimeout(() => {
    for (const win of allWindows) {
      if (!win.isDestroyed()) {
        win.webContents.send('power:state-changed', state)
      }
    }
  }, 60_000) // 1-minute debounce
}

// Microsoft Store (APPX) ビルドかどうかを判定
// Store 版はストア経由で更新されるため、electron-updater を無効化する
const isMicrosoftStoreApp = process.windowsStore === true

// auto-updater のイベントハンドラ設定
function setupAutoUpdater() {
  // 開発モードではアップデート確認をしない
  if (isDev) {
    log.info('開発モードのため auto-updater は無効です')
    return
  }

  // Microsoft Store 版ではストア更新と衝突するため無効化
  if (isMicrosoftStoreApp) {
    log.info('Microsoft Store 版のため auto-updater は無効です')
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

  if (isMicrosoftStoreApp) {
    if (manual && mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'アップデート',
        message: 'Microsoft Store 版',
        detail: 'このバージョンは Microsoft Store 経由で更新されます。ストアアプリからアップデートを確認してください。',
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
        label: 'エクスポート',
        submenu: [
          {
            label: 'PDF としてエクスポート...',
            click: () => sendToFocused('menu-export-pdf'),
          },
          {
            label: 'EPUB としてエクスポート...',
            click: () => sendToFocused('menu-export-epub'),
          },
          {
            label: 'DOCX としてエクスポート...',
            click: () => sendToFocused('menu-export-docx'),
          },
        ],
      },
      { type: 'separator' },
      {
        label: '新しいタブ',
        accelerator: 'CmdOrCtrl+T',
        click: () => {
          sendToFocused('menu-new-tab')
        },
      },
      {
        label: 'タブを閉じる',
        accelerator: 'CmdOrCtrl+W',
        click: () => {
          sendToFocused('menu-close-tab')
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
async function createWindow({ showWelcome = false, hasPendingFile = false } = {}) {
  const preloadPath = path.join(__dirname, 'preload.js')

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
    },
  })

  // Navigation guards: block navigation away from the app
  newWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl)
    // Allow dev server and file:// protocol
    if (parsedUrl.protocol === 'file:') return
    if (isDev && parsedUrl.hostname === 'localhost') return
    event.preventDefault()
    console.warn('[Security] Blocked navigation to:', navigationUrl)
  })

  // Block new window creation from renderer
  newWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Allow opening external URLs in the default browser
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
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

  const queryParts = []
  if (showWelcome) queryParts.push('welcome')
  if (hasPendingFile) queryParts.push('pending-file')
  const query = queryParts.length ? `?${queryParts.join('&')}` : ''
  if (isDev) {
    newWindow.loadURL(`http://localhost:3020${query}`)
    newWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    // Next.js の静的出力 — app.getAppPath() はパッケージのルートを返す
    const filePath = path.join(app.getAppPath(), 'out', 'index.html')
    const fileUrl = `file://${filePath}${query}`
    newWindow.loadURL(fileUrl)
  }

  // アプリメニューを設定（最近のプロジェクトを含む）
  await rebuildApplicationMenu()

  return newWindow
}

// 従来のコードに対応
async function createMainWindow({ hasPendingFile = false } = {}) {
  return createWindow({ hasPendingFile })
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
  if (!dirPath || typeof dirPath !== 'string') return false
  // Reject relative paths and paths containing traversal sequences
  if (!path.isAbsolute(dirPath) || dirPath.includes('..')) {
    console.warn('[Security] Invalid path in show-in-file-manager:', dirPath)
    return false
  }
  const normalizedPath = path.normalize(dirPath)
  const result = await shell.openPath(normalizedPath)
  return result === '' // empty string = success
})

ipcMain.handle('reveal-in-file-manager', async (_event, filePath) => {
  if (!filePath || typeof filePath !== 'string') return false
  // Reject relative paths and paths containing traversal sequences
  if (!path.isAbsolute(filePath) || filePath.includes('..')) {
    console.warn('[Security] Invalid path in reveal-in-file-manager:', filePath)
    return false
  }
  const normalizedPath = path.normalize(filePath)
  shell.showItemInFolder(normalizedPath)
  return true
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
  // Approve opened file path so it can be saved back without a new dialog
  dialogApprovedPaths.add(path.resolve(filePath))
  const content = await fs.readFile(filePath, 'utf-8')
  return { path: filePath, content }
})

// --- save-file path security validation ---
// Tracks file paths that have been approved via native dialog or system file association.
// Paths provided directly by the renderer must be in this set or they will be rejected.
const dialogApprovedPaths = new Set()

/**
 * Check whether a normalized path points to a system-sensitive location.
 * Mirrors the deny-list logic in electron-vfs-ipc-handlers.js.
 * @param {string} normalizedPath - Forward-slash normalized absolute path
 * @returns {boolean} true if the path should be denied
 */
function isSavePathDenied(normalizedPath) {
  const homedir = os.homedir().split(path.sep).join('/')

  // System root directories (Unix + macOS + Windows)
  const denyExact = new Set([
    '/', '/etc', '/usr', '/bin', '/sbin', '/var', '/tmp', '/System',
    '/private', '/private/etc', '/private/var',
  ])

  // Bare Windows drive root (C:/ or C:)
  const driveLetterMatch = normalizedPath.match(/^([a-zA-Z]):?\/?$/)
  if (driveLetterMatch) return true

  const windowsDenyPrefixes = [
    'C:/Windows', 'C:/Program Files', 'C:/Program Files (x86)',
  ]

  // Sensitive directories within home
  const homeSensitiveSuffixes = [
    '/.ssh', '/.gnupg', '/.aws', '/.kube', '/.docker',
    '/.config/gcloud', '/Library/Keychains',
  ]

  // Treat denied roots as prefixes — block any nested path under them
  if ([...denyExact].some(dir => normalizedPath === dir || normalizedPath.startsWith(`${dir}/`))) return true
  if (normalizedPath === homedir || normalizedPath.startsWith(`${homedir}/`)) {
    // Allow writes inside home, but block sensitive subdirectories
    if (normalizedPath === homedir) return true
    if (homeSensitiveSuffixes.some(s => normalizedPath.startsWith(homedir + s))) return true
  }
  const normalizedLower = normalizedPath.toLowerCase()
  if (windowsDenyPrefixes.some(p => {
    const pLower = p.toLowerCase()
    return normalizedLower === pLower || normalizedLower.startsWith(`${pLower}/`)
  })) return true

  return false
}

const VALID_SAVE_FILE_TYPES = ['.mdi', '.md', '.txt']

/**
 * Validate a file path provided by the renderer for the save-file IPC handler.
 * Returns an error object if validation fails, or null if the path is valid.
 * @param {string} filePath - The raw file path from the renderer
 * @param {{ skipApproval?: boolean }} [options] - Validation options
 * @param {boolean} [options.skipApproval=false] - Skip the dialog-approval check (for dialog-selected paths)
 * @returns {{ success: false, error: string, code: string } | null}
 */
function validateSaveFilePath(filePath, { skipApproval = false } = {}) {
  // Reject paths containing '..' to prevent directory traversal
  const resolved = path.resolve(filePath)
  const normalized = resolved.split(path.sep).join('/')
  if (filePath.includes('..')) {
    log.warn(`save-file path rejected (directory traversal): ${filePath}`)
    return { success: false, error: 'パスに不正なディレクトリ遷移が含まれています', code: 'PATH_TRAVERSAL' }
  }

  // Reject system-sensitive paths
  // Check both the file itself and its parent directory
  if (isSavePathDenied(normalized) || isSavePathDenied(path.dirname(normalized).split(path.sep).join('/'))) {
    log.warn(`save-file path rejected (denied location): ${filePath}`)
    return { success: false, error: 'セキュリティ上の理由により、この場所への書き込みは許可されていません', code: 'PATH_DENIED' }
  }

  // Validate file extension
  const ext = path.extname(resolved).toLowerCase()
  if (!VALID_SAVE_FILE_TYPES.includes(ext)) {
    log.warn(`save-file path rejected (invalid extension "${ext}"): ${filePath}`)
    return { success: false, error: `無効なファイル拡張子: ${ext}`, code: 'INVALID_EXTENSION' }
  }

  // Reject paths not previously approved via dialog or system file open
  if (!skipApproval && !dialogApprovedPaths.has(resolved)) {
    log.warn(`save-file path rejected (not dialog-approved): ${filePath}`)
    return { success: false, error: 'ダイアログで承認されていないファイルパスです', code: 'PATH_NOT_APPROVED' }
  }

  return null
}

ipcMain.handle('save-file', async (_event, filePath, content, fileType) => {
  // Validate inputs
  if (filePath != null && typeof filePath !== 'string') {
    return { success: false, error: 'Invalid file path', code: 'INVALID_INPUT' }
  }
  if (typeof content !== 'string') {
    return { success: false, error: 'Invalid content', code: 'INVALID_INPUT' }
  }
  if (fileType != null && !VALID_SAVE_FILE_TYPES.includes(fileType)) {
    return { success: false, error: `Invalid file type: ${fileType}`, code: 'INVALID_INPUT' }
  }

  let target = filePath
  if (target) {
    // Validate renderer-provided path before writing
    const validationError = validateSaveFilePath(target)
    if (validationError) return validationError
    // Resolve to canonical form (consistent with dialogApprovedPaths entries)
    target = path.resolve(target)
  }
  if (!target) {
    // Determine default file name and filters based on fileType
    let defaultPath = 'untitled.mdi'
    let filters = [
      { name: 'illusions MDI Document', extensions: ['mdi'] },
      { name: 'Markdown', extensions: ['md'] },
      { name: 'テキストファイル', extensions: ['txt'] },
      { name: 'すべてのファイル', extensions: ['*'] },
    ]
    if (fileType === '.md') {
      defaultPath = 'untitled.md'
      filters = [
        { name: 'Markdown', extensions: ['md'] },
        { name: 'illusions MDI Document', extensions: ['mdi'] },
        { name: 'テキストファイル', extensions: ['txt'] },
        { name: 'すべてのファイル', extensions: ['*'] },
      ]
    } else if (fileType === '.txt') {
      defaultPath = 'untitled.txt'
      filters = [
        { name: 'テキストファイル', extensions: ['txt'] },
        { name: 'illusions MDI Document', extensions: ['mdi'] },
        { name: 'Markdown', extensions: ['md'] },
        { name: 'すべてのファイル', extensions: ['*'] },
      ]
    }
    const result = await dialog.showSaveDialog({
      filters,
      defaultPath,
    })
    if (result.canceled || !result.filePath) return null
    target = result.filePath
    // Validate dialog-selected path (skip approval check since it came from the dialog)
    const dialogValidationError = validateSaveFilePath(target, { skipApproval: true })
    if (dialogValidationError) return dialogValidationError
    // Approve this dialog-selected path for future saves
    dialogApprovedPaths.add(path.resolve(target))
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

// --- Export handlers ---

ipcMain.handle('export-pdf', async (_event, content, options) => {
  if (typeof content !== 'string') {
    return { success: false, error: 'Invalid content' }
  }
  try {
    const { generatePdf } = require('./lib/export/pdf-exporter')
    const pdfBuffer = await generatePdf(content, options || {})

    const { filePath } = await dialog.showSaveDialog({
      title: 'PDFとしてエクスポート',
      defaultPath: `${(options?.metadata?.title || 'untitled')}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    })

    if (!filePath) return null
    await fs.writeFile(filePath, pdfBuffer)
    log.info(`Exported PDF: ${filePath}`)
    return filePath
  } catch (error) {
    log.error('PDF export failed:', error)
    return { success: false, error: error.message || 'PDF export failed' }
  }
})

ipcMain.handle('export-epub', async (_event, content, options) => {
  if (typeof content !== 'string') {
    return { success: false, error: 'Invalid content' }
  }
  try {
    const { generateEpub } = require('./lib/export/epub-exporter')
    const epubBuffer = await generateEpub(content, options || {})

    const { filePath } = await dialog.showSaveDialog({
      title: 'EPUBとしてエクスポート',
      defaultPath: `${(options?.metadata?.title || 'untitled')}.epub`,
      filters: [{ name: 'EPUB', extensions: ['epub'] }],
    })

    if (!filePath) return null
    await fs.writeFile(filePath, epubBuffer)
    log.info(`Exported EPUB: ${filePath}`)
    return filePath
  } catch (error) {
    log.error('EPUB export failed:', error)
    return { success: false, error: error.message || 'EPUB export failed' }
  }
})

ipcMain.handle('export-docx', async (_event, content, options) => {
  if (typeof content !== 'string') {
    return { success: false, error: 'Invalid content' }
  }
  try {
    const { generateDocx } = require('./lib/export/docx-exporter')
    const docxBuffer = await generateDocx(content, options || {})

    const { filePath } = await dialog.showSaveDialog({
      title: 'DOCXとしてエクスポート',
      defaultPath: `${(options?.metadata?.title || 'untitled')}.docx`,
      filters: [{ name: 'Word Document', extensions: ['docx'] }],
    })

    if (!filePath) return null
    await fs.writeFile(filePath, docxBuffer)
    log.info(`Exported DOCX: ${filePath}`)
    return filePath
  } catch (error) {
    log.error('DOCX export failed:', error)
    return { success: false, error: error.message || 'DOCX export failed' }
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
   // 新しいウィンドウを作成（ウェルカム画面を表示）
   const newWin = await createWindow({ showWelcome: true })
   return newWin ? true : false
 })

// 辞書ポップアップウィンドウを開く
ipcMain.handle('open-dictionary-popup', (_event, url, title) => {
  // Validate URL: only allow https
  if (typeof url !== 'string') return false
  let parsedUrl
  try {
    parsedUrl = new URL(url)
  } catch {
    console.warn('[Security] Invalid dictionary URL:', url)
    return false
  }
  if (parsedUrl.protocol !== 'https:') {
    console.warn('[Security] Blocked non-HTTPS dictionary URL:', url)
    return false
  }

  const popupWindow = new BrowserWindow({
    width: 800,
    height: 600,
    title: title || '辞典',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Use isolated session so the app's CSP does not break external pages
      partition: 'dictionary',
    },
  })

  // Block navigation away from the initial URL's site (allow subdomains)
  const initialHostParts = parsedUrl.hostname.split('.')
  const initialDomain = initialHostParts.slice(-2).join('.')
  popupWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    try {
      const navUrl = new URL(navigationUrl)
      if (navUrl.protocol !== 'https:') {
        event.preventDefault()
        return
      }
      const navHostParts = navUrl.hostname.split('.')
      const navDomain = navHostParts.slice(-2).join('.')
      if (navDomain !== initialDomain) {
        event.preventDefault()
        console.warn('[Security] Blocked popup navigation to:', navigationUrl)
      }
    } catch {
      event.preventDefault()
    }
  })

  popupWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  popupWindow.loadURL(url)
  return true
})

// ネイティブコンテキストメニューを表示
ipcMain.handle('show-context-menu', (_event, items) => {
  // Input validation
  if (!Array.isArray(items) || items.length === 0 || items.length > 50) return null
  for (const item of items) {
    if (typeof item !== 'object' || item === null) return null
    if (item.action !== '_separator') {
      if (typeof item.label !== 'string' || typeof item.action !== 'string') return null
    }
  }

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

// --- Pull-model pending file handler ---
// Renderer calls this after hooks are mounted, eliminating the race condition
// with the old did-finish-load push model.
ipcMain.handle('get-pending-file', async () => {
  if (!pendingFilePath) return null

  const filePath = pendingFilePath
  pendingFilePath = null

  try {
    const dirPath = path.dirname(filePath)
    const isProject = await isProjectDirectory(dirPath)

    if (isProject) {
      return {
        type: 'project',
        projectPath: dirPath,
        initialFile: path.basename(filePath),
      }
    }

    // Standalone file: approve path for future saves and return content
    dialogApprovedPaths.add(path.resolve(filePath))
    const content = await fs.readFile(filePath, 'utf-8')
    return {
      type: 'standalone',
      path: filePath,
      content,
    }
  } catch (err) {
    log.error('get-pending-file failed:', err)
    return null
  }
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
  // Use focused window when available; fall back to mainWindow (e.g., app in background)
  const targetWindow = BrowserWindow.getFocusedWindow() || mainWindow
  if (!targetWindow || !targetWindow.webContents) {
    return false
  }

  try {
    const dirPath = path.dirname(filePath)
    const isProject = await isProjectDirectory(dirPath)

    if (isProject) {
      // Open as project with this file as initial file
      log.info('Opening as project:', dirPath, 'Initial file:', path.basename(filePath))
      targetWindow.webContents.send('open-as-project', {
        projectPath: dirPath,
        initialFile: path.basename(filePath),
      })
    } else {
      // Open as standalone file
      log.info('Opening as standalone file:', filePath)
      // Approve system-opened file path for future saves
      dialogApprovedPaths.add(path.resolve(filePath))
      const content = await fs.readFile(filePath, 'utf-8')
      targetWindow.webContents.send('open-file-from-system', { path: filePath, content })
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
  // Content Security Policy
  const { session } = require('electron')
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          [
            "default-src 'self'",
            `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "img-src 'self' data: blob:",
            "font-src 'self' data: https://fonts.gstatic.com",
            "connect-src 'self' https://api.openai.com https://api.anthropic.com https://generativelanguage.googleapis.com ws://localhost:*",
            "worker-src 'self' blob:",
            "frame-src 'none'",
          ].join('; ')
        ],
      },
    })
  })

  // Windows/Linux: check process.argv for .mdi file association
  if (process.platform !== 'darwin' && !pendingFilePath) {
    const mdiArg = process.argv.find(a => a.endsWith('.mdi') && !a.startsWith('-'))
    if (mdiArg) pendingFilePath = path.resolve(mdiArg)
  }

  await createMainWindow({ hasPendingFile: !!pendingFilePath })

  installQuickLookPluginIfNeeded()

  // Register IPC handlers
  registerNlpHandlers()
  registerLlmHandlers()
  registerStorageHandlers()
  registerVFSHandlers()

  // Power state monitoring
  powerMonitor.on('on-ac', () => broadcastPowerState('ac'))
  powerMonitor.on('on-battery', () => broadcastPowerState('battery'))

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

let isQuitting = false
app.on('before-quit', (event) => {
  if (isQuitting) return
  isQuitting = true
  event.preventDefault()
  const forceQuitTimeout = setTimeout(() => app.exit(0), 5000)
  disposeLlmEngine().finally(() => {
    clearTimeout(forceQuitTimeout)
    app.exit(0)
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
