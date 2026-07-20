// File-related IPC handlers: open, save, export, and file security utilities

const { ipcMain, dialog, app } = require("electron");
const path = require("path");
const fs = require("fs/promises");
const log = require("electron-log");
const { createApprovedPathRegistry } = require("../lib/approved-paths");
const { normalizeSeparators } = require("../lib/path-utils");
const { isSensitiveSystemPath, MAX_CONTENT_BYTES } = require("../lib/path-policy");
const { FILE_CHANNELS, EXPORT_CHANNELS } = require("../lib/ipc-channels");
const { readFileStrictUtf8 } = require("../lib/text-decode");
const { addStandalonePath, hasStandalonePath } = require("../lib/standalone-files");

/**
 * Absolute path to the persisted standalone-opened-paths allowlist (#1965).
 * Resolved lazily so tests/headless contexts without an Electron `app` don't
 * crash at module load.
 * @returns {string}
 */
function getStandalonePathsFile() {
  return path.join(app.getPath("userData"), "approved-standalone-paths.json");
}

/**
 * Record a standalone-opened file in the persisted allowlist so it can be
 * re-read on the next launch (session restore). Failures are non-fatal: opening
 * the file must still succeed even if the allowlist write fails.
 * @param {string} resolvedPath - Already path.resolve()'d absolute path
 */
async function rememberStandalonePath(resolvedPath) {
  try {
    await addStandalonePath(getStandalonePathsFile(), resolvedPath);
  } catch (err) {
    log.warn("standalone パスの永続化に失敗しました:", err);
  }
}

/**
 * Write generated binary exports with the same flush/close discipline as the
 * normal save path. This reduces false-success writes on Windows cloud/network
 * folders where fs.writeFile can return before bytes are durably persisted.
 *
 * @param {string} target
 * @param {Buffer | Uint8Array} buffer
 */
async function writeBufferDurably(target, buffer) {
  const fileHandle = await fs.open(target, "w");
  try {
    await fileHandle.writeFile(buffer);
    await fileHandle.sync();
  } finally {
    await fileHandle.close();
  }
}

// --- save-file path security validation ---
// Tracks file paths that have been approved via native dialog or system file association,
// scoped per BrowserWindow (webContentsId) to prevent cross-window path reuse.
// LRU semantics (bounded per-window set) live in electron/lib/approved-paths.js.
// Intentional difference vs vfs-ipc.js: this registry is module-level so save-file
// approvals persist for the whole app lifetime (until the window is destroyed).
const dialogApprovedPaths = createApprovedPathRegistry();

/**
 * Add a path to the dialog-approved set for a specific window, with LRU eviction.
 * @param {number} webContentsId - The webContents ID of the approving window
 * @param {string} p - The resolved file path to approve
 */
function approveDialogPath(webContentsId, p) {
  dialogApprovedPaths.approve(webContentsId, p);
}

/**
 * Remove the approved-path set for a destroyed window to prevent memory leaks.
 * @param {number} webContentsId - The webContents ID of the destroyed window
 */
function revokeWindowApprovedPaths(webContentsId) {
  dialogApprovedPaths.revokeWindow(webContentsId);
}

/**
 * Check whether a normalized path points to a system-sensitive location.
 * Delegates to the shared policy in electron/lib/path-policy.js.
 *
 * Intentional difference vs vfs-ipc.js (isDeniedPath): the save-file policy uses
 * the base deny list with NO extra home suffixes, because save-file writes are
 * additionally gated by per-window dialog approval and an extension allowlist.
 * vfs-ipc.js adds Windows credential-store suffixes on top of the base policy.
 *
 * @param {string} normalizedPath - Forward-slash normalized absolute path
 * @returns {boolean} true if the path should be denied
 */
function isSavePathDenied(normalizedPath) {
  return isSensitiveSystemPath(normalizedPath);
}

const VALID_SAVE_FILE_TYPES = [".mdi", ".md", ".txt"];

