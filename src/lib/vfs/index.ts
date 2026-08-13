/**
 * Virtual File System (VFS) Factory
 *
 * Provides the Electron renderer VFS backed by IPC.
 *
 * Follows the same singleton factory pattern as StorageService and NlpClient.
 *
 * Phase 7: getProjectFileService() alias added — new code should use that.
 * getVFS() is kept for backward compatibility until Phase 9 caller rename.
 */

import { ElectronVFS } from "@/platform/electron-renderer/vfs";

import type { VirtualFileSystem } from "./types";

let instance: VirtualFileSystem | null = null;

/**
 * Get or create the global VFS instance.
 * @returns Singleton VirtualFileSystem instance
 */
export function getVFS(): VirtualFileSystem {
  if (!instance) {
    instance = new ElectronVFS();
  }
  return instance;
}

/**
 * Reset the VFS singleton instance.
 * Useful for testing or when the environment context changes.
 */
export function resetVFS(): void {
  instance = null;
}

/**
 * Phase 7 alias: new code should use getProjectFileService() from
 * lib/services/project-file-service.ts. This re-export keeps callers
 * that haven't been renamed yet working until Phase 9.
 */
export { getVFS as getProjectFileService };
export { resetVFS as resetProjectFileService };

// Re-export types for convenience
export type {
  VFSDirectoryHandle,
  VFSEntry,
  VFSFileHandle,
  VFSFileMetadata,
  VFSWatchEvent,
  VFSWatcher,
  VirtualFileSystem,
} from "./types";
