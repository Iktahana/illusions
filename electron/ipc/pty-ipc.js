/* eslint-disable no-console */
// PTY IPC handlers — bridge between renderer and node-pty sessions managed by
// terminal-session-registry.js.
//
// Channel summary:
//   renderer → main  : pty:spawn, pty:attach, pty:write, pty:resize, pty:kill, pty:status
//   main → renderer  : pty:data, pty:exit

"use strict";

const { ipcMain, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");

const {
  MAX_SESSIONS_PER_WINDOW,
  MAX_SESSIONS_GLOBAL,
  registry,
  countSessionsForWindow,
  appendToOutputBuffer,
  addSession,
  getSession,
  removeSession,
  killSession,
} = require("./terminal-session-registry");

// -----------------------------------------------------------------------
// node-pty availability guard
// -----------------------------------------------------------------------

/** @type {import('node-pty')|null} */
let nodePty = null;
let ptyAvailable = false;

try {
  nodePty = require("node-pty");
  ptyAvailable = true;
} catch (err) {
  console.warn("[PTY] node-pty not available — terminal feature disabled:", err.message);
}

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

/**
 * Resolve the default shell for the current platform.
 * @returns {string}
 */
function resolveDefaultShell() {
  if (process.platform === "win32") return "powershell.exe";
  return process.env.SHELL || "/bin/sh";
}

/**
 * Verify that a shell executable exists and is accessible.
 * @param {string} shellPath
 * @returns {boolean}
 */
function shellExists(shellPath) {
  try {
    fs.accessSync(shellPath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Verify that a cwd is an absolute path that currently exists.
 * @param {string} cwd
 * @returns {boolean}
 */
function cwdIsValid(cwd) {
  if (!path.isAbsolute(cwd)) return false;
  try {
    const stat = fs.statSync(cwd);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Choose the best available working directory from priority list.
 * @param {string|undefined|null} requested - CWD requested by renderer (project root etc.)
 * @returns {string}
 */
function resolveCwd(requested) {
  if (requested && cwdIsValid(requested)) return requested;
  // Fall back to user home
  return os.homedir();
}

/**
 * Send PTY output to the owning webContents.
 * @param {number} webContentsId
 * @param {string} sessionId
 * @param {string} data
 */
function sendPtyData(webContentsId, sessionId, data) {
  const wc = BrowserWindow.getAllWindows()
    .map((w) => w.webContents)
    .find((wc) => wc.id === webContentsId);
  if (wc && !wc.isDestroyed()) {
    wc.send("pty:data", { sessionId, data });
  }
}

/**
 * Send PTY exit notification to the owning webContents.
 * @param {number} webContentsId
 * @param {string} sessionId
 * @param {number} exitCode
 */
function sendPtyExit(webContentsId, sessionId, exitCode) {
  const wc = BrowserWindow.getAllWindows()
    .map((w) => w.webContents)
    .find((wc) => wc.id === webContentsId);
  if (wc && !wc.isDestroyed()) {
    wc.send("pty:exit", { sessionId, exitCode });
  }
}

// -----------------------------------------------------------------------
// IPC handler registration
// -----------------------------------------------------------------------

function registerPtyHandlers() {
  // -------------------------------------------------------------------
  // pty:spawn — spawn a new PTY session
  // Payload: { cwd?, shell?, cols?, rows? }
  // Returns: { sessionId } | { error: string }
  // -------------------------------------------------------------------
  ipcMain.handle("pty:spawn", (event, options = {}) => {
    if (!ptyAvailable) {
      return { error: "node-pty is not available on this installation" };
    }

    const webContentsId = event.sender.id;

    // Session limit checks
    if (countSessionsForWindow(webContentsId) >= MAX_SESSIONS_PER_WINDOW) {
      return {
        error: `ウィンドウあたりの最大セッション数(${MAX_SESSIONS_PER_WINDOW})に達しました`,
      };
    }
    if (registry.size >= MAX_SESSIONS_GLOBAL) {
      return { error: `グローバルの最大セッション数(${MAX_SESSIONS_GLOBAL})に達しました` };
    }

    // Resolve shell
    const shell = (typeof options.shell === "string" && options.shell) || resolveDefaultShell();
    if (!shellExists(shell)) {
      return { error: `Shellが見つかりません: ${shell}` };
    }

    // Resolve cwd
    const cwd = resolveCwd(options.cwd);

    // Terminal dimensions
    const cols =
      typeof options.cols === "number" && options.cols > 0 && options.cols <= 500
        ? Math.floor(options.cols)
        : 80;
    const rows =
      typeof options.rows === "number" && options.rows > 0 && options.rows <= 500
        ? Math.floor(options.rows)
        : 24;

    let ptyProcess;
    try {
      ptyProcess = nodePty.spawn(shell, [], {
        name: "xterm-256color",
        cols,
        rows,
        cwd,
        env: { ...process.env },
      });
    } catch (err) {
      console.error("[PTY] Failed to spawn PTY:", err);
      return { error: `PTYの起動に失敗しました: ${err.message}` };
    }

    const entry = addSession({ ptyProcess, webContentsId, shell, cwd });

    // Forward PTY output to renderer
    ptyProcess.onData((data) => {
      appendToOutputBuffer(entry, data);
      sendPtyData(webContentsId, entry.sessionId, data);
    });

    // Handle PTY exit
    ptyProcess.onExit(({ exitCode }) => {
      entry.status = "exited";
      entry.exitCode = exitCode;
      sendPtyExit(webContentsId, entry.sessionId, exitCode);
      removeSession(entry.sessionId);
      console.log(
        `[PTY] Session ${entry.sessionId} exited (code=${exitCode}), removed from registry`,
      );
    });

    console.log(`[PTY] Spawned session ${entry.sessionId} (shell=${shell}, cwd=${cwd})`);
    return { sessionId: entry.sessionId };
  });

  // -------------------------------------------------------------------
  // pty:attach — re-attach to an existing session, returns buffered output
  // Payload: sessionId (string)
  // Returns: { status, exitCode, outputBuffer } | { error: string }
  // -------------------------------------------------------------------
  ipcMain.handle("pty:attach", (_event, sessionId) => {
    if (typeof sessionId !== "string") {
      return { error: "sessionId must be a string" };
    }

    const entry = getSession(sessionId);
    if (!entry) {
      return { error: `セッションが見つかりません: ${sessionId}` };
    }

    return {
      sessionId: entry.sessionId,
      status: entry.status,
      exitCode: entry.exitCode,
      outputBuffer: entry.outputBuffer.join("\n"),
    };
  });

  // -------------------------------------------------------------------
  // pty:write — send keystroke data to PTY
  // Payload: { sessionId, data }
  // Returns: { ok: boolean }
  // -------------------------------------------------------------------
  ipcMain.handle("pty:write", (_event, { sessionId, data } = {}) => {
    if (typeof sessionId !== "string") return { ok: false };

    const entry = getSession(sessionId);
    if (!entry) {
      // Non-existent sessionId: log only, no exception
      console.warn(`[PTY] pty:write — session not found: ${sessionId}`);
      return { ok: false };
    }

    if (entry.status !== "active") return { ok: false };

    if (typeof data !== "string") return { ok: false };
    if (Buffer.byteLength(data, "utf8") > 64 * 1024) {
      console.warn(`[PTY] pty:write — data exceeds 64 KB limit for session ${sessionId}`);
      return { ok: false };
    }

    try {
      entry.ptyProcess.write(data);
    } catch (err) {
      console.error(`[PTY] Write error on session ${sessionId}:`, err);
      return { ok: false };
    }
    return { ok: true };
  });

  // -------------------------------------------------------------------
  // pty:resize — resize the terminal
  // Payload: { sessionId, cols, rows }
  // Returns: { ok: boolean }
  // -------------------------------------------------------------------
  ipcMain.handle("pty:resize", (_event, { sessionId, cols, rows } = {}) => {
    if (typeof sessionId !== "string") return { ok: false };

    const entry = getSession(sessionId);
    if (!entry) {
      console.warn(`[PTY] pty:resize — session not found: ${sessionId}`);
      return { ok: false };
    }

    if (entry.status !== "active") return { ok: false };

    if (
      typeof cols !== "number" ||
      !Number.isInteger(cols) ||
      cols <= 0 ||
      cols > 500 ||
      typeof rows !== "number" ||
      !Number.isInteger(rows) ||
      rows <= 0 ||
      rows > 500
    ) {
      console.warn(
        `[PTY] pty:resize — invalid dimensions (${cols}x${rows}) for session ${sessionId}`,
      );
      return { ok: false };
    }

    try {
      entry.ptyProcess.resize(cols, rows);
    } catch (err) {
      console.error(`[PTY] Resize error on session ${sessionId}:`, err);
      return { ok: false };
    }
    return { ok: true };
  });

  // -------------------------------------------------------------------
  // pty:kill — terminate a session (idempotent)
  // Payload: sessionId (string)
  // Returns: { ok: boolean }
  // -------------------------------------------------------------------
  ipcMain.handle("pty:kill", (_event, sessionId) => {
    if (typeof sessionId !== "string") return { ok: false };

    const entry = getSession(sessionId);
    if (!entry) {
      console.warn(`[PTY] pty:kill — session not found: ${sessionId}`);
      return { ok: false };
    }

    killSession(sessionId);
    removeSession(sessionId);
    console.log(`[PTY] Killed and removed session ${sessionId}`);
    return { ok: true };
  });

  // -------------------------------------------------------------------
  // pty:status — query session state
  // Payload: sessionId (string)
  // Returns: { sessionId, status, exitCode, shell, cwd, createdAt } | { error: string }
  // -------------------------------------------------------------------
  ipcMain.handle("pty:status", (_event, sessionId) => {
    if (typeof sessionId !== "string") {
      return { error: "sessionId must be a string" };
    }

    const entry = getSession(sessionId);
    if (!entry) {
      return { error: `セッションが見つかりません: ${sessionId}` };
    }

    return {
      sessionId: entry.sessionId,
      status: entry.status,
      exitCode: entry.exitCode,
      shell: entry.shell,
      cwd: entry.cwd,
      createdAt: entry.createdAt,
    };
  });
}

module.exports = { registerPtyHandlers, ptyAvailable };
