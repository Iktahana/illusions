/* eslint-disable no-console */
// Electron main process entry.
// Comments in code must be in English.

const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs/promises')

const isDev =
  process.env.NODE_ENV === 'development' || process.env.ELECTRON_DEV === '1'

let mainWindow = null

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
    filters: [{ name: 'Markdown', extensions: ['md'] }],
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
      filters: [{ name: 'Markdown', extensions: ['md'] }],
      defaultPath: 'untitled.md',
    })
    if (result.canceled || !result.filePath) return null
    target = result.filePath
  }
  await fs.writeFile(target, content, 'utf-8')
  return target
})

app.whenReady().then(() => {
  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

