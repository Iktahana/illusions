/* eslint-disable no-console */
/**
 * VFS IPC handlers for Electron
 * Provides file system operations for the renderer process
 */

const { ipcMain, dialog, app, BrowserWindow, webContents } = require("electron");
const fs = require("fs/promises");
const path = require("path");
const os = require("os");

function registerVFSHandlers() {
  // Track the opened root directory per window for path validation
  const allowedRoots = new Map();

  // Track paths that were selected via the native file dialog.
  // Uses a bounded LRU map to prevent unbounded memory growth in long sessions.
  const MAX_APPROVED_PATHS = 200;
  const dialogApprovedPaths = new Map();

  /**
   * Add a path to the dialog-approved set with LRU eviction.
   * When the map exceeds MAX_APPROVED_PATHS, the least recently added entry is evicted.
   * @param {string} p - The path to approve
   */
  function approveDialogPath(p) {
    // Delete first so re-insertion moves it to the end (most recent)
    dialogApprovedPaths.delete(p);
    dialogApprovedPaths.set(p, true);
    // Evict oldest entry if over capacity
    if (dialogApprovedPaths.size > MAX_APPROVED_PATHS) {
      const oldest = dialogApprovedPaths.keys().next().value;
      if (oldest !== undefined) {
        dialogApprovedPaths.delete(oldest);
      }
    }
  }

  /**
   * Normalize path separators to forward slashes for cross-platform compatibility.
   * This ensures Windows backslashes (\) and Unix forward slashes (/) are handled consistently.
   */
  function normalizePath(p) {
    // Replace all backslashes with forward slashes and remove trailing slashes
    return p.replace(/\\/g, "/").replace(/\/+$/, "");
  }

  /**
   * Validate that a requested path is within the allowed root directory.
   * Prevents path traversal attacks from a compromised renderer.
   * @param {Electron.IpcMainInvokeEvent} event - The IPC event to identify the sender window
   * @param {string} requestedPath - The path to validate
   */
  function validateVFSPath(event, requestedPath) {
    const allowedRoot = allowedRoots.get(event.sender.id);
    if (!allowedRoot) {
      throw new Error("ディレクトリが開かれていません");
    }
    // Normalize the incoming path to use forward slashes to avoid issues with
    // mixed path separators on Windows (which can cause path.resolve to misbehave)
    const normalizedInput = requestedPath.replace(/\\/g, "/");
    const resolved = path.resolve(normalizedInput);

    // Normalize paths for consistent comparison across platforms
    const normalizedResolved = normalizePath(resolved);
    const normalizedRoot = normalizePath(allowedRoot);

    if (
      normalizedResolved !== normalizedRoot &&
      !normalizedResolved.startsWith(normalizedRoot + "/")
    ) {
      throw new Error("プロジェクトディレクトリの外部へのアクセスは許可されていません");
    }
    return resolved;
  }

  // Open directory picker
  ipcMain.handle("vfs:open-directory", async (event) => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"],
    });

    if (result.canceled || !result.filePaths[0]) {
      return null;
    }

    const dirPath = result.filePaths[0];
    const name = path.basename(dirPath);

    // Update the allowed root for this window
    allowedRoots.set(event.sender.id, dirPath);
    approveDialogPath(dirPath);

    return {
      path: dirPath,
      name,
    };
  });

  // Read file content
  ipcMain.handle("vfs:read-file", async (event, filePath) => {
    try {
      const resolved = validateVFSPath(event, filePath);
      return await fs.readFile(resolved, "utf-8");
    } catch (error) {
      // ENOENT is expected for optional config files — skip noisy logging
      if (error.code !== "ENOENT") {
        console.error("[VFS IPC] readFile failed:", error);
      }
      throw error;
    }
  });

  // Write file content
  ipcMain.handle("vfs:write-file", async (event, filePath, content) => {
    try {
      const resolved = validateVFSPath(event, filePath);
      // Use open -> write -> sync -> close pattern for better compatibility with virtual file systems (e.g., Google Drive on Windows)
      const fileHandle = await fs.open(resolved, "w");
      try {
        await fileHandle.writeFile(content, "utf-8");
        // Explicitly sync to ensure data is flushed to disk (critical for Windows network drives)
        await fileHandle.sync();
      } finally {
        await fileHandle.close();
      }
    } catch (error) {
      console.error("[VFS IPC] writeFile failed:", error);
      console.error("[VFS IPC] Error details:", {
        message: error.message,
        code: error.code,
        syscall: error.syscall,
        path: filePath,
      });
      throw error;
    }
  });

  // Read directory entries
  ipcMain.handle("vfs:read-directory", async (event, dirPath) => {
    try {
      const resolved = validateVFSPath(event, dirPath);
      const entries = await fs.readdir(resolved, { withFileTypes: true });
      return entries.map((entry) => ({
        name: entry.name,
        kind: entry.isDirectory() ? "directory" : "file",
      }));
    } catch (error) {
      console.error("[VFS IPC] readDirectory failed:", error);
      throw error;
    }
  });

  // Get file stats
  ipcMain.handle("vfs:stat", async (event, filePath) => {
    try {
      const resolved = validateVFSPath(event, filePath);
      const stats = await fs.stat(resolved);
      return {
        size: stats.size,
        lastModified: stats.mtimeMs,
        type: stats.isDirectory() ? "directory" : "text/plain",
      };
    } catch (error) {
      // ENOENT is expected when callers use stat to check existence before creating
      if (error?.code !== "ENOENT") {
        console.error("[VFS IPC] stat failed:", error);
      }
      throw error;
    }
  });

  // Create directory (with parents)
  ipcMain.handle("vfs:mkdir", async (event, dirPath) => {
    try {
      const resolved = validateVFSPath(event, dirPath);
      await fs.mkdir(resolved, { recursive: true });
    } catch (error) {
      console.error("[VFS IPC] mkdir failed:", error);
      throw error;
    }
  });

  // Delete file or directory
  ipcMain.handle("vfs:delete", async (event, targetPath, options = {}) => {
    try {
      const resolved = validateVFSPath(event, targetPath);
      const stats = await fs.stat(resolved);
      if (stats.isDirectory()) {
        await fs.rm(resolved, { recursive: options.recursive || false });
      } else {
        await fs.unlink(resolved);
      }
    } catch (error) {
      console.error("[VFS IPC] delete failed:", error);
      throw error;
    }
  });

  // Rename file or directory
  ipcMain.handle("vfs:rename", async (event, oldPath, newPath) => {
    try {
      const resolvedOld = validateVFSPath(event, oldPath);
      const resolvedNew = validateVFSPath(event, newPath);
      await fs.rename(resolvedOld, resolvedNew);
    } catch (error) {
      console.error("[VFS IPC] rename failed:", error);
      throw error;
    }
  });

  /**
   * Return Windows system directory deny prefixes based on the actual system drive.
   * Uses the SystemRoot environment variable so the correct drive letter is detected
   * even on non-C: installations.
   * @returns {string[]}
   */
  function getWindowsDenyPrefixes() {
    if (process.platform !== "win32") return [];
    const sysRoot = (process.env.SystemRoot ?? "C:\\Windows").replace(/\\/g, "/");
    const sysDrive = sysRoot.split("/")[0];
    return [
      `${sysDrive}/Windows`,
      `${sysDrive}/Program Files`,
      `${sysDrive}/Program Files (x86)`,
      `${sysDrive}/ProgramData`,
    ];
  }

  /**
   * Check if a path is in the system-sensitive denylist.
   * Prevents access to critical system directories and credential stores.
   *
   * @param {string} normalizedPath - Forward-slash normalized absolute path
   * @returns {boolean} true if the path should be denied
   */
  function isDeniedPath(normalizedPath) {
    const homedir = normalizePath(os.homedir());

    // System root directories (Unix + macOS + Windows)
    // Treated as prefixes — block the directory itself AND any nested path
    const denyPrefixes = [
      "/",
      "/etc",
      "/usr",
      "/bin",
      "/sbin",
      "/var",
      "/tmp",
      "/System",
      "/private",
      "/private/etc",
      "/private/var",
    ];

    // Add Windows drive roots and system directories
    const driveLetterMatch = normalizedPath.match(/^([a-zA-Z]):?\/?$/);
    if (driveLetterMatch) return true; // Bare drive root (C:/ or C:)

    const windowsDenyPrefixes = getWindowsDenyPrefixes();

    // Sensitive directories within home
    const homeSensitiveSuffixes = [
      "/.ssh",
      "/.gnupg",
      "/.aws",
      "/.kube",
      "/.docker",
      "/.config/gcloud",
      "/Library/Keychains",
      // Windows (forward-slash normalized)
      "/AppData/Roaming/Microsoft/Credentials",
      "/AppData/Roaming/Microsoft/Protect",
      "/AppData/Local/Microsoft/Credentials",
    ];

    // Treat denied roots as prefixes — block any nested path under them
    if (denyPrefixes.some((dir) => normalizedPath === dir || normalizedPath.startsWith(`${dir}/`)))
      return true;
    if (normalizedPath === homedir) return true;
    const normalizedLower = normalizedPath.toLowerCase();
    if (
      windowsDenyPrefixes.some((p) => {
        const pLower = p.toLowerCase();
        return normalizedLower === pLower || normalizedLower.startsWith(`${pLower}/`);
      })
    )
      return true;
    if (homeSensitiveSuffixes.some((s) => normalizedPath.startsWith(homedir + s))) return true;

    return false;
  }

  // Set root directory programmatically (for restoring a recent project without dialog)
  ipcMain.handle("vfs:set-root", async (event, rootPath) => {
    const resolved = path.resolve(rootPath);
    const normalizedResolved = normalizePath(resolved);

    // 1. Deny system-sensitive paths
    if (isDeniedPath(normalizedResolved)) {
      throw new Error("セキュリティ上の理由により、このディレクトリへのアクセスは制限されています");
    }

    // 2. Verify the path actually exists and is a directory
    try {
      const stats = await fs.stat(resolved);
      if (!stats.isDirectory()) {
        throw new Error("指定されたパスはディレクトリではありません");
      }
    } catch (error) {
      if (error.code === "ENOENT") {
        throw new Error("指定されたディレクトリが見つかりません");
      }
      throw error;
    }

    // 3. Require dialog approval — renderer cannot promote arbitrary paths
    //    to VFS root without prior native dialog consent.
    //    If the path was not previously approved (e.g. after app restart),
    //    prompt the user with a native directory dialog for confirmation.
    //    This prevents a compromised renderer from escalating an arbitrary
    //    path to an allowed root (fixes security issue #1043).
    if (!dialogApprovedPaths.has(resolved)) {
      const win = BrowserWindow.fromWebContents(event.sender);
      const result = await dialog.showOpenDialog(win ?? undefined, {
        title: "プロジェクトフォルダへのアクセスを許可",
        defaultPath: resolved,
        properties: ["openDirectory"],
        message: `「${path.basename(resolved)}」フォルダへのアクセスを許可しますか？`,
      });

      if (result.canceled || !result.filePaths[0]) {
        throw new Error("ディレクトリへのアクセスが許可されませんでした");
      }

      // Only accept the exact path the user confirmed in the dialog
      const confirmedPath = path.resolve(result.filePaths[0]);
      if (normalizePath(confirmedPath) !== normalizedResolved) {
        throw new Error("選択されたディレクトリが要求されたパスと一致しません");
      }

      approveDialogPath(confirmedPath);
    }

    allowedRoots.set(event.sender.id, resolved);
    return { path: resolved, name: path.basename(resolved) };
  });

  // Clean up allowedRoots when a window is destroyed to prevent memory leaks
  app.on("web-contents-created", (_, contents) => {
    contents.on("destroyed", () => {
      allowedRoots.delete(contents.id);
    });
  });

  // ---------------------------------------------------------------------------
  // Cross-window history index lock (HistoryService)
  // ---------------------------------------------------------------------------
  // In-memory lock registry — atomic because the main-process event loop is
  // single-threaded. Each entry maps a lock key to the webContents id that
  // holds it. A queue of { resolve } entries handles waiters.
  const indexLockOwner = new Map(); // key -> webContentsId
  const indexLockQueue = new Map(); // key -> Array<{ resolve: () => void, senderId: number }>

  /**
   * Dequeue the next waiter for a lock key, if any.
   * Skips waiters whose webContents have been destroyed to prevent stuck locks.
   * The dequeued entry's resolve() will set the owner itself.
   * @param {string} key
   */
  function processIndexLockQueue(key) {
    const queue = indexLockQueue.get(key) || [];
    while (queue.length > 0 && !indexLockOwner.has(key)) {
      const next = queue.shift();
      if (queue.length === 0) {
        indexLockQueue.delete(key);
      }
      // Skip waiters whose webContents have been destroyed
      const wc = webContents.fromId(next.senderId);
      if (!wc || wc.isDestroyed()) {
        continue;
      }
      next.resolve();
      return;
    }
    if (queue.length === 0) {
      indexLockQueue.delete(key);
    }
  }

  ipcMain.handle("vfs:index-lock:acquire", async (event, key) => {
    const senderId = event.sender.id;

    if (!indexLockOwner.has(key)) {
      // Lock is free — acquire immediately
      indexLockOwner.set(key, senderId);
      return;
    }

    // Lock is held — enqueue this waiter and suspend until released
    await new Promise((resolve) => {
      const queue = indexLockQueue.get(key) || [];
      queue.push({ resolve, senderId });
      indexLockQueue.set(key, queue);
    });

    // Now the lock is free for us (processIndexLockQueue verified this before calling resolve)
    indexLockOwner.set(key, senderId);
  });

  ipcMain.handle("vfs:index-lock:release", (event, key) => {
    const senderId = event.sender.id;
    if (indexLockOwner.get(key) === senderId) {
      indexLockOwner.delete(key);
      processIndexLockQueue(key);
    }
  });

  /**
   * Release all locks held by a specific window (called when the window closes).
   * @param {number} webContentsId
   */
  function releaseLocksForWindow(webContentsId) {
    for (const [key, ownerId] of indexLockOwner) {
      if (ownerId === webContentsId) {
        indexLockOwner.delete(key);
        processIndexLockQueue(key);
      }
    }
  }

  // Release index locks automatically when a window is destroyed
  app.on("browser-window-created", (_, win) => {
    const wcId = win.webContents.id;
    win.webContents.on("destroyed", () => {
      releaseLocksForWindow(wcId);
    });
  });
}

module.exports = { registerVFSHandlers };
