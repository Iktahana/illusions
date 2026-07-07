"use strict";

/**
 * Shared VFS root registry for main-process IPC boundaries.
 *
 * vfs-ipc owns root selection/approval, but other IPC modules that operate on
 * native paths (for example shell.openPath) must be able to enforce the same
 * per-window root boundary. Keeping the registry here avoids duplicating state
 * or trusting renderer-supplied absolute paths.
 */

/** @type {Map<number, { path: string, realPath: string }>} */
const rootsBySender = new Map();

function setVfsRoot(senderId, root) {
  rootsBySender.set(senderId, root);
}

function getVfsRoot(senderId) {
  return rootsBySender.get(senderId) ?? null;
}

function clearVfsRoot(senderId) {
  rootsBySender.delete(senderId);
}

function clearAllVfsRootsForTests() {
  rootsBySender.clear();
}

module.exports = {
  setVfsRoot,
  getVfsRoot,
  clearVfsRoot,
  clearAllVfsRootsForTests,
};
