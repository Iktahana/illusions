/* eslint-disable no-console */
/**
 * Persistent approved-VFS-paths store for the Electron main process.
 *
 * Paths approved via native dialog are persisted to:
 *   <userData>/approved-vfs-paths.json
 * so that new windows are pre-seeded and vfs:set-root skips the re-prompt.
 *
 * The renderer cannot write to this list — only main-process IPC handlers
 * (vfs:open-directory, vfs:set-root post-dialog) call addApprovedPath.
 *
 * Capacity: 500 entries with LRU eviction (delete-then-reinsert keeps recency).
 */

const { app } = require("electron");
const fs = require("fs");
const path = require("path");

const MAX_ENTRIES = 500;

/** @type {Set<string>} Forward-slash normalized approved paths, insertion-order = LRU oldest→newest */
let approvedPaths = new Set();
let saveTimer = null;

function getFilePath() {
  return path.join(app.getPath("userData"), "approved-vfs-paths.json");
}

/**
 * Load persisted approved paths synchronously. Call once inside registerVFSHandlers()
 * before ipcMain.handle registrations fire. Failure is non-fatal.
 */
function loadApprovedPaths() {
  try {
    const raw = fs.readFileSync(getFilePath(), "utf-8");
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      approvedPaths = new Set(arr.filter((p) => typeof p === "string"));
    }
  } catch {
    approvedPaths = new Set();
  }
}

/** Iterate over all persisted approved paths (for window seeding). */
function getApprovedPaths() {
  return approvedPaths;
}

/**
 * Record a newly approved path and schedule a debounced write to disk.
 * Uses delete-then-reinsert to refresh LRU recency for existing entries.
 * @param {string} normalizedPath - Forward-slash normalized absolute path
 */
function addApprovedPath(normalizedPath) {
  // Refresh recency: delete + reinsert moves entry to end of Set order (newest)
  approvedPaths.delete(normalizedPath);
  approvedPaths.add(normalizedPath);
  // Evict oldest (first in insertion order) when over capacity
  if (approvedPaths.size > MAX_ENTRIES) {
    approvedPaths.delete(approvedPaths.values().next().value);
  }
  scheduleSave();
}

/**
 * Flush pending writes synchronously. Call on app before-quit to prevent data loss
 * if the debounce timer has not yet fired.
 */
function flushApprovedPaths() {
  if (!saveTimer) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  try {
    fs.writeFileSync(getFilePath(), JSON.stringify([...approvedPaths]), "utf-8");
  } catch (err) {
    console.error("[approved-vfs-paths] Failed to flush on quit:", err);
  }
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.writeFileSync(getFilePath(), JSON.stringify([...approvedPaths]), "utf-8");
    } catch (err) {
      console.error("[approved-vfs-paths] Failed to persist approved paths:", err);
    }
  }, 300);
}

module.exports = { loadApprovedPaths, getApprovedPaths, addApprovedPath, flushApprovedPaths };