/**
 * Validate a file path provided by the renderer for the save-file IPC handler.
 * Returns an error object if validation fails, or null if the path is valid.
 * @param {string} filePath - The raw file path from the renderer
 * @param {{ skipApproval?: boolean, webContentsId?: number }} [options] - Validation options
 * @param {boolean} [options.skipApproval=false] - Skip the dialog-approval check (for dialog-selected paths)
 * @param {number} [options.webContentsId] - The webContents ID of the requesting window; required unless skipApproval is true
 * @returns {{ success: false, error: string, code: string } | null}
 */
function validateSaveFilePath(filePath, { skipApproval = false, webContentsId } = {}) {
  // Reject paths containing '..' to prevent directory traversal
  const resolved = path.resolve(filePath);
  // Intentional difference vs vfs-ipc.js: no trailing-slash trim here — the bare
  // root "/" must stay "/" so the system deny list matches it (fail closed).
  const normalized = normalizeSeparators(resolved);
  if (filePath.includes("..")) {
    log.warn(`save-file path rejected (directory traversal): ${filePath}`);
    return {
      success: false,
      error: "パスに不正なディレクトリ遷移が含まれています",
      code: "PATH_TRAVERSAL",
    };
  }

  // Reject system-sensitive paths
  // Check both the file itself and its parent directory
  if (
    isSavePathDenied(normalized) ||
    isSavePathDenied(normalizeSeparators(path.dirname(normalized)))
  ) {
    log.warn(`save-file path rejected (denied location): ${filePath}`);
    return {
      success: false,
      error: "セキュリティ上の理由により、この場所への書き込みは許可されていません",
      code: "PATH_DENIED",
    };
  }

  // Check if this path was previously approved via dialog or system file open.
  // Approval is scoped to the requesting window to prevent cross-window reuse.
  // Dialog-approved paths bypass the extension check because the user already
  // consented to the file (e.g. they opened a .json or .log file via the open dialog).
  const isApproved =
    skipApproval || (webContentsId != null && dialogApprovedPaths.has(webContentsId, resolved));

  // Validate file extension — skip for dialog-approved paths
  if (!isApproved) {
    const ext = path.extname(resolved).toLowerCase();
    if (!VALID_SAVE_FILE_TYPES.includes(ext)) {
      log.warn(`save-file path rejected (invalid extension "${ext}"): ${filePath}`);
      return { success: false, error: `無効なファイル拡張子: ${ext}`, code: "INVALID_EXTENSION" };
    }
  }

  // Reject paths not previously approved via dialog or system file open.
  // Approval is scoped to the requesting window to prevent cross-window reuse.
  if (!isApproved) {
    log.warn(
      `save-file path rejected (not dialog-approved for window ${webContentsId}): ${filePath}`,
    );
    return {
      success: false,
      error: "ダイアログで承認されていないファイルパスです",
      code: "PATH_NOT_APPROVED",
    };
  }

  return null;
}

/**
 * Walk up the directory tree from the given path to find a project root
 * (a directory that contains a .illusions/ folder).
 * @param {string} dirPath - Directory path to start searching from
 * @returns {Promise<string|null>} The project root path if found, null otherwise
 */
async function findProjectRoot(dirPath) {
  let current = path.resolve(dirPath);
  while (true) {
    try {
      const illusionsPath = path.join(current, ".illusions");
      const stats = await fs.stat(illusionsPath);
      if (stats.isDirectory()) {
        return current;
      }
    } catch {
      // .illusions not found at this level, continue walking up
    }
    const parent = path.dirname(current);
    if (parent === current) {
      // Reached filesystem root without finding a project
      return null;
    }
    current = parent;
  }
}

/**
 * Handle opening a .mdi file from the system.
 * Detects if the file is part of a project and opens accordingly.
 * @param {string} filePath - Path to the .mdi file
 */
