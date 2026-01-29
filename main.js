/* eslint-disable no-console */
// Electron main process entry.
// Comments in code must be in English.

const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs/promises')
const { autoUpdater } = require('electron-updater')
const log = require('electron-log')

const isDev =
  process.env.NODE_ENV === 'development' || process.env.ELECTRON_DEV === '1'

// Configure auto-updater logging
autoUpdater.logger = log
autoUpdater.logger.transports.file.level = 'info'

let mainWindow = null

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
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update Available',
        message: `Found new version ${info.version}`,
        detail: 'Downloading update in the background...',
        buttons: ['OK'],
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
          title: 'Update Ready',
          message: 'Update downloaded successfully',
          detail: 'The update will be installed when you restart. Restart now?',
          buttons: ['Restart Now', 'Later'],
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
  })

  // Event: Checking for update
  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for updates...')
  })

  // Event: Update not available
  autoUpdater.on('update-not-available', (info) => {
    log.info('Update not available:', info)
  })

  // Check for updates
  autoUpdater.checkForUpdatesAndNotify()
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

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    // Next.js static export output.
    mainWindow.loadFile(path.join(__dirname, 'out', 'index.html'))
  }
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

app.whenReady().then(() => {
  createMainWindow()

  // Initialize auto-updater after window is created
  setupAutoUpdater()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

