"use strict";

const fs = require("fs/promises");
const path = require("path");
const {
  assertPathInsideRoot,
  normalizeForCompare,
  resolveRealPath,
  toForwardSlash,
} = require("./path-utils");
const { isSensitiveSystemPath } = require("./path-policy");
const { getVfsRoot } = require("./vfs-root-registry");

const EXECUTABLE_OPEN_EXTENSIONS = new Set([
  ".app",
  ".bat",
  ".cmd",
  ".com",
  ".exe",
  ".msi",
  ".ps1",
  ".scr",
  ".sh",
]);

function hasTraversalSegment(rawPath) {
  return rawPath.split(/[\\/]+/).includes("..");
}

function isExecutableOpenTarget(resolvedPath) {
  const ext = path.extname(resolvedPath).toLowerCase();
  if (EXECUTABLE_OPEN_EXTENSIONS.has(ext)) return true;
  return resolvedPath
    .split(/[\\/]+/)
    .some((part) => process.platform === "darwin" && part.toLowerCase().endsWith(".app"));
}

async function validateShellPathForSender(filePath, senderId, deps = {}) {
  const getRoot = deps.getVfsRoot ?? getVfsRoot;
  const realPath = deps.resolveRealPath ?? resolveRealPath;
  const stat = deps.stat ?? fs.stat;

  if (!filePath || typeof filePath !== "string") return null;
  if (!path.isAbsolute(filePath) || hasTraversalSegment(filePath)) {
    console.warn("[Security] Invalid shell path:", filePath);
    return null;
  }

  const resolved = path.resolve(filePath);
  const normalizedResolved = normalizeForCompare(toForwardSlash(resolved));
  if (isSensitiveSystemPath(normalizedResolved)) {
    console.warn("[Security] Denied shell path:", filePath);
    return null;
  }
  if (isExecutableOpenTarget(resolved)) {
    console.warn("[Security] Blocked executable shell path:", filePath);
    return null;
  }

  const root = getRoot(senderId);
  if (!root) {
    console.warn("[Security] Shell path rejected without approved VFS root:", filePath);
    return null;
  }

  try {
    assertPathInsideRoot(normalizedResolved, normalizeForCompare(root.path));
    const realResolved = normalizeForCompare(toForwardSlash(await realPath(resolved)));
    assertPathInsideRoot(realResolved, normalizeForCompare(root.realPath));
    await stat(resolved);
    return resolved;
  } catch (error) {
    console.warn("[Security] Shell path rejected outside approved VFS root:", filePath, error);
    return null;
  }
}

function createOpenPathHandler(openPath, deps = {}) {
  return async (event, filePath) => {
    const normalizedPath = await validateShellPathForSender(filePath, event?.sender?.id, deps);
    if (!normalizedPath) return false;
    const result = await openPath(normalizedPath);
    return result === "";
  };
}

function createRevealPathHandler(showItemInFolder, deps = {}) {
  return async (event, filePath) => {
    const normalizedPath = await validateShellPathForSender(filePath, event?.sender?.id, deps);
    if (!normalizedPath) return false;
    showItemInFolder(normalizedPath);
    return true;
  };
}

module.exports = {
  validateShellPathForSender,
  createOpenPathHandler,
  createRevealPathHandler,
  EXECUTABLE_OPEN_EXTENSIONS,
};
