/* eslint-disable no-console */
/**
 * VFS IPC handlers for Electron
 * Provides file system operations for the renderer process
 */

const { ipcMain, dialog, app, BrowserWindow, webContents } = require("electron");
const fs = require("fs/promises");
const path = require("path");
const { createApprovedPathRegistry } = require("../lib/approved-paths");
const {
  toForwardSlash,
  assertPathInsideRoot,
  normalizeSeparators,
  trimTrailingSlashes,
  resolveRealPath,
} = require("../lib/path-utils");
const { isSensitiveSystemPath, MAX_CONTENT_BYTES } = require("../lib/path-policy");
// #1476: rehydration — begin
const { loadApprovals, saveApprovals } = require("../lib/vfs-approvals");
const { createIndexLockManager } = require("../lib/index-lock");
// #1476: rehydration — end

function registerVFSHandlers() {
  // Track the opened root directory per window for path validation.
  // #1559: each entry stores both the lexical root (as seen by the renderer)
  // and its physical realpath so symlink-collapsed containment can be checked.
  /** @type {Map<number, { path: string, realPath: string }>} */
  const allowedRoots = new Map();

  /**
   * Resolve the realpath of a root directory, falling back to the lexical
   * path when realpath fails (e.g. permission edge cases).
   * @param {string} rootPath - Absolute root directory path
   * @returns {Promise<string>}
   */
  async function resolveRootRealPath(rootPath) {
    try {
      return await fs.realpath(rootPath);
    } catch {
      return rootPath;
    }
  }

  // Track paths that were selected via the native file dialog.
  // Per-window bounded LRU semantics live in electron/lib/approved-paths.js
  // (same registry as file-ipc.js — prevents unbounded memory growth and
  // cross-window path reuse). Intentional difference vs file-ipc.js: this
  // registry is created per registerVFSHandlers() call and stays encapsulated
  // inside the VFS handler closure.
  const dialogApprovedPaths = createApprovedPathRegistry();

  // #1476: rehydration — begin
  /**
   * Path to the persistent approved-vfs-paths.json file stored in userData.
   * @type {string}
   */
  const APPROVED_PATHS_FILE = path.join(app.getPath("userData"), "approved-vfs-paths.json");

  /**
   * Maps senderId (webContents.id) → projectId.
   * Populated by the `vfs:set-root` handler so that `approveDialogPath` can
   * associate approvals with the correct project.
   * @type {Map<number, string>}
   */
  const senderProjectId = new Map();

  /**
   * Debounce timer for persisting approvals to disk.
   * Prevents repeated rapid writes during bulk approval.
   * @type {NodeJS.Timeout | null}
   */
  let saveDebounceTimer = null;

  /**
   * Debounced wrapper for saveApprovals — flushes after 500 ms of inactivity.
   * @param {string} projectId
   * @param {Set<string>} paths
   */
  function scheduleSaveApprovals(projectId, paths) {
    if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
    saveDebounceTimer = setTimeout(() => {
      saveDebounceTimer = null;
      saveApprovals(APPROVED_PATHS_FILE, projectId, paths).catch((err) => {
        console.error("[VFS IPC] Failed to persist approved paths:", err);
      });
    }, 500);
  }
  // #1476: rehydration — end

  /**
   * Add a path to the dialog-approved set for a specific window, with LRU eviction.
   * Delegates to the shared per-window registry (electron/lib/approved-paths.js).
   * @param {number} senderId - The webContents ID of the approving window
   * @param {string} p - The path to approve
   */
  function approveDialogPath(senderId, p) {
    dialogApprovedPaths.approve(senderId, p);
  }

  /**
   * Normalize path separators to forward slashes for cross-platform compatibility.
   * Intentional difference vs file-ipc.js: trailing slashes are trimmed here
   * because VFS roots are prefix-matched (`${root}/`) by assertPathInsideRoot.
   * @param {string} p
   * @returns {string}
   */
  function normalizePath(p) {
    return trimTrailingSlashes(normalizeSeparators(p));
  }

  /**
   * Validate that a requested path is within the allowed root directory.
   * Prevents path traversal attacks from a compromised renderer.
   *
   * #1559: in addition to the lexical prefix check, the path is collapsed
   * via fs.realpath right before I/O so a symlink placed inside the root
   * cannot redirect reads/writes to a target outside the (real) root.
   *
   * @param {Electron.IpcMainInvokeEvent} event - The IPC event to identify the sender window
   * @param {string} requestedPath - The path to validate
   * @returns {Promise<string>} The validated forward-slash path
   */
  async function validateVFSPath(event, requestedPath) {
    const allowedRoot = allowedRoots.get(event.sender.id);
    if (!allowedRoot) {
      throw new Error("ディレクトリが開かれていません");
    }
    // Normalize the incoming path to forward slashes, resolving any traversal segments
    const normalizedResolved = toForwardSlash(requestedPath);
    const normalizedRoot = normalizePath(allowedRoot.path);

    assertPathInsideRoot(normalizedResolved, normalizedRoot);

    // #1559: collapse symlinks and re-check containment against the real root
    const realResolved = toForwardSlash(await resolveRealPath(normalizedResolved));
    const normalizedRealRoot = normalizePath(allowedRoot.realPath);
    assertPathInsideRoot(realResolved, normalizedRealRoot);

    return normalizedResolved;
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
    // #1559: store the realpath so symlink-collapsed containment can be checked
    allowedRoots.set(event.sender.id, {
      path: dirPath,
      realPath: await resolveRootRealPath(dirPath),
    });
    approveDialogPath(event.sender.id, dirPath);

    return {
      path: dirPath,
      name,
    };
  });

  // Maximum file size allowed for VFS read — intentionally the same 50 MB limit
  // as the shared write/save limit (electron/lib/path-policy.js)
  const MAX_READ_BYTES = MAX_CONTENT_BYTES;

  // Read file content
  ipcMain.handle("vfs:read-file", async (event, filePath) => {
    try {
      const resolved = await validateVFSPath(event, filePath);
      const stats = await fs.stat(resolved);
      if (stats.size > MAX_READ_BYTES) {
        throw new Error("ファイルサイズが上限を超えています");
      }
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
    // Validate content type and size before touching disk
    if (typeof content !== "string") {
      throw new Error("Invalid content: expected string");
    }
    if (Buffer.byteLength(content, "utf-8") > MAX_CONTENT_BYTES) {
      throw new Error("ファイルサイズが上限を超えています（50 MB）");
    }
    try {
      const resolved = await validateVFSPath(event, filePath);
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
      const resolved = await validateVFSPath(event, dirPath);
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
      const resolved = await validateVFSPath(event, filePath);
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

  // Check whether a path exists without throwing on ENOENT.
  // Returns false for missing paths; re-throws genuine errors (e.g. EACCES)
  // so real problems stay visible. Use this for existence checks instead of
  // relying on stat/readFile rejections, which Electron logs as handler errors.
  ipcMain.handle("vfs:exists", async (event, filePath) => {
    try {
      const resolved = await validateVFSPath(event, filePath);
      await fs.stat(resolved);
      return true;
    } catch (error) {
      if (error?.code === "ENOENT") {
        return false;
      }
      console.error("[VFS IPC] exists failed:", error);
      throw error;
    }
  });

  // Create directory (with parents)
  ipcMain.handle("vfs:mkdir", async (event, dirPath) => {
    try {
      const resolved = await validateVFSPath(event, dirPath);
      await fs.mkdir(resolved, { recursive: true });
    } catch (error) {
      console.error("[VFS IPC] mkdir failed:", error);
      throw error;
    }
  });

  // Delete file or directory
  ipcMain.handle("vfs:delete", async (event, targetPath, options = {}) => {
    try {
      const resolved = await validateVFSPath(event, targetPath);
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
      const resolvedOld = await validateVFSPath(event, oldPath);
      const resolvedNew = await validateVFSPath(event, newPath);
      await fs.rename(resolvedOld, resolvedNew);
    } catch (error) {
      console.error("[VFS IPC] rename failed:", error);
      throw error;
    }
  });

  /**
   * Extra home-relative deny prefixes specific to the VFS policy (forward-slash
   * normalized Windows credential stores). Intentional difference vs
   * file-ipc.js (isSavePathDenied): the VFS exposes read access to a whole
   * approved tree, so credential stores are denied in addition to the shared
   * base policy in electron/lib/path-policy.js.
   * @type {readonly string[]}
   */
  const VFS_EXTRA_HOME_SENSITIVE_SUFFIXES = [
    "/AppData/Roaming/Microsoft/Credentials",
    "/AppData/Roaming/Microsoft/Protect",
    "/AppData/Local/Microsoft/Credentials",
  ];

  /**
   * Check if a path is in the system-sensitive denylist.
   * Prevents access to critical system directories and credential stores.
   * Delegates to the shared policy plus the VFS-specific extras above.
   *
   * @param {string} normalizedPath - Forward-slash normalized absolute path
   * @returns {boolean} true if the path should be denied
   */
  function isDeniedPath(normalizedPath) {
    return isSensitiveSystemPath(normalizedPath, {
      extraHomeSensitiveSuffixes: VFS_EXTRA_HOME_SENSITIVE_SUFFIXES,
    });
  }

  // Set root directory programmatically (for restoring a recent project without dialog)
  // #1476: rehydration — extended to accept projectId for project-scoped approval persistence
  ipcMain.handle("vfs:set-root", async (event, rootPath, projectId) => {
    const resolved = path.resolve(rootPath);
    const normalizedResolved = normalizePath(resolved);

    // 1. Deny system-sensitive paths
    if (isDeniedPath(normalizedResolved)) {
      throw new Error("セキュリティ上の理由により、このディレクトリへのアクセスは制限されています");
    }

    // 2. Verify the path actually exists and is a directory
    let resolvedReal;
    try {
      const stats = await fs.stat(resolved);
      if (!stats.isDirectory()) {
        throw new Error("指定されたパスはディレクトリではありません");
      }
      // #1476: rehydration — resolve symlinks to mitigate path-traversal via symlink
      try {
        resolvedReal = normalizePath(await fs.realpath(resolved));
      } catch {
        resolvedReal = normalizedResolved;
      }
    } catch (error) {
      if (error.code === "ENOENT") {
        throw new Error("指定されたディレクトリが見つかりません");
      }
      throw error;
    }

    // 3. Register projectId association for this sender
    // #1476: rehydration — store projectId so approvals can be project-scoped
    if (typeof projectId === "string" && projectId) {
      senderProjectId.set(event.sender.id, projectId);
    }
    const effectiveProjectId = senderProjectId.get(event.sender.id);

    // 4. Check approval: in-session dialog approval OR persisted project approval
    // #1476: rehydration — load persisted approvals so re-prompting is skipped on restart
    const alreadyApprovedInSession = dialogApprovedPaths.has(event.sender.id, resolved);
    let alreadyApprovedFromDisk = false;
    if (!alreadyApprovedInSession && effectiveProjectId) {
      const persistedSet = await loadApprovals(APPROVED_PATHS_FILE, effectiveProjectId);
      alreadyApprovedFromDisk = persistedSet.has(resolvedReal) || persistedSet.has(resolved);
      if (alreadyApprovedFromDisk) {
        // Restore in-session approval so subsequent calls are fast
        approveDialogPath(event.sender.id, resolved);
      }
    }

    if (!alreadyApprovedInSession && !alreadyApprovedFromDisk) {
      // 5. Require dialog approval — renderer cannot promote arbitrary paths
      //    to VFS root without prior native dialog consent.
      //    If the path was not previously approved (e.g. after app restart),
      //    prompt the user with a native directory dialog for confirmation.
      //    This prevents a compromised renderer from escalating an arbitrary
      //    path to an allowed root (fixes security issue #1043).
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

      approveDialogPath(event.sender.id, confirmedPath);

      // #1476: rehydration — persist the newly approved path so restart skips the dialog
      if (effectiveProjectId) {
        const windowPaths = dialogApprovedPaths.listWindowPaths(event.sender.id);
        const pathsToSave = new Set(windowPaths.length > 0 ? windowPaths : [confirmedPath]);
        scheduleSaveApprovals(effectiveProjectId, pathsToSave);
      }
    }

    // #1559: store the realpath alongside the lexical root so per-I/O
    // symlink-collapsed containment checks have a trusted physical root
    allowedRoots.set(event.sender.id, { path: resolved, realPath: resolvedReal });
    return { path: resolved, name: path.basename(resolved) };
  });

  // Clean up allowedRoots, dialogApprovedPaths, and senderProjectId when a window is destroyed
  app.on("web-contents-created", (_, contents) => {
    contents.on("destroyed", () => {
      allowedRoots.delete(contents.id);
      dialogApprovedPaths.revokeWindow(contents.id);
      // #1476: rehydration — clean up projectId association
      senderProjectId.delete(contents.id);
    });
  });

  // Open a single file via native file dialog
  // Returns { path, name, buf } where buf is the raw file bytes (Buffer).
  // The caller is responsible for decoding (e.g., via text-codec.ts).
  ipcMain.handle("vfs:open-file", async (event, opts) => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: opts?.filters ?? [{ name: "テキスト", extensions: ["txt"] }],
    });

    if (result.canceled || !result.filePaths[0]) {
      return null;
    }

    const filePath = result.filePaths[0];
    // R2: approveDialogPath requires 2-arg (senderId, path) signature
    approveDialogPath(event.sender.id, filePath);
    const buf = await fs.readFile(filePath);
    return { path: filePath, name: path.basename(filePath), buf };
  });

  // ---------------------------------------------------------------------------
  // Cross-window history index lock (HistoryService)
  // ---------------------------------------------------------------------------
  // Lock logic lives in electron/lib/index-lock.js (#1567 S3 hardening):
  // renderer-supplied keys are validated and acquire() times out instead of
  // hanging forever when another window holds the lock.
  const indexLocks = createIndexLockManager({
    isSenderAlive: (senderId) => {
      const wc = webContents.fromId(senderId);
      return Boolean(wc) && !wc.isDestroyed();
    },
  });

  ipcMain.handle("vfs:index-lock:acquire", (event, key) => {
    return indexLocks.acquire(key, event.sender.id);
  });

  ipcMain.handle("vfs:index-lock:release", (event, key) => {
    indexLocks.release(key, event.sender.id);
  });

  // Release index locks automatically when a window is destroyed
  app.on("browser-window-created", (_, win) => {
    const wcId = win.webContents.id;
    win.webContents.on("destroyed", () => {
      indexLocks.releaseAllForSender(wcId);
    });
  });
}

module.exports = { registerVFSHandlers };
