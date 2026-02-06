/**
 * Electron implementation of the Virtual File System.
 *
 * Uses IPC calls to the Electron main process via window.electronAPI.vfs.*
 * for all file operations. The main process handlers must be registered
 * separately (see electron main process setup).
 */

import type {
  VFSDirectoryHandle,
  VFSEntry,
  VFSFileHandle,
  VFSFileMetadata,
  VFSWatchEvent,
  VFSWatcher,
  VirtualFileSystem,
} from "./types";

// -----------------------------------------------------------------------
// Type declarations for the Electron VFS IPC bridge
// -----------------------------------------------------------------------

/**
 * Shape of the VFS IPC API exposed by the Electron preload script.
 * These methods map to IPC handlers in the main process.
 */
interface ElectronVFSBridge {
  /** Open a native directory picker dialog */
  openDirectory: () => Promise<{ path: string; name: string } | null>;
  /** Read file content as UTF-8 text */
  readFile: (filePath: string) => Promise<string>;
  /** Write UTF-8 text content to a file */
  writeFile: (filePath: string, content: string) => Promise<void>;
  /** Read directory entries */
  readDirectory: (
    dirPath: string
  ) => Promise<Array<{ name: string; kind: "file" | "directory" }>>;
  /** Get file stats */
  stat: (
    filePath: string
  ) => Promise<{ size: number; lastModified: number; type: string }>;
  /** Create a directory (with parents) */
  mkdir: (dirPath: string) => Promise<void>;
  /** Delete a file or directory */
  delete: (targetPath: string, options?: { recursive?: boolean }) => Promise<void>;
  /** Watch a file for changes (optional) */
  watch?: (
    filePath: string,
    callback: (event: VFSWatchEvent) => void
  ) => { stop: () => void };
}

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

/**
 * Join path segments using "/" separator, handling trailing/leading slashes.
 */
function joinPath(base: string, ...parts: string[]): string {
  const normalizedBase = base.replace(/\/+$/, "");
  const normalizedParts = parts.map((p) =>
    p.replace(/^\/+|\/+$/g, "")
  ).filter((p) => p.length > 0);
  return [normalizedBase, ...normalizedParts].join("/");
}

/**
 * Extract the basename from a path string.
 */
function basename(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || path;
}

/**
 * Extract the parent directory path from a file path.
 */
function dirname(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
  const lastSlash = normalized.lastIndexOf("/");
  if (lastSlash <= 0) return "/";
  return normalized.substring(0, lastSlash);
}

/**
 * Get the Electron VFS bridge from window.electronAPI.
 * @throws Error if the bridge is not available
 */
function getVFSBridge(): ElectronVFSBridge {
  const api = window.electronAPI;
  if (!api) {
    throw new Error("Electron API is not available (window.electronAPI is undefined).");
  }

  // Access the vfs sub-object on electronAPI
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vfsBridge = (api as unknown as { vfs?: ElectronVFSBridge }).vfs;
  if (!vfsBridge) {
    throw new Error(
      "Electron VFS API is not available (window.electronAPI.vfs is undefined). " +
        "Ensure the preload script exposes VFS IPC methods."
    );
  }
  return vfsBridge;
}

// -----------------------------------------------------------------------
// ElectronVFSFileHandle
// -----------------------------------------------------------------------

/**
 * Electron implementation of VFSFileHandle.
 * Uses IPC to read/write files by absolute path.
 */
class ElectronVFSFileHandle implements VFSFileHandle {
  readonly name: string;
  readonly path: string;
  private readonly absolutePath: string;

  constructor(absolutePath: string, relativePath: string) {
    this.absolutePath = absolutePath;
    this.path = relativePath;
    this.name = basename(absolutePath);
  }

  async getFile(): Promise<File> {
    const bridge = getVFSBridge();
    const content = await bridge.readFile(this.absolutePath);
    const stat = await bridge.stat(this.absolutePath);
    return new File([content], this.name, {
      type: stat.type,
      lastModified: stat.lastModified,
    });
  }

