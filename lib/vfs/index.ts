/**
 * Virtual File System (VFS) Factory
 *
 * Phase 4 shim: VFS の実装本体を空洞化（Electron/Web 実装を no-op stub に置換）。
 * isRootOpen() が常に false を返すため、`if (!vfs.isRootOpen()) return;` 形式の
 * すべての caller は graceful に早期 return する。Phase 7 で新 IO 抽象に置換する。
 *
 * 型 surface（VirtualFileSystem / VFSFileHandle / VFSDirectoryHandle 等）は
 * 多数の caller が import しているため types.ts と path-utils.ts は維持する。
 */

import type {
  VirtualFileSystem,
  VFSDirectoryHandle,
  VFSEntry,
  VFSFileMetadata,
  VFSWatcher,
} from "./types";

class Phase4StubVFS implements VirtualFileSystem {
  async openDirectory(): Promise<VFSDirectoryHandle> {
    throw new Error("Phase 4 shim: VFS is disabled");
  }
  async getDirectoryHandle(_path: string): Promise<VFSDirectoryHandle> {
    throw new Error("Phase 4 shim: VFS is disabled");
  }
  async readFile(_path: string): Promise<string> {
    throw new Error("Phase 4 shim: VFS is disabled");
  }
  async writeFile(_path: string, _content: string): Promise<void> {
    throw new Error("Phase 4 shim: VFS is disabled");
  }
  async deleteFile(_path: string): Promise<void> {
    throw new Error("Phase 4 shim: VFS is disabled");
  }
  async rename(_oldPath: string, _newPath: string): Promise<void> {
    throw new Error("Phase 4 shim: VFS is disabled");
  }
  async getFileMetadata(_path: string): Promise<VFSFileMetadata> {
    throw new Error("Phase 4 shim: VFS is disabled");
  }
  async listDirectory(_path: string): Promise<VFSEntry[]> {
    return [];
  }
  watchFile(
    _path: string,
    _callback: (event: { type: "change" | "delete" | "create"; path: string }) => void,
  ): VFSWatcher {
    return { stop() {} };
  }
  getRootPath(): string | null {
    return null;
  }
  isRootOpen(): boolean {
    return false;
  }
  // Compatibility no-ops for VFS-extension methods that callers may probe via `in` checks
  isReady(): boolean {
    return false;
  }
  async setRootPath(_rootPath: string): Promise<void> {
    // no-op
  }
  setRootHandle(_handle: FileSystemDirectoryHandle): void {
    // no-op
  }
  async indexLockAcquire(_key: string): Promise<void> {
    // no-op
  }
  async indexLockRelease(_key: string): Promise<void> {
    // no-op
  }
}

let instance: VirtualFileSystem | null = null;

/**
 * Get or create the global VFS instance.
 * Phase 4 shim: 環境に関わらず no-op stub を返す。
 */
export function getVFS(): VirtualFileSystem {
  if (!instance) {
    instance = new Phase4StubVFS();
  }
  return instance;
}

/** Reset the VFS singleton instance (used by tests). */
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
