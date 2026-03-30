/* eslint-disable no-console */
// File-related IPC handlers: open, save, export, and file security utilities

const { ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs/promises");
const os = require("os");
const log = require("electron-log");

// --- save-file path security validation ---
// Tracks file paths that have been approved via native dialog or system file association.
// Paths provided directly by the renderer must be in this set or they will be rejected.
// Uses a bounded LRU set to prevent unbounded memory growth in long sessions.
const MAX_APPROVED_PATHS = 200;
const dialogApprovedPaths = new Map();

/**
 * Add a path to the dialog-approved set with LRU eviction.
 * When the set exceeds MAX_APPROVED_PATHS, the least recently added entry is evicted.
 * @param {string} p - The resolved file path to approve
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
 * Check whether a normalized path points to a system-sensitive location.
 * Mirrors the deny-list logic in electron-vfs-ipc-handlers.js.
 * @param {string} normalizedPath - Forward-slash normalized absolute path
 * @returns {boolean} true if the path should be denied
 */
function isSavePathDenied(normalizedPath) {
  const homedir = os.homedir().split(path.sep).join("/");

  // System root directories (Unix + macOS + Windows)
  const denyExact = new Set([
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
  ]);

  // Bare Windows drive root (C:/ or C:)
  const driveLetterMatch = normalizedPath.match(/^([a-zA-Z]):?\/?$/);
  if (driveLetterMatch) return true;

  const windowsDenyPrefixes = ["C:/Windows", "C:/Program Files", "C:/Program Files (x86)"];

  // Sensitive directories within home
  const homeSensitiveSuffixes = [
    "/.ssh",
    "/.gnupg",
    "/.aws",
    "/.kube",
    "/.docker",
    "/.config/gcloud",
    "/Library/Keychains",
  ];

  // Treat denied roots as prefixes — block any nested path under them
  if ([...denyExact].some((dir) => normalizedPath === dir || normalizedPath.startsWith(`${dir}/`)))
    return true;
  if (normalizedPath === homedir || normalizedPath.startsWith(`${homedir}/`)) {
    // Allow writes inside home, but block sensitive subdirectories
    if (normalizedPath === homedir) return true;
    if (homeSensitiveSuffixes.some((s) => normalizedPath.startsWith(homedir + s))) return true;
  }
  const normalizedLower = normalizedPath.toLowerCase();
  if (
    windowsDenyPrefixes.some((p) => {
      const pLower = p.toLowerCase();
      return normalizedLower === pLower || normalizedLower.startsWith(`${pLower}/`);
    })
  )
    return true;

  return false;
}

const VALID_SAVE_FILE_TYPES = [".mdi", ".md", ".txt"];

/**
 * Validate a file path provided by the renderer for the save-file IPC handler.
 * Returns an error object if validation fails, or null if the path is valid.
 * @param {string} filePath - The raw file path from the renderer
 * @param {{ skipApproval?: boolean }} [options] - Validation options
 * @param {boolean} [options.skipApproval=false] - Skip the dialog-approval check (for dialog-selected paths)
 * @returns {{ success: false, error: string, code: string } | null}
 */
function validateSaveFilePath(filePath, { skipApproval = false } = {}) {
  // Reject paths containing '..' to prevent directory traversal
  const resolved = path.resolve(filePath);
  const normalized = resolved.split(path.sep).join("/");
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
    isSavePathDenied(path.dirname(normalized).split(path.sep).join("/"))
  ) {
    log.warn(`save-file path rejected (denied location): ${filePath}`);
    return {
      success: false,
      error: "セキュリティ上の理由により、この場所への書き込みは許可されていません",
      code: "PATH_DENIED",
    };
  }

  // Validate file extension
  const ext = path.extname(resolved).toLowerCase();
  if (!VALID_SAVE_FILE_TYPES.includes(ext)) {
    log.warn(`save-file path rejected (invalid extension "${ext}"): ${filePath}`);
    return { success: false, error: `無効なファイル拡張子: ${ext}`, code: "INVALID_EXTENSION" };
  }

  // Reject paths not previously approved via dialog or system file open
  if (!skipApproval && !dialogApprovedPaths.has(resolved)) {
    log.warn(`save-file path rejected (not dialog-approved): ${filePath}`);
    return {
      success: false,
      error: "ダイアログで承認されていないファイルパスです",
      code: "PATH_NOT_APPROVED",
    };
  }

  return null;
}

/**
 * Check if a directory contains a .illusions folder (project marker).
 * @param {string} dirPath - Directory path to check
 * @returns {Promise<boolean>} True if .illusions folder exists
 */