  async read(): Promise<string> {
    const bridge = getVFSBridge();
    return bridge.readFile(this.absolutePath);
  }

  async write(content: string): Promise<void> {
    const bridge = getVFSBridge();
    return bridge.writeFile(this.absolutePath, content);
  }
}

// -----------------------------------------------------------------------
// ElectronVFSDirectoryHandle
// -----------------------------------------------------------------------

/**
 * Electron implementation of VFSDirectoryHandle.
 * Uses IPC to interact with the filesystem by absolute path.
 */
class ElectronVFSDirectoryHandle implements VFSDirectoryHandle {
  readonly name: string;
  readonly path: string;
  private readonly absolutePath: string;

  constructor(absolutePath: string, relativePath: string) {
    this.absolutePath = absolutePath;
    this.path = relativePath;
    this.name = basename(absolutePath);
  }

  async getFileHandle(
    name: string,
    options?: { create?: boolean }
  ): Promise<VFSFileHandle> {
    const filePath = joinPath(this.absolutePath, name);
    const relPath = this.path ? joinPath(this.path, name) : name;

    if (options?.create) {
      // Ensure the parent directory exists, then write an empty file if needed
      const bridge = getVFSBridge();
      try {
        await bridge.stat(filePath);
      } catch {
        // File does not exist, create it
        await bridge.writeFile(filePath, "");
      }
    }

    return new ElectronVFSFileHandle(filePath, relPath);
  }

  async getDirectoryHandle(
    name: string,
    options?: { create?: boolean }
  ): Promise<VFSDirectoryHandle> {
    const dirPath = joinPath(this.absolutePath, name);
    const relPath = this.path ? joinPath(this.path, name) : name;

    if (options?.create) {
      const bridge = getVFSBridge();
      await bridge.mkdir(dirPath);
    }

    return new ElectronVFSDirectoryHandle(dirPath, relPath);
  }

  async removeEntry(
    name: string,
    options?: { recursive?: boolean }
  ): Promise<void> {
    const bridge = getVFSBridge();
    const targetPath = joinPath(this.absolutePath, name);
    await bridge.delete(targetPath, { recursive: options?.recursive ?? false });
  }

  async *entries(): AsyncIterable<[string, VFSEntry]> {
    const bridge = getVFSBridge();
    const dirEntries = await bridge.readDirectory(this.absolutePath);

    for (const entry of dirEntries) {
      const entryPath = this.path
        ? joinPath(this.path, entry.name)
        : entry.name;

      const vfsEntry: VFSEntry = {
        name: entry.name,
        kind: entry.kind,
        path: entryPath,
      };
      yield [entry.name, vfsEntry];
    }
  }
}

// -----------------------------------------------------------------------
// ElectronVFS
// -----------------------------------------------------------------------

/**
 * Electron implementation of the VirtualFileSystem interface.
 * Uses IPC calls via window.electronAPI.vfs.* for all operations.
 *
 * Unlike WebVFS, this implementation uses absolute filesystem paths
 * and does not require a prior openDirectory() call for path-based operations
 * (though openDirectory() provides the directory picker UI).
 */
export class ElectronVFS implements VirtualFileSystem {
  private rootPath: string | null = null;

  /**
   * Open a native directory picker dialog.
   * @throws Error if the Electron VFS API is not available
   * @throws Error if the user cancels the dialog
   */
  async openDirectory(): Promise<VFSDirectoryHandle> {
    const bridge = getVFSBridge();
    const result = await bridge.openDirectory();

    if (!result) {
      throw new Error("Directory picker was cancelled by the user.");
    }

    this.rootPath = result.path;
    return new ElectronVFSDirectoryHandle(result.path, "");
  }

