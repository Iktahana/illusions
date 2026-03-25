/* eslint-disable no-console */
// Electron のメインプロセス入口

const { app, BrowserWindow, powerMonitor } = require('electron')
const path = require('path')

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

const { registerNlpHandlers } = require('./nlp/nlp-ipc-handlers')
const { registerStorageHandlers } = require('./storage-ipc-handlers')
const { registerVFSHandlers } = require('./vfs-ipc-handlers')
const { setupAutoUpdater, checkForUpdates } = require('./auto-updater')
const { createMainWindow, broadcastPowerState } = require('./window-manager')
const { installQuickLookPluginIfNeeded } = require('./quick-look')
const {
  handleMdiFileOpen,
  getPendingFilePath,
  setPendingFilePath,
  registerFileHandlers,
} = require('./ipc/file-ipc')
const { registerShellHandlers } = require('./ipc/shell-ipc')
const { registerSystemHandlers } = require('./ipc/system-ipc')
const { registerPtyHandlers } = require('./ipc/pty-ipc')
const { killAllSessions, killSessionsForWindow } = require('./ipc/terminal-session-registry')

process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err)
})
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled rejection:', reason)
})

// --- Single-instance lock ---
// Ensure only one instance of the app is running. On Windows/Linux this prevents
// duplicate windows when a user double-clicks a .mdi file while the app is already open.
const gotTheLock = app.requestSingleInstanceLock()
console.log('[DEBUG] Single instance lock:', gotTheLock)
if (!gotTheLock) {
  console.log('[DEBUG] Another instance is running, quitting.')
  app.quit()
} else {
  app.on('second-instance', (_event, commandLine) => {
    const { getMainWindow } = require('./window-manager')
    // Focus existing window
    const mainWindow = getMainWindow()
    if (mainWindow && !mainWindow.isDestroyed()) {
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

// Handle .mdi file association (macOS: open-file event, Windows/Linux: process.argv)
app.on('open-file', async (event, filePath) => {
  event.preventDefault()
  const { getMainWindow } = require('./window-manager')
  const mainWindow = getMainWindow()
  if (mainWindow && mainWindow.webContents) {
    await handleMdiFileOpen(filePath)
  } else {
    setPendingFilePath(filePath)
  }
})

console.log('[DEBUG] Waiting for app ready...')
app.whenReady().then(async () => {
  console.log('[DEBUG] App is ready, creating window...')
  // Content Security Policy
  const { session } = require('electron')
  const { isDev } = require('./app-constants')
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        // Note: 'unsafe-inline' is required in script-src because Next.js App Router
        // static export generates inline <script> tags for RSC flight data.
        // Removing it causes a white screen. XSS is mitigated by contextIsolation
        // + nodeIntegration:false + file:// protocol.
        'Content-Security-Policy': [
          [
            "default-src 'self'",
            `script-src 'self' 'unsafe-inline'${isDev && !app.isPackaged ? " 'unsafe-eval'" : ''}`,
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
  if (process.platform !== 'darwin' && !getPendingFilePath()) {
    const mdiArg = process.argv.find(a => a.endsWith('.mdi') && !a.startsWith('-'))
    if (mdiArg) setPendingFilePath(path.resolve(mdiArg))
  }

  console.log('[DEBUG] Calling createMainWindow...')
  await createMainWindow({ hasPendingFile: !!getPendingFilePath() })
  console.log('[DEBUG] Window created successfully')

  installQuickLookPluginIfNeeded()

  // Register IPC handlers
  registerNlpHandlers()
  registerStorageHandlers()
  registerVFSHandlers()
  registerFileHandlers()
  registerShellHandlers()
  registerSystemHandlers()
  registerPtyHandlers()

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

app.on('before-quit', () => {
  // Kill all active PTY sessions before the process exits
  killAllSessions()
})

// Kill PTY sessions for a window when it is closed
app.on('browser-window-created', (_event, win) => {
  win.on('closed', () => {
    killSessionsForWindow(win.webContents.id)
  })

  // Kill orphaned PTYs if the renderer crashes
  win.webContents.on('destroyed', () => {
    killSessionsForWindow(win.webContents.id)
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
