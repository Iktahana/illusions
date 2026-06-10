"use strict";
const fs = require("fs/promises");
const path = require("path");

/**
 * Resolves a path and normalizes all separators to forward slashes.
 * Also strips Windows extended-path prefix (\\?\, //./), and UNC paths become //server/share/...
 * @param {string} p
 * @returns {string}
 */
function toForwardSlash(p) {
  let resolved = path.resolve(p).replace(/\\/g, "/");
  // Strip Windows extended-path prefixes like //?/ or //./  without changing drive/UNC semantics
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
  if (resolvedPath !== rootPath && !resolvedPath.startsWith(rootPath + "/")) {
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
  toForwardSlash,
  assertPathInsideRoot,
  getWindowsDenyPrefixes,
  resolveRealPath,
};
