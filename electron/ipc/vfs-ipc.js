/* eslint-disable no-console */
/**
 * VFS IPC handlers for Electron
 *
 * Phase 4-5: VFS file IPC と history index-lock IPC は全削除済み。
 * 新 IO 抽象 / 新 history は Phase 7-8 で導入する。
 *
 * registerVFSHandlers は signature 互換のため空関数として残置する。
 */

function registerVFSHandlers() {
  // Phase 4-5: すべての VFS IPC handler を削除。Phase 7-8 で再導入する。
}

module.exports = { registerVFSHandlers };
