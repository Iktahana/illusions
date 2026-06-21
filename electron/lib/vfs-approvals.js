/**
 * Persistence helpers for VFS dialog-approved paths.
 *
 * Stores the set of paths the user has approved via the native directory picker,
 * keyed by projectId. On app restart the approved set is reloaded from disk so
 * the `vfs:set-root` handler can skip the re-approval dialog for previously
 * accepted project roots.
 *
 * Schema (approved-vfs-paths.json):
 * {
 *   "version": 1,
 *   "approvals": [
 *     { "projectId": "proj_abc123", "path": "/Users/.../novel1", "approvedAt": "2026-..." }
 *   ]
 * }
 *
 * Security properties:
 * - Project-scoped: only paths belonging to `projectId` are returned.
 * - No auto-promotion of denied paths.
 * - Caller must use fs.realpath() before passing paths to avoid symlink traversal.
 * - TOCTOU: path existence is NOT checked here; rely on assertPathInsideRoot at access time.
 */

// #1476: rehydration — begin
const fs = require("fs/promises");

/**
 * In-memory cache so we don't re-read the JSON file on every approval check.
 * Invalidated (set to null) whenever saveApprovals() writes new data.
 * @type {Array<{projectId: string, path: string, approvedAt: string}> | null}
 */
let approvalsCache = null;

/**
 * Load the entire approvals array from disk (or return the in-memory cache).
 * Returns an empty array when the file is missing or corrupt.
 *
 * @param {string} filePath - Absolute path to approved-vfs-paths.json
 * @returns {Promise<Array<{projectId: string, path: string, approvedAt: string}>>}
 */
async function loadAllApprovals(filePath) {
  if (approvalsCache !== null) return approvalsCache;
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const data = JSON.parse(raw);
    if (data?.version !== 1 || !Array.isArray(data.approvals)) {
      approvalsCache = [];
    } else {
      // Defensive: keep only well-formed entries
      approvalsCache = data.approvals.filter(
        (a) =>
          a !== null &&
          typeof a === "object" &&
          typeof a.projectId === "string" &&
          typeof a.path === "string",
      );
    }
  } catch {
    approvalsCache = [];
  }
  return approvalsCache;
}

/**
 * Load the set of approved paths for a specific project.
 * Returns only paths belonging to `projectId`.
 *
 * @param {string} filePath - Absolute path to approved-vfs-paths.json
 * @param {string} projectId - Project identifier
 * @returns {Promise<Set<string>>}
 */
async function loadApprovals(filePath, projectId) {
  if (typeof projectId !== "string" || !projectId) return new Set();
  const all = await loadAllApprovals(filePath);
  return new Set(all.filter((a) => a.projectId === projectId).map((a) => a.path));
}

/**
 * Persist the approval set for a specific project, replacing any existing entries
 * for that project. Entries for other projects are kept intact.
 * Invalidates the in-memory cache.
 *
 * @param {string} filePath - Absolute path to approved-vfs-paths.json
 * @param {string} projectId - Project identifier
 * @param {Set<string>} paths - Set of approved absolute paths
 */
async function saveApprovals(filePath, projectId, paths) {
  if (typeof projectId !== "string" || !projectId) return;
  const all = await loadAllApprovals(filePath);
  const others = all.filter((a) => a.projectId !== projectId);
  const fresh = [...paths].map((p) => ({
    projectId,
    path: p,
    approvedAt: new Date().toISOString(),
  }));
  approvalsCache = [...others, ...fresh];
  await fs.writeFile(
    filePath,
    JSON.stringify({ version: 1, approvals: approvalsCache }, null, 2),
    "utf-8",
  );
}

/**
 * Invalidate the in-memory cache. Used in tests to simulate a fresh process start.
 */
function clearApprovalsCache() {
  approvalsCache = null;
}

// #1476: rehydration — end

module.exports = { loadAllApprovals, loadApprovals, saveApprovals, clearApprovalsCache };
