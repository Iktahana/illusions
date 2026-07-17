"use strict";
/**
 * Persistence for standalone-opened file paths (#1965).
 *
 * Standalone mode (no project) opens single files via the native open dialog or
 * the OS file association. Those approvals normally live only in the per-window
 * in-memory registry (electron/lib/approved-paths.js) and are lost on restart,
 * so after a restart/crash the renderer has no safe way to re-read a previously
 * open file — `vfs:read-file` always fails because standalone has no VFS root.
 *
 * This module records the set of paths the user actually opened in standalone
 * mode to a JSON file in userData, so the `read-standalone-file` IPC can re-read
 * exactly those paths (and nothing else) when restoring the previous session.
 *
 * Schema (approved-standalone-paths.json):
 * {
 *   "version": 1,
 *   "paths": [ { "path": "/Users/.../novel.mdi", "openedAt": "2026-..." } ]
 * }
 *
 * Security properties:
 * - Append-only allowlist: a path is added ONLY when the user opens it through a
 *   native dialog or OS file association (a genuine user action). A compromised
 *   renderer cannot add arbitrary paths here, so the restore-read IPC cannot be
 *   coerced into reading files the user never opened.
 * - Bounded: capped at MAX_STANDALONE_PATHS with oldest-first eviction so the
 *   list cannot grow without bound.
 * - TOCTOU: existence is NOT checked here; the read path validates membership and
 *   then reads, surfacing ENOENT to the caller.
 */

const fs = require("fs/promises");
const { writeUtf8FileAtomically } = require("./atomic-file");

/** Maximum standalone paths retained before oldest-first eviction. */
const MAX_STANDALONE_PATHS = 500;

/**
 * In-memory cache so we don't re-read the JSON file on every check.
 * Invalidated (replaced) whenever addStandalonePath() writes new data, and
 * resettable via clearStandalonePathsCache() (tests / fresh-process simulation).
 * @type {Array<{path: string, openedAt: string}> | null}
 */
let pathsCache = null;

/**
 * Load the entire paths array from disk (or return the in-memory cache).
 * Returns an empty array when the file is missing or corrupt.
 *
 * @param {string} filePath - Absolute path to approved-standalone-paths.json
 * @returns {Promise<Array<{path: string, openedAt: string}>>}
 */
async function loadAll(filePath) {
  if (pathsCache !== null) return pathsCache;
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const data = JSON.parse(raw);
    if (data?.version !== 1 || !Array.isArray(data.paths)) {
      pathsCache = [];
    } else {
      // Defensive: keep only well-formed entries.
      pathsCache = data.paths.filter(
        (e) => e !== null && typeof e === "object" && typeof e.path === "string",
      );
    }
  } catch {
    pathsCache = [];
  }
  return pathsCache;
}

/**
 * Load the set of approved standalone paths.
 *
 * @param {string} filePath - Absolute path to approved-standalone-paths.json
 * @returns {Promise<Set<string>>}
 */
async function loadStandalonePaths(filePath) {
  const all = await loadAll(filePath);
  return new Set(all.map((e) => e.path));
}

/**
 * Check whether a path was previously opened in standalone mode.
 *
 * @param {string} filePath - Absolute path to approved-standalone-paths.json
 * @param {string} p - Candidate absolute path (caller should pre-resolve)
 * @returns {Promise<boolean>}
 */
async function hasStandalonePath(filePath, p) {
  if (typeof p !== "string" || !p) return false;
  const all = await loadAll(filePath);
  return all.some((e) => e.path === p);
}

/**
 * Record a standalone-opened path (idempotent; refreshes recency). Persists to
 * disk and updates the cache. Applies oldest-first eviction past the cap.
 *
 * @param {string} filePath - Absolute path to approved-standalone-paths.json
 * @param {string} p - Resolved absolute path the user opened
 */
async function addStandalonePath(filePath, p) {
  if (typeof p !== "string" || !p) return;
  const all = await loadAll(filePath);
  // Move-to-end recency: drop any existing entry, then append fresh.
  const next = all.filter((e) => e.path !== p);
  next.push({ path: p, openedAt: new Date().toISOString() });
  // Evict oldest (front) entries past the cap.
  const capped =
    next.length > MAX_STANDALONE_PATHS ? next.slice(next.length - MAX_STANDALONE_PATHS) : next;
  pathsCache = capped;
  await writeUtf8FileAtomically(filePath, JSON.stringify({ version: 1, paths: capped }, null, 2));
}

/**
 * Invalidate the in-memory cache. Used in tests to simulate a fresh process start.
 */
function clearStandalonePathsCache() {
  pathsCache = null;
}

module.exports = {
  loadStandalonePaths,
  hasStandalonePath,
  addStandalonePath,
  clearStandalonePathsCache,
  MAX_STANDALONE_PATHS,
};
