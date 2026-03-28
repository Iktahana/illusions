/* eslint-disable no-console */
/**
 * PTY IPC handlers for Electron
 *
 * Spawns pseudo-terminal processes and bridges data/exit events to the renderer.
 * On spawn failure the handler returns `{ success: false, error }` so that the
 * renderer can transition the terminal tab to an error state instead of leaving
 * it stuck in "connecting".
 */

const { ipcMain } = require('electron')
const os = require('os')

/** @type {Map<string, import('node-pty').IPty>} */
const activePtys = new Map()

let ptyCounter = 0

/**
 * Resolve the default shell for the current platform.
 * @returns {string}
 */
function defaultShell() {
  if (process.platform === 'win32') {
    return process.env.COMSPEC || 'cmd.exe'
  }
  return process.env.SHELL || '/bin/bash'
}

/**
 * Register all PTY-related IPC handlers.
 * Must be called once during app startup (after `app.whenReady()`).
 */
function registerPtyHandlers() {
  // -----------------------------------------------------------------------
  // pty:spawn — create a new PTY session
  // -----------------------------------------------------------------------
  ipcMain.handle('pty:spawn', async (event, options = {}) => {
    /** @type {typeof import('node-pty')} */
    let pty
    try {
      pty = require('node-pty')
    } catch (err) {
      console.error('[pty] node-pty is not available:', err.message)
      return { success: false, error: 'node-pty モジュールが見つかりません' }
    }

    const shell = options.shell || defaultShell()
    const cwd = options.cwd || os.homedir()
    const cols = typeof options.cols === 'number' && options.cols > 0 ? options.cols : 80
    const rows = typeof options.rows === 'number' && options.rows > 0 ? options.rows : 24

    try {
      // Filter sensitive environment variables before forwarding to PTY.
      // Standard terminal env (PATH, HOME, SHELL, LANG, TERM, etc.) is kept.
      const SENSITIVE_PATTERNS = /^(.*_KEY|.*_SECRET|.*_TOKEN|.*_PASSWORD|.*_CREDENTIAL|NPM_TOKEN|GH_TOKEN|GITHUB_TOKEN)$/i
      const safeEnv = Object.fromEntries(
        Object.entries(process.env).filter(([k]) => !SENSITIVE_PATTERNS.test(k))
      )

      const ptyProcess = pty.spawn(shell, [], {
        name: 'xterm-256color',
        cwd,
        env: safeEnv,
        cols,
        rows,
      })

      const ptyId = `pty-${++ptyCounter}-${ptyProcess.pid}`
      activePtys.set(ptyId, ptyProcess)

      // Forward data from PTY → renderer
      ptyProcess.onData((data) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('pty:data', { ptyId, data })
        }
      })

      // Forward exit event and clean up
      ptyProcess.onExit(({ exitCode, signal }) => {
        activePtys.delete(ptyId)
        if (!event.sender.isDestroyed()) {
          event.sender.send('pty:exit', { ptyId, exitCode, signal })
        }
      })

      return { success: true, ptyId, pid: ptyProcess.pid }
    } catch (err) {
      console.error('[pty] Failed to spawn PTY:', err)
      return {
        success: false,
        error: err.message || 'PTY の起動に失敗しました',
      }
    }
  })

  // -----------------------------------------------------------------------
  // pty:write — send data to an existing PTY
  // -----------------------------------------------------------------------
  ipcMain.handle('pty:write', async (_event, ptyId, data) => {
    const proc = activePtys.get(ptyId)
    if (!proc) throw new Error(`PTY ${ptyId} not found`)
    proc.write(data)
  })

  // -----------------------------------------------------------------------
  // pty:resize — resize an existing PTY
  // -----------------------------------------------------------------------
  ipcMain.handle('pty:resize', async (_event, ptyId, cols, rows) => {
    const proc = activePtys.get(ptyId)
    if (!proc) throw new Error(`PTY ${ptyId} not found`)
    proc.resize(cols, rows)
  })

  // -----------------------------------------------------------------------
  // pty:kill — terminate an existing PTY
  // -----------------------------------------------------------------------
  ipcMain.handle('pty:kill', async (_event, ptyId) => {
    const proc = activePtys.get(ptyId)
    if (!proc) return // already gone
    proc.kill()
    activePtys.delete(ptyId)
  })
}

/**
 * Dispose all active PTY sessions (call on app quit).
 */
function disposeAllPtys() {
  for (const [id, proc] of Array.from(activePtys)) {
    try {
      proc.kill()
    } catch { /* ignore */ }
    activePtys.delete(id)
  }
}

module.exports = { registerPtyHandlers, disposeAllPtys }
