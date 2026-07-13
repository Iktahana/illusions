"use strict";
const fs = require("fs/promises");
const path = require("path");

/**
 * Normalize path separators to forward slashes (no path.resolve, no trailing-slash trim).
 * Shared primitive used by both file-ipc.js and vfs-ipc.js so separator handling
 * cannot drift between the two security boundaries (#1435).
 * @param {string} p
 * @returns {string}
 */
function normalizeSeparators(p) {
  return p.replace(/\\/g, "/");
}

/**
 * Remove trailing slashes ("/foo//" → "/foo").
 * NOTE: this turns the bare filesystem root "/" into "" — callers that may receive
 * the bare root must apply deny checks compatible with that representation
 * (vfs-ipc.js has always done this; file-ipc.js intentionally does NOT trim).
 * @param {string} p
 * @returns {string}
 */
function trimTrailingSlashes(p) {
  const trimmed = p.replace(/\/+$/, "");
  // Never collapse the filesystem root to an empty string: an empty root would
  // make prefix-based containment checks (assertPathInsideRoot) accept every
  // absolute path — fail closed by preserving "/" (#1435 / Codex review).
  return trimmed === "" && p.startsWith("/") ? "/" : trimmed;
}

/**
 * Canonical comparison form for VFS root-path matching: forward slashes,
 * trailing slashes trimmed, and Unicode folded to NFC.
 *
 * NFC folding is the critical part. `path.resolve` and plain separator
 * normalization do NOT fold Unicode, so on macOS the native dialog returns the
 * on-disk (NFD) form of a Japanese name while the renderer / recent-projects
 * list supplies the NFC form. Without this fold, the same directory compares
 * unequal and set-root rejects it ("選択されたディレクトリが要求されたパスと
 * 一致しません", #1955 follow-up). Use this for every path equality/containment
 * comparison in the set-root approval flow.
 * @param {string} p
 * @returns {string}
 */
function normalizeForCompare(p) {
  const normalized = trimTrailingSlashes(normalizeSeparators(p)).normalize("NFC");
  const isWindowsPath = /^[a-zA-Z]:\//.test(normalized) || normalized.startsWith("//");
  return process.platform === "win32" && isWindowsPath ? normalized.toLowerCase() : normalized;
}

/**
 * Resolves a path and normalizes all separators to forward slashes.
 * Also strips Windows extended-path prefix (\\?\, //./), and UNC paths become //server/share/...
 * @param {string} p
 * @returns {string}
 */
function toForwardSlash(p, pathImpl = path) {
  let resolved = pathImpl.resolve(p).replace(/\\/g, "/");
  // Strip Windows extended-path prefixes without changing drive/UNC semantics.
  // //?/UNC/server/share must become //server/share, not UNC/server/share.
  resolved = resolved.replace(/^\/\/\?\/UNC\//i, "//");
  resolved = resolved.replace(/^\/\/[?.]\//, "");
  return resolved;
}

/**
 * Checks that a resolved path is inside the given root.
 * Throws an Error if the path has not been fully normalized (contains backslashes)
 * or if it is outside the root — fail closed.
 * @param {string} resolvedPath - Already-normalized forward-slash path
 * @param {string} rootPath - Already-normalized forward-slash root
 * @throws {Error}
 */
function assertPathInsideRoot(resolvedPath, rootPath) {
  if (resolvedPath.includes("\\")) {
    throw new Error("パス正規化エラー: バックスラッシュが残っています");
  }
  const resolvedForCompare = normalizeForCompare(resolvedPath);
  const rootForCompare = normalizeForCompare(rootPath);
  if (
    resolvedForCompare !== rootForCompare &&
    !resolvedForCompare.startsWith(rootForCompare + "/")
  ) {
    throw new Error("プロジェクトディレクトリの外部へのアクセスは許可されていません");
  }
}

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
 * Resolve the physical (symlink-collapsed) path for `p` (issue #1559).
 *
 * Unlike fs.realpath, this tolerates trailing components that do not exist
 * yet (e.g. a file about to be created): it realpath-resolves the deepest
 * existing ancestor and rejoins the missing tail, so the result can be
 * containment-checked before creating new files/directories.
 *
 * Dangling symlinks are rejected (fail closed): opening one with "w" would
 * create its target, which may live outside the verified tree. The thrown
 * error carries code "ENOENT" so existence checks treat it as missing.
 *
 * @param {string} p - Absolute (or resolvable) path
 * @returns {Promise<string>} Physical path with platform separators
 * @throws {Error} On dangling symlinks or non-ENOENT filesystem errors
 */
async function resolveRealPath(p) {
  let current = path.resolve(p);
  const tail = [];
  for (;;) {
    try {
      const real = await fs.realpath(current);
      return tail.length > 0 ? path.join(real, ...tail) : real;
    } catch (error) {
      if (error.code !== "ENOENT" && error.code !== "ENOTDIR") {
        throw error;
      }
    }
    // `current` does not fully exist. If it is a dangling symlink, reject it
    // instead of walking up — creation I/O through it would escape the check.
    let lstats = null;
    try {
      lstats = await fs.lstat(current);
    } catch {
      // Truly missing — keep walking up to an existing ancestor
    }
    if (lstats && lstats.isSymbolicLink()) {
      const err = new Error("リンクの参照先が存在しないため、このパスにはアクセスできません");
      err.code = "ENOENT";
      throw err;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      // Reached the filesystem root without an existing ancestor
      const err = new Error(`ENOENT: no such file or directory, realpath '${p}'`);
      err.code = "ENOENT";
      throw err;
    }
    tail.unshift(path.basename(current));
    current = parent;
  }
}

module.exports = {
  normalizeSeparators,
  trimTrailingSlashes,
  normalizeForCompare,
  toForwardSlash,
  assertPathInsideRoot,
  getWindowsDenyPrefixes,
  resolveRealPath,
};