async function isProjectDirectory(dirPath) {
  try {
    const illusionsPath = path.join(dirPath, ".illusions");
    const stats = await fs.stat(illusionsPath);
    return stats.isDirectory();
  } catch {
    return false;
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
    const isProject = await isProjectDirectory(dirPath);

    if (isProject) {
      // Open as project with this file as initial file
      log.info("Opening as project:", dirPath, "Initial file:", path.basename(filePath));
      targetWindow.webContents.send("open-as-project", {
        projectPath: dirPath,
        initialFile: path.basename(filePath),
      });
    } else {
      // Open as standalone file
      log.info("Opening as standalone file:", filePath);
      // Approve system-opened file path for future saves
      approveDialogPath(path.resolve(filePath));
      const content = await fs.readFile(filePath, "utf-8");
      targetWindow.webContents.send("open-file-from-system", { path: filePath, content });
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
let pendingFilePath = null;

function getPendingFilePath() {
  return pendingFilePath;
}

function setPendingFilePath(p) {
  pendingFilePath = p;
}

function registerFileHandlers() {
  ipcMain.handle("open-file", async () => {
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
    // Approve opened file path so it can be saved back without a new dialog
    approveDialogPath(path.resolve(filePath));
    const content = await fs.readFile(filePath, "utf-8");
    return { path: filePath, content };
  });

  ipcMain.handle("save-file", async (_event, filePath, content, fileType) => {
    // Validate inputs
    if (filePath != null && typeof filePath !== "string") {
      return { success: false, error: "Invalid file path", code: "INVALID_INPUT" };
    }
    if (typeof content !== "string") {
      return { success: false, error: "Invalid content", code: "INVALID_INPUT" };
    }
    if (fileType != null && !VALID_SAVE_FILE_TYPES.includes(fileType)) {
      return { success: false, error: `Invalid file type: ${fileType}`, code: "INVALID_INPUT" };
    }

    let target = filePath;
    if (target) {
      // Validate renderer-provided path before writing
      const validationError = validateSaveFilePath(target);
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
      // Approve this dialog-selected path for future saves
      approveDialogPath(path.resolve(target));
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

  // --- Export handlers ---

  ipcMain.handle("export-pdf", async (_event, content, options) => {
    if (typeof content !== "string") {
      return { success: false, error: "Invalid content" };
    }
    try {
      const { generatePdf } = require("../../lib/export/pdf-exporter");
      const pdfBuffer = await generatePdf(content, options || {});

      const { filePath } = await dialog.showSaveDialog({
        title: "PDFとしてエクスポート",
        defaultPath: `${options?.metadata?.title || "untitled"}.pdf`,
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });

      if (!filePath) return null;
      await fs.writeFile(filePath, pdfBuffer);
      log.info(`Exported PDF: ${filePath}`);
      return filePath;
    } catch (error) {
      log.error("PDF export failed:", error);
      return { success: false, error: error.message || "PDF export failed" };
    }
  });

  ipcMain.handle("export-epub", async (_event, content, options) => {
    if (typeof content !== "string") {
      return { success: false, error: "Invalid content" };
    }
    try {
      const { generateEpub } = require("../../lib/export/epub-exporter");
      const epubBuffer = await generateEpub(content, options || {});

      const { filePath } = await dialog.showSaveDialog({
        title: "EPUBとしてエクスポート",
        defaultPath: `${options?.metadata?.title || "untitled"}.epub`,
        filters: [{ name: "EPUB", extensions: ["epub"] }],
      });

      if (!filePath) return null;
      await fs.writeFile(filePath, epubBuffer);
      log.info(`Exported EPUB: ${filePath}`);
      return filePath;
    } catch (error) {
      log.error("EPUB export failed:", error);
      return { success: false, error: error.message || "EPUB export failed" };
    }
  });

  ipcMain.handle("export-docx", async (_event, content, options) => {
    if (typeof content !== "string") {
      return { success: false, error: "Invalid content" };
    }
    try {
      const { generateDocx } = require("../../lib/export/docx-exporter");
      const docxBuffer = await generateDocx(content, options || {});

      const { filePath } = await dialog.showSaveDialog({
        title: "DOCXとしてエクスポート",
        defaultPath: `${options?.metadata?.title || "untitled"}.docx`,
        filters: [{ name: "Word Document", extensions: ["docx"] }],
      });

      if (!filePath) return null;
      await fs.writeFile(filePath, docxBuffer);
      log.info(`Exported DOCX: ${filePath}`);
      return filePath;
    } catch (error) {
      log.error("DOCX export failed:", error);
      return { success: false, error: error.message || "DOCX export failed" };
    }
  });

  ipcMain.handle("get-pending-file", async () => {
    if (!pendingFilePath) return null;

    const filePath = pendingFilePath;
    pendingFilePath = null;

    try {
      const dirPath = path.dirname(filePath);
      const isProject = await isProjectDirectory(dirPath);

      if (isProject) {
        return {
          type: "project",
          projectPath: dirPath,
          initialFile: path.basename(filePath),
        };
      }

      // Standalone file: approve path for future saves and return content
      approveDialogPath(path.resolve(filePath));
      const content = await fs.readFile(filePath, "utf-8");
      return {
        type: "standalone",
        path: filePath,
        content,
      };
    } catch (err) {
      log.error("get-pending-file failed:", err);
      return null;
    }
  });
}

module.exports = {
  approveDialogPath,
  handleMdiFileOpen,
  getPendingFilePath,
  setPendingFilePath,
  registerFileHandlers,
};
