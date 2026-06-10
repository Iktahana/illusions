"use strict";
/**
 * Per-window approved-path tracking shared by file-ipc.js and vfs-ipc.js (#1435).
 *
 * Tracks file/directory paths that were approved via a native dialog (or system
 * file association), scoped per BrowserWindow (webContentsId) to prevent
 * cross-window path reuse. Each window keeps its own bounded LRU map so a
 * compromised renderer cannot grow main-process memory without bound.
 *
 * Intentional usage difference between the two consumers (kept explicit):
 * - file-ipc.js creates ONE module-level registry (save-file approvals survive
 *   for the whole app lifetime, until the window is destroyed).
 * - vfs-ipc.js creates a registry per registerVFSHandlers() call, keeping the
 *   approval state encapsulated inside the VFS handler closure.
 */

/** Maximum approved paths retained per window before LRU eviction kicks in. */
const DEFAULT_MAX_APPROVED_PATHS = 200;

/**
 * Create a per-window approved-path registry with bounded LRU eviction.
 * @param {number} [maxEntries=DEFAULT_MAX_APPROVED_PATHS] - Per-window capacity
 * @returns {{
 *   approve: (webContentsId: number, p: string) => void,
 *   has: (webContentsId: number | undefined, p: string) => boolean,
 *   listWindowPaths: (webContentsId: number) => string[],
 *   revokeWindow: (webContentsId: number) => void,
 * }}
 */
function createApprovedPathRegistry(maxEntries = DEFAULT_MAX_APPROVED_PATHS) {
  /** @type {Map<number, Map<string, true>>} webContentsId → (path → true) LRU map */
  const windows = new Map();

  /**
   * Get or create the per-window LRU path map for a given webContentsId.
   * @param {number} webContentsId
   * @returns {Map<string, true>}
   */
  function getWindowPaths(webContentsId) {
    if (!windows.has(webContentsId)) {
      windows.set(webContentsId, new Map());
    }
    return windows.get(webContentsId);
  }

  return {
    /**
     * Add a path to the dialog-approved set for a specific window, with LRU eviction.
     * When the per-window set exceeds maxEntries, the oldest entry is evicted.
     * @param {number} webContentsId - The webContents ID of the approving window
     * @param {string} p - The path to approve
     */
    approve(webContentsId, p) {
      const windowPaths = getWindowPaths(webContentsId);
      // Delete first so re-insertion moves it to the end (most recent)
      windowPaths.delete(p);
      windowPaths.set(p, true);
      // Evict oldest entry if over capacity
      if (windowPaths.size > maxEntries) {
        const oldest = windowPaths.keys().next().value;
        if (oldest !== undefined) {
          windowPaths.delete(oldest);
        }
      }
    },

    /**
     * Check whether a path was approved for the given window.
     * Returns false for unknown windows (fail closed).
     * @param {number | undefined} webContentsId
     * @param {string} p
     * @returns {boolean}
     */
    has(webContentsId, p) {
      const windowPaths = windows.get(webContentsId);
      return windowPaths != null && windowPaths.has(p);
    },

    /**
     * List all currently approved paths for a window (oldest → newest).
     * @param {number} webContentsId
     * @returns {string[]}
     */
    listWindowPaths(webContentsId) {
      const windowPaths = windows.get(webContentsId);
      return windowPaths ? [...windowPaths.keys()] : [];
    },

    /**
     * Remove the approved-path set for a destroyed window to prevent memory leaks.
     * @param {number} webContentsId - The webContents ID of the destroyed window
     */
    revokeWindow(webContentsId) {
      windows.delete(webContentsId);
    },
  };
}

module.exports = { createApprovedPathRegistry, DEFAULT_MAX_APPROVED_PATHS };
