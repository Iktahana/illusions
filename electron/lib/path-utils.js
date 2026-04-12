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
  // Strip Windows extended-path prefixes like //?/ or //./
  resolved = resolved.replace(/^\/\/[?.]\//, "/");
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
    throw new Error("Path normalization invariant failed: backslashes remain after normalization");
  }
  if (resolvedPath !== rootPath && !resolvedPath.startsWith(rootPath + "/")) {
    throw new Error("プロジェクトディレクトリの外部へのアクセスは許可されていません");
  }
}

module.exports = { toForwardSlash, assertPathInsideRoot };