async function handleMdiFileOpen(filePath) {
  const { BrowserWindow } = require("electron");
  // Defer require to avoid circular dependency with window-manager.js
  const { getMainWindow } = require("../window-manager");
  const targetWindow = BrowserWindow.getFocusedWindow() || getMainWindow();
  if (!targetWindow || !targetWindow.webContents) {
    return false;
  }

  try {
    const dirPath = path.dirname(filePath);
    const projectRoot = await findProjectRoot(dirPath);

    if (projectRoot) {
      // Open as project with this file as initial file (relative to project root)
      const relativePath = path.relative(projectRoot, filePath);
      log.info("Opening as project:", projectRoot, "Initial file:", relativePath);
      targetWindow.webContents.send(FILE_CHANNELS.event.openAsProject, {
        projectPath: projectRoot,
        initialFile: relativePath,
      });
    } else {
      // Open as standalone file
      log.info("Opening as standalone file:", filePath);
      // Approve system-opened file path for future saves, scoped to the target window
      const resolved = path.resolve(filePath);
      approveDialogPath(targetWindow.webContents.id, resolved);
      // Persist to the standalone allowlist so it can be restored after a restart (#1965).
      await rememberStandalonePath(resolved);
      // Read as strict UTF-8: non-UTF-8 manuscripts throw instead of opening
      // with lossy U+FFFD that would later be saved back over the original (#1888).
      // BOM is stripped inside readFileStrictUtf8 (#1842).
      const content = await readFileStrictUtf8(filePath);
      targetWindow.webContents.send(FILE_CHANNELS.event.openFileFromSystem, {
        path: filePath,
        content,
      });
    }
    return true;
  } catch (err) {
    log.error("システムからのファイルオープンに失敗しました:", err);
    return false;
  }
}

// --- Pull-model pending file handler ---
// Renderer calls this after hooks are mounted, eliminating the race condition
// with the old did-finish-load push model.
// Use a queue so multiple open requests before window-ready are all preserved.
let pendingFilePaths = [];

function getPendingFilePath() {
  return pendingFilePaths.length > 0 ? pendingFilePaths[0] : null;
}

function setPendingFilePath(p) {
  pendingFilePaths.push(p);
}

