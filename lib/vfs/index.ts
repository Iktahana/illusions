/**
 * Virtual File System (VFS) Factory
 *
 * Automatically detects the runtime environment and returns the appropriate
 * VFS implementation:
 * - Electron renderer: Uses ElectronVFS (IPC communication with main process)
 * - Browser: Uses WebVFS (File System Access API)
 *
 * Follows the same singleton factory pattern as StorageService and NlpClient.
 */

import { isElectronRenderer } from "../runtime-env";

import type { VirtualFileSystem } from "./types";

let instance: VirtualFileSystem | null = null;

/**
 * Get or create the global VFS instance.
 * Uses dynamic require to avoid bundling the wrong implementation.
 *
 * @returns Singleton VirtualFileSystem instance
 */
export function getVFS(): VirtualFileSystem {
  if (!instance) {
    if (isElectronRenderer()) {
      // Use require to avoid bundling Electron code in web builds
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { ElectronVFS } = require("./electron-vfs") as {
        ElectronVFS: new () => VirtualFileSystem;
      };
      instance = new ElectronVFS();
    } else {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { WebVFS } = require("./web-vfs") as {
        WebVFS: new () => VirtualFileSystem;
      };
      instance = new WebVFS();
    }
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
