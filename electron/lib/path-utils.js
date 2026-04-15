"use strict";
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

module.exports = { toForwardSlash, assertPathInsideRoot, getWindowsDenyPrefixes };