function registerFileHandlers() {
  ipcMain.handle(FILE_CHANNELS.invoke.openFile, async (event) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [
        { name: "illusions MDI Document", extensions: ["mdi"] },
        { name: "Markdown", extensions: ["md"] },
        { name: "すべてのファイル", extensions: ["*"] },
      ],
    });
    if (canceled || !filePaths[0]) return null;
    const filePath = filePaths[0];
    // Approve opened file path so it can be saved back without a new dialog.
    // Scoped to the requesting window to prevent cross-window reuse.
    const resolved = path.resolve(filePath);
    approveDialogPath(event.sender.id, resolved);
    // Persist to the standalone allowlist so it can be restored after a restart (#1965).
    await rememberStandalonePath(resolved);
    // Read as strict UTF-8: non-UTF-8 files throw (surfaced to the renderer as
    // a "UTF-8 へ変換してから開いてください" notice) instead of opening with
    // lossy U+FFFD that a later save would write back over the original (#1888).
    // BOM is stripped inside readFileStrictUtf8 (#1842).
    const content = await readFileStrictUtf8(filePath);
    return { path: filePath, content };
  });

  // Re-read a standalone file for session restore (#1965). Unlike `open-file`
  // (which prompts a dialog) this reads silently — but ONLY for paths the user
  // previously opened in standalone mode (persisted allowlist). This is the safe
  // restore path for Electron standalone, where `vfs:read-file` always fails
  // because no VFS root is set. A successful read re-approves the path for the
  // requesting window so subsequent saves work without a fresh dialog.
  ipcMain.handle(FILE_CHANNELS.invoke.readStandaloneFile, async (event, filePath) => {
    if (typeof filePath !== "string" || !filePath) {
      return { success: false, code: "INVALID_INPUT", error: "Invalid file path" };
    }
    const resolved = path.resolve(filePath);
    // Gate on the persisted allowlist: never read a path the user did not open.
    if (!(await hasStandalonePath(getStandalonePathsFile(), resolved))) {
      return { success: false, code: "NOT_APPROVED", error: "未承認のパスです" };
    }
    try {
      // BOM is stripped inside readFileStrictUtf8 (#1842); non-UTF-8 throws (#1888).
      const content = await readFileStrictUtf8(resolved);
      // Re-approve for this window so the restored tab can be saved back.
      approveDialogPath(event.sender.id, resolved);
      return { success: true, path: resolved, content };
    } catch (err) {
      const code = err && err.code ? String(err.code) : "READ_FAILED";
      log.warn(`standalone ファイルの復元読み込みに失敗しました (${resolved}):`, err);
      return { success: false, code, error: String((err && err.message) || err) };
    }
  });

  ipcMain.handle(FILE_CHANNELS.invoke.saveFile, async (event, filePath, content, fileType) => {
    const senderWebContentsId = event.sender.id;

    // Validate inputs
    if (filePath != null && typeof filePath !== "string") {
      return { success: false, error: "Invalid file path", code: "INVALID_INPUT" };
    }
    if (typeof content !== "string") {
      return { success: false, error: "Invalid content", code: "INVALID_INPUT" };
    }
    if (Buffer.byteLength(content, "utf-8") > MAX_CONTENT_BYTES) {
      return {
        success: false,
        error: "ファイルサイズが上限を超えています（50 MB）",
        code: "CONTENT_TOO_LARGE",
      };
    }
    if (fileType != null && !VALID_SAVE_FILE_TYPES.includes(fileType)) {
      return { success: false, error: `Invalid file type: ${fileType}`, code: "INVALID_INPUT" };
    }

    let target = filePath;
    if (target) {
      // Validate renderer-provided path before writing.
      // Pass the sender's webContentsId to enforce per-window path approval.
      const validationError = validateSaveFilePath(target, { webContentsId: senderWebContentsId });
      if (validationError) return validationError;
      // Resolve to canonical form (consistent with dialogApprovedPaths entries)
      target = path.resolve(target);
    }
    if (!target) {
      // Determine default file name and filters based on fileType
      let defaultPath = "untitled.mdi";
      let filters = [
        { name: "illusions MDI Document", extensions: ["mdi"] },
        { name: "Markdown", extensions: ["md"] },
        { name: "テキストファイル", extensions: ["txt"] },
        { name: "すべてのファイル", extensions: ["*"] },
      ];
      if (fileType === ".md") {
        defaultPath = "untitled.md";
        filters = [
          { name: "Markdown", extensions: ["md"] },
          { name: "illusions MDI Document", extensions: ["mdi"] },
          { name: "テキストファイル", extensions: ["txt"] },
          { name: "すべてのファイル", extensions: ["*"] },
        ];
      } else if (fileType === ".txt") {
        defaultPath = "untitled.txt";
        filters = [
          { name: "テキストファイル", extensions: ["txt"] },
          { name: "illusions MDI Document", extensions: ["mdi"] },
          { name: "Markdown", extensions: ["md"] },
          { name: "すべてのファイル", extensions: ["*"] },
        ];
      }
      const result = await dialog.showSaveDialog({
        filters,
        defaultPath,
      });
      if (result.canceled || !result.filePath) return null;
      target = result.filePath;
      // Validate dialog-selected path (skip approval check since it came from the dialog)
      const dialogValidationError = validateSaveFilePath(target, { skipApproval: true });
      if (dialogValidationError) return dialogValidationError;
      // Approve this dialog-selected path for future saves, scoped to this window
      approveDialogPath(senderWebContentsId, path.resolve(target));
    }
    try {
      log.info(`ファイル保存を試行中: ${target}`);
      // Use open -> write -> sync -> close pattern for better compatibility with virtual file systems (e.g., Google Drive on Windows)
      const fileHandle = await fs.open(target, "w");
      try {
        await fileHandle.writeFile(content, "utf-8");
        // Explicitly sync to ensure data is flushed to disk (critical for Windows network drives)
        await fileHandle.sync();
      } finally {
        await fileHandle.close();
      }
      log.info(`ファイル保存成功: ${target}`);
      return target;
    } catch (error) {
      log.error(`ファイルの保存に失敗しました (パス: ${target}):`, error);
      // Provide detailed error information for better debugging
      const errorDetails = {
        message: error.message || "不明なエラー",
        code: error.code || "UNKNOWN",
        syscall: error.syscall || "unknown",
        path: target,
      };
      log.error("詳細エラー情報:", errorDetails);
      return { success: false, error: errorDetails.message, code: errorDetails.code };
    }
  });

  ipcMain.handle(FILE_CHANNELS.invoke.getPendingFile, async (event) => {
    if (pendingFilePaths.length === 0) return [];

    // Drain the queue and resolve each path
    const paths = pendingFilePaths.slice();
    pendingFilePaths = [];

    const results = [];
    for (const filePath of paths) {
      try {
        const dirPath = path.dirname(filePath);
        const projectRoot = await findProjectRoot(dirPath);

        if (projectRoot) {
          const relativePath = path.relative(projectRoot, filePath);
          results.push({
            type: "project",
            projectPath: projectRoot,
            initialFile: relativePath,
          });
        } else {
          // Standalone file: approve path for future saves, scoped to the requesting window
          approveDialogPath(event.sender.id, path.resolve(filePath));
          // Read as strict UTF-8: non-UTF-8 files throw (caught per-file below,
          // so no lossy tab is created) instead of opening with U+FFFD that a
          // later save would write back over the original (#1888).
          // BOM is stripped inside readFileStrictUtf8 (#1842).
          const content = await readFileStrictUtf8(filePath);
          results.push({
            type: "standalone",
            path: filePath,
            content,
          });
        }
      } catch (err) {
        log.error("get-pending-file failed:", err);
      }
    }
    return results;
  });

  // --- Export handlers ---

  ipcMain.handle(EXPORT_CHANNELS.invoke.generatePdfPreview, async (_event, content, options) => {
    if (typeof content !== "string") {
      return { success: false, error: "Invalid content" };
    }
    try {
      const { generatePdf } = require("../../src/lib/export/pdf-exporter");
      const pdfBuffer = await generatePdf(content, options || {});
      return { success: true, data: pdfBuffer.toString("base64") };
    } catch (error) {
      log.error("PDF preview generation failed:", error);
      return { success: false, error: error.message || "PDF preview generation failed" };
    }
  });

  ipcMain.handle(EXPORT_CHANNELS.invoke.exportPdf, async (_event, content, options) => {
    if (typeof content !== "string") {
      return { success: false, error: "Invalid content" };
    }
    if (Buffer.byteLength(content, "utf-8") > MAX_CONTENT_BYTES) {
      return {
        success: false,
        error: "コンテンツが大きすぎてエクスポートできません（50 MB）",
        code: "CONTENT_TOO_LARGE",
      };
    }
    try {
      const { generatePdf } = require("../../src/lib/export/pdf-exporter");
      const pdfBuffer = await generatePdf(content, options || {});

      const { filePath } = await dialog.showSaveDialog({
        title: "PDFとしてエクスポート",
        defaultPath: `${options?.metadata?.title || "untitled"}.pdf`,
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });

      if (!filePath) return null;
      await writeBufferDurably(filePath, pdfBuffer);
      log.info(`Exported PDF: ${filePath}`);
      return filePath;
    } catch (error) {
      log.error("PDF export failed:", error);
      return { success: false, error: error.message || "PDF export failed" };
    }
  });

  ipcMain.handle(EXPORT_CHANNELS.invoke.printDocument, async (_event, content, options) => {
    if (typeof content !== "string") {
      return { success: false, error: "Invalid content" };
    }
    // Declared outside try so the finally block can always destroy it,
    // preventing hidden BrowserWindow accumulation on print failures (#1919).
    let printWin = null;
    try {
      const { BrowserWindow } = require("electron");
      const { mdiToHtml } = require("../../src/lib/export/mdi-to-html");
      const { calculateTypesetting } = require("../../src/lib/export/pdf-export-settings");
      const { fullwidthIndentCount } = require("../../src/lib/export/fullwidth-indent");

      const opts = options || {};
      const pageSize = opts.pageSize ?? "A5";
      const margins = opts.margins ?? { top: 20, bottom: 20, left: 15, right: 15 };
      const verticalWriting = opts.verticalWriting ?? false;
      const landscape = opts.landscape ?? false;

      // Full-width-space 字下げ: literal U+3000 characters replace CSS text-indent.
      // When the toggle is on, suppress textIndentEm to avoid double indentation
      // (same logic as pdf-exporter.ts).
      const fullwidthSpaceCount = opts.fullwidthSpaceIndent
        ? fullwidthIndentCount(opts.textIndent ?? 0)
        : 0;
      const effectiveTextIndentEm = opts.fullwidthSpaceIndent ? 0 : opts.textIndent;

      // Build typesetting when chars/lines specified
      let typesetting;
      if (opts.charsPerLine != null && opts.linesPerPage != null) {
        const { fontSizeMm, lineHeightRatio } = calculateTypesetting(
          pageSize,
          margins,
          opts.charsPerLine,
          opts.linesPerPage,
          verticalWriting,
          landscape,
        );
        typesetting = {
          fontFamily: opts.fontFamily,
          fontSizeMm,
          lineHeightRatio,
          textIndentEm: effectiveTextIndentEm,
          margins,
          pageSize,
          landscape,
        };
      } else {
        typesetting = { pageSize, landscape, margins };
      }

      const html = mdiToHtml(content, {
        metadata: opts.metadata,
        verticalWriting,
        typesetting,
        googleFontFamily: opts.googleFontFamily,
        fileType: opts.fileType,
        fullwidthSpaceIndentCount: fullwidthSpaceCount,
        // Embed page numbers via CSS @page margin boxes so they appear in the
        // actual print output (webContents.print does not support
        // headerTemplate/footerTemplate unlike printToPDF).
        pageNumbers: opts.showPageNumbers
          ? {
              show: true,
              format: opts.pageNumberFormat,
              position: opts.pageNumberPosition,
            }
          : undefined,
      });

      const partition = `print-${Date.now()}`;
      printWin = new BrowserWindow({
        show: false,
        width: 800,
        height: 600,
        webPreferences: {
          offscreen: false,
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          partition,
        },
      });

      // CSP for print window (allow Google Fonts if needed)
      const hasGoogleFont = !!opts.googleFontFamily;
      const styleSrc = hasGoogleFont
        ? "style-src 'unsafe-inline' https://fonts.googleapis.com"
        : "style-src 'unsafe-inline'";
      const fontSrc = hasGoogleFont ? " font-src https://fonts.gstatic.com;" : "";
      printWin.webContents.session.webRequest.onHeadersReceived((details, callback) => {
        callback({
          responseHeaders: {
            ...details.responseHeaders,
            "Content-Security-Policy": [
              `default-src 'none'; ${styleSrc}; img-src 'self';${fontSrc}`,
            ],
          },
        });
      });

      const loadPromise = new Promise((resolve) => {
        printWin.webContents.once("did-finish-load", () => resolve());
      });

      await printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      await loadPromise;

      // Wait for fonts to load
      const delay = hasGoogleFont ? 2000 : 100;
      await new Promise((resolve) => setTimeout(resolve, delay));

      // Open system print dialog
      await new Promise((resolve, reject) => {
        printWin.webContents.print({ silent: false }, (success, failureReason) => {
          if (success) {
            resolve();
          } else {
            // User cancelled is not an error
            if (failureReason === "cancelled") {
              resolve();
            } else {
              reject(new Error(failureReason || "Print failed"));
            }
          }
        });
      });

      return { success: true };
    } catch (error) {
      log.error("Print failed:", error);
      return { success: false, error: error.message || "Print failed" };
    } finally {
      // Always destroy the hidden print window to prevent resource leaks,
      // regardless of whether the print succeeded, was cancelled, or failed.
      if (printWin && !printWin.isDestroyed()) {
        printWin.destroy();
      }
    }
  });

  ipcMain.handle(EXPORT_CHANNELS.invoke.exportEpub, async (_event, content, options) => {
    if (typeof content !== "string") {
      return { success: false, error: "Invalid content" };
    }
    if (Buffer.byteLength(content, "utf-8") > MAX_CONTENT_BYTES) {
      return {
        success: false,
        error: "コンテンツが大きすぎてエクスポートできません（50 MB）",
        code: "CONTENT_TOO_LARGE",
      };
    }
    try {
      // Defensive: ensure coverImage is Uint8Array regardless of IPC serialization quirks.
      // Structured clone normally preserves Uint8Array, but guard against edge cases.
      const epubOptions = { ...options };
      if (epubOptions.coverImage && !(epubOptions.coverImage instanceof Uint8Array)) {
        if (epubOptions.coverImage instanceof ArrayBuffer) {
          epubOptions.coverImage = new Uint8Array(epubOptions.coverImage);
        } else if (ArrayBuffer.isView(epubOptions.coverImage)) {
          const view = epubOptions.coverImage;
          epubOptions.coverImage = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
        }
      }

      // Normalize coverMediaType to JPEG/PNG only; drop cover if unsupported
      if (epubOptions.coverImage && epubOptions.coverMediaType) {
        const validTypes = ["image/jpeg", "image/png"];
        if (!validTypes.includes(epubOptions.coverMediaType)) {
          epubOptions.coverImage = undefined;
          epubOptions.coverMediaType = undefined;
        }
      }

      const { generateEpub } = require("../../src/lib/export/epub-exporter");
      const epubBuffer = await generateEpub(content, epubOptions);

      // Sanitize filename: remove characters invalid on Windows
      const rawTitle = epubOptions?.metadata?.title || "untitled";
      const safeTitle = rawTitle.replace(/[<>:"/\\|?*]/g, "_");

      const { filePath } = await dialog.showSaveDialog({
        title: "EPUBとしてエクスポート",
        defaultPath: `${safeTitle}.epub`,
        filters: [{ name: "EPUB", extensions: ["epub"] }],
      });

      if (!filePath) return null;
      await writeBufferDurably(filePath, epubBuffer);
      log.info(`Exported EPUB: ${filePath}`);
      return filePath;
    } catch (error) {
      log.error("EPUB export failed:", error);
      return { success: false, error: error.message || "EPUB export failed" };
    }
  });

  ipcMain.handle(EXPORT_CHANNELS.invoke.exportDocx, async (_event, content, options) => {
    if (typeof content !== "string") {
      return { success: false, error: "Invalid content" };
    }
    if (Buffer.byteLength(content, "utf-8") > MAX_CONTENT_BYTES) {
      return {
        success: false,
        error: "コンテンツが大きすぎてエクスポートできません（50 MB）",
        code: "CONTENT_TOO_LARGE",
      };
    }
    try {
      const { generateDocx } = require("../../src/lib/export/docx-exporter");
      const docxBuffer = await generateDocx(content, options || {});

      const { filePath } = await dialog.showSaveDialog({
        title: "DOCXとしてエクスポート",
        defaultPath: `${options?.metadata?.title || "untitled"}.docx`,
        filters: [{ name: "Word Document", extensions: ["docx"] }],
      });

      if (!filePath) return null;
      await writeBufferDurably(filePath, docxBuffer);
      log.info(`Exported DOCX: ${filePath}`);
      return filePath;
    } catch (error) {
      log.error("DOCX export failed:", error);
      return { success: false, error: error.message || "DOCX export failed" };
    }
  });

  // Clean up per-window approved paths when a BrowserWindow is closed/destroyed.
  // This prevents memory leaks and ensures stale approvals from destroyed windows
  // cannot accumulate in the dialogApprovedPaths map.
  const { app } = require("electron");
  app.on("web-contents-created", (_event, webContents) => {
    const wcId = webContents.id;
    webContents.on("destroyed", () => {
      revokeWindowApprovedPaths(wcId);
      log.debug(`Revoked approved paths for destroyed webContents id=${wcId}`);
    });
  });
}

module.exports = {
  approveDialogPath,
  revokeWindowApprovedPaths,
  handleMdiFileOpen,
  getPendingFilePath,
  setPendingFilePath,
  registerFileHandlers,
};
