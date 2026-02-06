/**
 * Virtual File System (VFS) Abstraction Layer - Type Definitions
 *
 * Provides platform-agnostic interfaces for file operations.
 * Implementations exist for:
 * - Web: File System Access API (Chrome 86+)
 * - Electron: Node.js fs via IPC
 */

/**
 * Metadata for a file in the virtual file system.
 */
export interface VFSFileMetadata {
  /** File name (basename only) */
  name: string;
  /** File size in bytes */
  size: number;
  /** Last modification timestamp (ms since epoch) */
  lastModified: number;
  /** MIME type string */
  type: string;
}

/**
 * Represents a single entry (file or directory) in the virtual file system.
 */
export interface VFSEntry {
  /** Entry name (basename only) */
  name: string;
  /** Whether this entry is a file or directory */
  kind: "file" | "directory";
  /** Full path relative to VFS root */
  path: string;
}

/**
 * Event emitted when a watched file changes.
 */
export interface VFSWatchEvent {
  /** Type of change that occurred */
  type: "change" | "delete" | "create";
  /** Path of the affected file */
  path: string;
}

/**
 * Handle returned by watchFile, used to stop watching.
 */
export interface VFSWatcher {
  /** Stop watching the file */
  stop(): void;
}

/**
 * Handle to a file in the virtual file system.
 * Wraps platform-specific file handles (FileSystemFileHandle or path string).
 */
export interface VFSFileHandle {
  /** File name (basename only) */
  readonly name: string;
  /** Full path relative to VFS root */
  readonly path: string;
  /** Native FileSystemFileHandle (Web only). Used for IndexedDB persistence. */
  readonly nativeFileHandle?: FileSystemFileHandle;
  /** Get the underlying File object */
  getFile(): Promise<File>;
  /** Read file content as UTF-8 text */
  read(): Promise<string>;
  /** Write UTF-8 text content to the file */
  write(content: string): Promise<void>;
}

/**
 * Handle to a directory in the virtual file system.
 * Wraps platform-specific directory handles (FileSystemDirectoryHandle or path string).
 */
export interface VFSDirectoryHandle {
  /** Directory name (basename only) */
  readonly name: string;
  /** Full path relative to VFS root */
  readonly path: string;
  /** Native FileSystemDirectoryHandle (Web only). Used for IndexedDB persistence. */
  readonly nativeDirectoryHandle?: FileSystemDirectoryHandle;
  /**
   * Get a file handle by name within this directory.
   * @param name - File name to look up
   * @param options - Pass { create: true } to create the file if it does not exist
   */
  getFileHandle(
    name: string,
    options?: { create?: boolean }
  ): Promise<VFSFileHandle>;
  /**
   * Get a subdirectory handle by name within this directory.
   * @param name - Directory name to look up
   * @param options - Pass { create: true } to create the directory if it does not exist
   */
  getDirectoryHandle(
    name: string,
    options?: { create?: boolean }
  ): Promise<VFSDirectoryHandle>;
  /**
   * Remove an entry (file or directory) from this directory.
   * @param name - Entry name to remove
   * @param options - Pass { recursive: true } to remove directories with contents
   */
  removeEntry(
    name: string,
    options?: { recursive?: boolean }
  ): Promise<void>;
  /**
   * Iterate over all entries in this directory.
   * Yields [name, VFSEntry] pairs.
   */
  entries(): AsyncIterable<[string, VFSEntry]>;
}

/**
 * Main interface for the Virtual File System.
 * Provides unified file operations across Web and Electron environments.
 */
export interface VirtualFileSystem {
  /**
   * Open a directory picker dialog and return a handle to the selected directory.
   * @throws Error if the user cancels or the API is unavailable
   */
  openDirectory(): Promise<VFSDirectoryHandle>;

  /**
   * Get a directory handle from a known path.
   * In Web mode, this resolves against the previously opened root directory.
   * In Electron mode, this uses the absolute filesystem path.
   * @param path - Directory path to resolve
   */
  getDirectoryHandle(path: string): Promise<VFSDirectoryHandle>;

  /**
   * Read file content as UTF-8 text.
   * @param path - File path to read
   */
  readFile(path: string): Promise<string>;

  /**
   * Write UTF-8 text content to a file, creating it if it does not exist.
   * @param path - File path to write
   * @param content - Text content to write
   */
  writeFile(path: string, content: string): Promise<void>;

  /**
   * Delete a file.
   * @param path - File path to delete
   */
  deleteFile(path: string): Promise<void>;

  /**
   * Get metadata about a file.
   * @param path - File path to query
   */
  getFileMetadata(path: string): Promise<VFSFileMetadata>;

  /**
   * List all entries in a directory.
   * @param path - Directory path to list
   */
  listDirectory(path: string): Promise<VFSEntry[]>;

  /**
   * Watch a file for changes (optional, not all implementations support this).
   * @param path - File path to watch
   * @param callback - Called when the file changes
   * @returns A watcher that can be stopped
   */
  watchFile?(
    path: string,
    callback: (event: VFSWatchEvent) => void
  ): VFSWatcher;

  /** Get the root directory path as a string (Electron only). */
  getRootPath?(): string | null;

  /** Check whether a root directory has been opened. */
  isRootOpen(): boolean;
}
