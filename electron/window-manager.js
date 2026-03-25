/* eslint-disable no-console */
// Window management: creation, lifecycle, and power state broadcasting

const { app, BrowserWindow, dialog, shell } = require('electron')
const path = require('path')
const { isDev } = require('./app-constants')

let mainWindow = null
const allWindows = new Set()

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

function getMainWindow() {
  return mainWindow
}

function getAllWindows() {
  return allWindows
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

  newWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[Main] Renderer process gone:', details.reason, details.exitCode)
  })

  newWindow.webContents.on('console-message', (_event, level, message) => {
    if (level >= 2) console.log(`[Renderer] ${message}`)
  })

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
  // Defer require to avoid circular dependency with menu.js
  const { rebuildApplicationMenu } = require('./menu')
  await rebuildApplicationMenu()

  return newWindow
}

// 従来のコードに対応
async function createMainWindow({ hasPendingFile = false } = {}) {
  return createWindow({ hasPendingFile })
}

module.exports = {
  getMainWindow,
  getAllWindows,
  createWindow,
  createMainWindow,
  broadcastPowerState,
}
