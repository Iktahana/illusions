/**
 * VFS IPC handlers for Electron
 * Provides file system operations for the renderer process
 */

const { ipcMain, dialog, app, BrowserWindow, webContents } = require("electron");
const fs = require("fs/promises");
const path = require("path");
const { createApprovedPathRegistry, isWithinApprovedTree } = require("../lib/approved-paths");
const {
  toForwardSlash,
  assertPathInsideRoot,
  normalizeForCompare,
  resolveRealPath,
} = require("../lib/path-utils");
const { isSensitiveSystemPath, MAX_CONTENT_BYTES } = require("../lib/path-policy");
const { VFS_CHANNELS } = require("../lib/ipc-channels");
const { readFileStrictUtf8 } = require("../lib/text-decode");
// #1476: rehydration — begin
const { loadApprovals, saveApprovals } = require("../lib/vfs-approvals");
const { createIndexLockManager } = require("../lib/index-lock");
const { setVfsRoot, clearVfsRoot } = require("../lib/vfs-root-registry");
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
   * Normalize a path to the canonical comparison form (forward slashes, no
   * trailing slash, NFC). Delegates to the shared path-utils primitive so the
   * NFC-immunity contract documented in approved-paths.js actually holds: macOS
   * dialogs return the on-disk NFD form for Japanese names while the renderer /
   * recent-projects list supplies NFC, and set-root must treat them as equal
   * (#1955 follow-up). Trailing slashes are trimmed because VFS roots are
   * prefix-matched (`${root}/`) by assertPathInsideRoot.
   * @param {string} p
   * @returns {string}
   */
  function normalizePath(p) {
    return normalizeForCompare(p);
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
  ipcMain.handle(VFS_CHANNELS.invoke.openDirectory, async (event) => {
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
    setVfsRoot(event.sender.id, allowedRoots.get(event.sender.id));
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
  ipcMain.handle(VFS_CHANNELS.invoke.readFile, async (event, filePath) => {
    try {
      const resolved = await validateVFSPath(event, filePath);
      const stats = await fs.stat(resolved);
      if (stats.size > MAX_READ_BYTES) {
        throw new Error("ファイルサイズが上限を超えています");
      }
      // Read as strict UTF-8 and BOM-strip. Non-UTF-8 byte sequences throw
      // (code "NON_UTF8") instead of being silently replaced with U+FFFD, which
      // previously let a non-UTF-8 manuscript open lossy and be saved back over
      // the original (#1888). App-written metadata/JSON (project.json,
      // workspace.json, etc.) is always valid UTF-8 and decodes unchanged;
      // genuinely non-UTF-8 files are refused. Callers that read arbitrary
      // project files (e.g. search indexing) already handle read errors
      // per-file and simply skip the offending file.
      return await readFileStrictUtf8(resolved);
    } catch (error) {
      // ENOENT is expected for optional config files — skip noisy logging
      if (error.code !== "ENOENT") {
        console.error("[VFS IPC] readFile failed:", error);
      }
      throw error;
    }
  });

  // Write file content
  ipcMain.handle(VFS_CHANNELS.invoke.writeFile, async (event, filePath, content) => {
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
  ipcMain.handle(VFS_CHANNELS.invoke.readDirectory, async (event, dirPath) => {
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
  ipcMain.handle(VFS_CHANNELS.invoke.stat, async (event, filePath) => {
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
  ipcMain.handle(VFS_CHANNELS.invoke.exists, async (event, filePath) => {
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
  ipcMain.handle(VFS_CHANNELS.invoke.mkdir, async (event, dirPath) => {
    try {
      const resolved = await validateVFSPath(event, dirPath);
      await fs.mkdir(resolved, { recursive: true });
    } catch (error) {
      console.error("[VFS IPC] mkdir failed:", error);
      throw error;
    }
  });

  // Delete file or directory
  ipcMain.handle(VFS_CHANNELS.invoke.delete, async (event, targetPath, options = {}) => {
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
  ipcMain.handle(VFS_CHANNELS.invoke.rename, async (event, oldPath, newPath) => {
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
  ipcMain.handle(VFS_CHANNELS.invoke.setRoot, async (event, rootPath, projectId) => {
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
        // Prefix with the ENOENT marker so the renderer can classify this as a
        // "folder not found" failure across the IPC boundary — ipcMain.handle
        // serialization strips custom error properties like `.code`, but the
        // message survives, so callers can offer recovery (remove from recent).
        throw new Error("ENOENT: 指定されたディレクトリが見つかりません");
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
    let alreadyApprovedInSession = dialogApprovedPaths.has(event.sender.id, resolved);

    // A path inside an already-approved tree is itself approved. The new-project
    // flow approves the *parent* via openDirectory(), then creates a child folder
    // and promotes it to root — that child is legitimately accessible (the VFS
    // already grants read/write to the whole approved tree), so re-prompting is
    // both unnecessary and broken: on macOS the second dialog returns the NFD
    // on-disk name while the requested path is NFC, so the exact-match check at
    // step 5 would reject it ("選択されたディレクトリが要求されたパスと一致しません").
    if (!alreadyApprovedInSession) {
      const approvedTrees = dialogApprovedPaths
        .listWindowPaths(event.sender.id)
        .map((approved) => normalizePath(approved));
      if (isWithinApprovedTree(approvedTrees, normalizedResolved)) {
        approveDialogPath(event.sender.id, resolved);
        alreadyApprovedInSession = true;
      }
    }

    let alreadyApprovedFromDisk = false;
    if (!alreadyApprovedInSession && effectiveProjectId) {
      const persistedSet = await loadApprovals(APPROVED_PATHS_FILE, effectiveProjectId);
      // Persisted entries were written from earlier dialog confirmations, so on
      // macOS they may carry the on-disk NFD form while the requested path is
      // NFC (or vice versa). Fold both sides to NFC so a Japanese-named project
      // matches its stored approval regardless of Unicode encoding (#1955).
      const persistedNFC = new Set([...persistedSet].map((p) => normalizePath(p)));
      alreadyApprovedFromDisk =
        persistedNFC.has(resolvedReal) || persistedNFC.has(normalizedResolved);
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
    const rootEntry = { path: resolved, realPath: resolvedReal };
    allowedRoots.set(event.sender.id, rootEntry);
    setVfsRoot(event.sender.id, rootEntry);
    return { path: resolved, name: path.basename(resolved) };
  });

  // Clean up allowedRoots, dialogApprovedPaths, and senderProjectId when a window is destroyed
  app.on("web-contents-created", (_, contents) => {
    contents.on("destroyed", () => {
      allowedRoots.delete(contents.id);
      clearVfsRoot(contents.id);
      dialogApprovedPaths.revokeWindow(contents.id);
      // #1476: rehydration — clean up projectId association
      senderProjectId.delete(contents.id);
    });
  });

  // Open a single file via native file dialog
  // Returns { path, name, buf } where buf is the raw file bytes (Buffer).
  // The caller is responsible for decoding (e.g., via text-codec.ts).
  ipcMain.handle(VFS_CHANNELS.invoke.openFile, async (event, opts) => {
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

  ipcMain.handle(VFS_CHANNELS.invoke.indexLockAcquire, (event, key) => {
    return indexLocks.acquire(key, event.sender.id);
  });

  ipcMain.handle(VFS_CHANNELS.invoke.indexLockRelease, (event, key) => {
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
