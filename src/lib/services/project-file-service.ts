/**
 * ProjectFileService — Phase 7 IO abstraction
 *
 * Thin facade around getVFS() that gives new code a stable, intention-revealing
 * API name. The underlying implementation is unchanged: ElectronVFS or WebVFS
 * depending on runtime environment.
 *
 * Migration path:
 * - New code: import { getProjectFileService } from "@/lib/services/project-file-service"
 * - Old code that still calls getVFS(): also works — lib/vfs/index.ts re-exports
 *   getVFS as getProjectFileService until Phase 9 completes the rename.
 *
 * Type alias:
 * - ProjectFileServiceInterface === VirtualFileSystem (same shape, different name)
 *   Phase 9 will make callers use ProjectFileServiceInterface consistently.
 */

import { getVFS, resetVFS } from "@/lib/vfs";

// Re-export the type under the new name so callers can use either.
export type {
  VirtualFileSystem as ProjectFileServiceInterface,
  VFSDirectoryHandle,
  VFSEntry,
  VFSFileHandle,
  VFSFileMetadata,
  VFSWatchEvent,
  VFSWatcher,
} from "@/lib/vfs/types";

/**
 * Get the global ProjectFileService instance.
 * Delegates to getVFS() — selects ElectronVFS or WebVFS at runtime.
 *
 * @returns Singleton VirtualFileSystem instance
 */
export function getProjectFileService() {
  return getVFS();
}

/**
 * Reset the ProjectFileService singleton.
 * Useful for tests or when the environment context changes.
 */
export function resetProjectFileService(): void {
  resetVFS();
}