  /**
   * Get a directory handle for a given path.
   * If the path is relative, it is resolved against the opened root directory.
   * If the path is absolute (starts with "/"), it is used directly.
   * @param path - Directory path
   */
  async getDirectoryHandle(path: string): Promise<VFSDirectoryHandle> {
    const absolutePath = this.resolvePath(path);
    return new ElectronVFSDirectoryHandle(absolutePath, path);
  }

  /**
   * Read a file as UTF-8 text.
   * @param path - File path (absolute or relative to root)
   */
  async readFile(path: string): Promise<string> {
    const bridge = getVFSBridge();
    const absolutePath = this.resolvePath(path);

    try {
      return await bridge.readFile(absolutePath);
    } catch (error) {
      throw new Error(
        `Failed to read file "${path}": ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Write UTF-8 text content to a file, creating parent directories as needed.
   * @param path - File path (absolute or relative to root)
   * @param content - Text content to write
   */
  async writeFile(path: string, content: string): Promise<void> {
    const bridge = getVFSBridge();
    const absolutePath = this.resolvePath(path);

    try {
      // Ensure parent directory exists
      const parentDir = dirname(absolutePath);
      await bridge.mkdir(parentDir);
      await bridge.writeFile(absolutePath, content);
    } catch (error) {
      throw new Error(
        `Failed to write file "${path}": ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Delete a file.
   * @param path - File path (absolute or relative to root)
   */
  async deleteFile(path: string): Promise<void> {
    const bridge = getVFSBridge();
    const absolutePath = this.resolvePath(path);

    try {
      await bridge.delete(absolutePath);
    } catch (error) {
      throw new Error(
        `Failed to delete file "${path}": ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get metadata about a file.
   * @param path - File path (absolute or relative to root)
   */
  async getFileMetadata(path: string): Promise<VFSFileMetadata> {
    const bridge = getVFSBridge();
    const absolutePath = this.resolvePath(path);

    try {
      const stat = await bridge.stat(absolutePath);
      return {
        name: basename(absolutePath),
        size: stat.size,
        lastModified: stat.lastModified,
        type: stat.type,
      };
    } catch (error) {
      throw new Error(
        `Failed to get metadata for "${path}": ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * List all entries in a directory.
   * @param path - Directory path (absolute or relative to root)
   */
  async listDirectory(path: string): Promise<VFSEntry[]> {
    const bridge = getVFSBridge();
    const absolutePath = this.resolvePath(path);

    try {
      const dirEntries = await bridge.readDirectory(absolutePath);
      return dirEntries.map((entry) => ({
        name: entry.name,
        kind: entry.kind,
        path: path ? joinPath(path, entry.name) : entry.name,
      }));
    } catch (error) {
      throw new Error(
        `Failed to list directory "${path}": ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Watch a file for changes.
   * Only available if the Electron main process supports it.
   * @param path - File path to watch
   * @param callback - Called when the file changes
   */
  watchFile(
    path: string,
    callback: (event: VFSWatchEvent) => void
  ): VFSWatcher {
    const bridge = getVFSBridge();
    if (!bridge.watch) {
      throw new Error("File watching is not supported by this Electron build.");
    }

    const absolutePath = this.resolvePath(path);
    return bridge.watch(absolutePath, callback);
  }

  getRootPath(): string | null {
    return this.rootPath;
  }

  isRootOpen(): boolean {
    return this.rootPath !== null;
  }

  /**
   * Resolve a path to an absolute path.
   * If the path is already absolute (starts with "/"), return it as-is.
   * Otherwise, join it with the root path.
   * @throws Error if no root path is available and path is relative
   */
  private resolvePath(path: string): string {
    // Absolute path - use as-is
    if (path.startsWith("/")) {
      return path;
    }
    // Relative path - join with root
    if (!this.rootPath) {
      throw new Error(
        "Cannot resolve relative path: no root directory has been opened. " +
          "Call openDirectory() first or use an absolute path."
      );
    }
    return joinPath(this.rootPath, path);
  }
}
