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

function buildApplicationMenu() {
  const isMac = process.platform === 'darwin'

  const template = []

  // App menu (macOS only)
  if (isMac) {
    template.push({
      label: APP_NAME,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
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
      ...(isMac ? [] : [{ role: 'quit' }]),
    ],
  })

  // Edit menu
  template.push({ role: 'editMenu' })

  // View menu
  template.push({ role: 'viewMenu' })

  // Window menu (macOS only)
  if (isMac) {
    template.push({ role: 'windowMenu' })
  }

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

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

