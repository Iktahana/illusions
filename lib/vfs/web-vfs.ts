/**
 * Web File System Access API implementation of the Virtual File System.
 *
 * Uses the File System Access API (Chrome 86+) to provide file operations
 * in the browser environment. Requires user interaction to open a directory
 * via showDirectoryPicker() before most operations can be used.
 */

import type {
  VFSDirectoryHandle,
  VFSEntry,
  VFSFileHandle,
  VFSFileMetadata,
  VirtualFileSystem,
} from "./types";

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

/**
 * Split a path string into non-empty segments.
 * e.g. "/foo/bar/baz.txt" -> ["foo", "bar", "baz.txt"]
 */
function splitPath(path: string): string[] {
  return path.split("/").filter((segment) => segment.length > 0);
}

/**
 * Join path segments with "/", ensuring no double slashes.
 */
function joinPath(...parts: string[]): string {
  return parts
    .map((p) => p.replace(/^\/+|\/+$/g, ""))
    .filter((p) => p.length > 0)
    .join("/");
}

/**
 * Type guard for checking if showDirectoryPicker is available.
 */
function hasShowDirectoryPicker(
  w: Window
): w is Window & {
  showDirectoryPicker: (
    options?: { mode?: string }
  ) => Promise<FileSystemDirectoryHandle>;
} {
  return "showDirectoryPicker" in w;
}

/**
 * Navigate from a root FileSystemDirectoryHandle down to a subdirectory
 * specified by an array of path segments.
 *
 * @param root - The starting directory handle
 * @param segments - Path segments to traverse
 * @param create - Whether to create missing directories along the way
 * @returns The resolved FileSystemDirectoryHandle
 */
async function resolveDirectoryHandle(
  root: FileSystemDirectoryHandle,
  segments: string[],
  create = false
): Promise<FileSystemDirectoryHandle> {
  let current = root;
  for (const segment of segments) {
    current = await current.getDirectoryHandle(segment, { create });
  }
  return current;
}

/**
 * Navigate from a root handle to a file specified by a full path.
 * The path is split into directory segments + filename.
 *
 * @param root - The starting directory handle
 * @param path - Full file path (e.g. "subdir/file.txt")
 * @param create - Whether to create missing directories and file
 * @returns The resolved FileSystemFileHandle
 */
async function resolveFileHandle(
  root: FileSystemDirectoryHandle,
  path: string,
  create = false
): Promise<FileSystemFileHandle> {
  const segments = splitPath(path);
  if (segments.length === 0) {
    throw new Error("Cannot resolve file handle: empty path");
  }
  const fileName = segments.pop()!;
  const dirHandle = await resolveDirectoryHandle(root, segments, create);
  return dirHandle.getFileHandle(fileName, { create });
}

// -----------------------------------------------------------------------
// WebVFSFileHandle
// -----------------------------------------------------------------------

/**
 * Web implementation of VFSFileHandle.
 * Wraps a native FileSystemFileHandle.
 */
class WebVFSFileHandle implements VFSFileHandle {
  readonly name: string;
  readonly path: string;
  readonly nativeFileHandle: FileSystemFileHandle;
  private readonly handle: FileSystemFileHandle;

  constructor(handle: FileSystemFileHandle, path: string) {
    this.handle = handle;
    this.nativeFileHandle = handle;
    this.name = handle.name;
    this.path = path;
  }

  async getFile(): Promise<File> {
    return this.handle.getFile();
  }

  async read(): Promise<string> {
    const file = await this.handle.getFile();
    return file.text();
  }

  async write(content: string): Promise<void> {
    // FileSystemFileHandle.createWritable() is not in the base TS types,
    // but is available in browsers that support File System Access API.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const writable = await (this.handle as unknown as { createWritable(): Promise<WritableStream & { write(data: string): Promise<void>; close(): Promise<void> }> }).createWritable();
    await writable.write(content);
    await writable.close();
  }
}

// -----------------------------------------------------------------------
// WebVFSDirectoryHandle
// -----------------------------------------------------------------------

/**
 * Web implementation of VFSDirectoryHandle.
 * Wraps a native FileSystemDirectoryHandle.
 */
class WebVFSDirectoryHandle implements VFSDirectoryHandle {
  readonly name: string;
  readonly path: string;
  readonly nativeDirectoryHandle: FileSystemDirectoryHandle;
  private readonly handle: FileSystemDirectoryHandle;

  constructor(handle: FileSystemDirectoryHandle, path: string) {
    this.handle = handle;
    this.nativeDirectoryHandle = handle;
    this.name = handle.name;
    this.path = path;
  }

  async getFileHandle(
    name: string,
    options?: { create?: boolean }
  ): Promise<VFSFileHandle> {
    const nativeHandle = await this.handle.getFileHandle(name, {
      create: options?.create ?? false,
    });
    const filePath = joinPath(this.path, name);
    return new WebVFSFileHandle(nativeHandle, filePath);
  }

  async getDirectoryHandle(
    name: string,
    options?: { create?: boolean }
  ): Promise<VFSDirectoryHandle> {
    const nativeHandle = await this.handle.getDirectoryHandle(name, {
      create: options?.create ?? false,
    });
    const dirPath = joinPath(this.path, name);
    return new WebVFSDirectoryHandle(nativeHandle, dirPath);
  }

  async removeEntry(
    name: string,
    options?: { recursive?: boolean }
  ): Promise<void> {
    // FileSystemDirectoryHandle.removeEntry is part of the File System Access API
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (this.handle as unknown as { removeEntry(name: string, options?: { recursive?: boolean }): Promise<void> }).removeEntry(name, {
      recursive: options?.recursive ?? false,
    });
  }

  async *entries(): AsyncIterable<[string, VFSEntry]> {
    // FileSystemDirectoryHandle is an AsyncIterable in supporting browsers
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const iterable = this.handle as unknown as AsyncIterable<[string, FileSystemHandle & { kind: "file" | "directory" }]>;
    for await (const [entryName, entryHandle] of iterable) {
      const entryPath = joinPath(this.path, entryName);
      const entry: VFSEntry = {
        name: entryName,
        kind: entryHandle.kind,
        path: entryPath,
      };
      yield [entryName, entry];
    }
  }
}

// -----------------------------------------------------------------------
// WebVFS
// -----------------------------------------------------------------------

/**
 * Web implementation of the VirtualFileSystem interface.
 * Uses the File System Access API for all operations.
 *
 * Usage flow:
 * 1. Call openDirectory() to let the user pick a root directory
 * 2. Use readFile/writeFile/etc. with paths relative to that root
 */
export class WebVFS implements VirtualFileSystem {
  private rootHandle: FileSystemDirectoryHandle | null = null;

  /**
   * Open a directory picker dialog and store the root handle.
   * @throws Error if the File System Access API is not supported
   * @throws Error if the user cancels the picker
   */
  async openDirectory(): Promise<VFSDirectoryHandle> {
    if (!hasShowDirectoryPicker(window)) {
      throw new Error(
        "File System Access API is not supported in this browser. " +
          "Please use Chrome 86+ or a Chromium-based browser."
      );
    }

    try {
      const handle = await window.showDirectoryPicker({ mode: "readwrite" });
      this.rootHandle = handle;
      return new WebVFSDirectoryHandle(handle, "");
    } catch (error) {
      if ((error as { name?: string }).name === "AbortError") {
        throw new Error("Directory picker was cancelled by the user.");
      }
      throw new Error(
        `Failed to open directory: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get a directory handle by navigating from the root.
   * @param path - Path relative to the opened root directory
   * @throws Error if no root directory has been opened
   */
  async getDirectoryHandle(path: string): Promise<VFSDirectoryHandle> {
    const root = this.ensureRoot();
    const segments = splitPath(path);

    if (segments.length === 0) {
      return new WebVFSDirectoryHandle(root, "");
    }

    try {
      const handle = await resolveDirectoryHandle(root, segments);
      return new WebVFSDirectoryHandle(handle, path);
    } catch (error) {
      throw new Error(
        `Failed to get directory "${path}": ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Read a file as UTF-8 text.
   * @param path - File path relative to root
   */
  async readFile(path: string): Promise<string> {
    const root = this.ensureRoot();
    try {
      const fileHandle = await resolveFileHandle(root, path);
      const file = await fileHandle.getFile();
      return file.text();
    } catch (error) {
      throw new Error(
        `Failed to read file "${path}": ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Write UTF-8 text content to a file, creating directories as needed.
   * @param path - File path relative to root
   * @param content - Text content to write
   */
  async writeFile(path: string, content: string): Promise<void> {
    const root = this.ensureRoot();
    try {
      const fileHandle = await resolveFileHandle(root, path, true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const writable = await (fileHandle as unknown as { createWritable(): Promise<WritableStream & { write(data: string): Promise<void>; close(): Promise<void> }> }).createWritable();
      await writable.write(content);
      await writable.close();
    } catch (error) {
      throw new Error(
        `Failed to write file "${path}": ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Delete a file.
   * @param path - File path relative to root
   */
  async deleteFile(path: string): Promise<void> {
    const root = this.ensureRoot();
    const segments = splitPath(path);
    if (segments.length === 0) {
      throw new Error("Cannot delete file: empty path");
    }

    const fileName = segments.pop()!;

    try {
      const parentHandle = await resolveDirectoryHandle(root, segments);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (parentHandle as unknown as { removeEntry(name: string): Promise<void> }).removeEntry(fileName);
    } catch (error) {
      throw new Error(
        `Failed to delete file "${path}": ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get metadata about a file.
   * @param path - File path relative to root
   */
  async getFileMetadata(path: string): Promise<VFSFileMetadata> {
    const root = this.ensureRoot();
    try {
      const fileHandle = await resolveFileHandle(root, path);
      const file = await fileHandle.getFile();
      return {
        name: file.name,
        size: file.size,
        lastModified: file.lastModified,
        type: file.type,
      };
    } catch (error) {
      throw new Error(
        `Failed to get metadata for "${path}": ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * List all entries in a directory.
   * @param path - Directory path relative to root
   */
  async listDirectory(path: string): Promise<VFSEntry[]> {
    const root = this.ensureRoot();
    const segments = splitPath(path);

    try {
      const dirHandle =
        segments.length === 0
          ? root
          : await resolveDirectoryHandle(root, segments);

      const entries: VFSEntry[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const iterable = dirHandle as unknown as AsyncIterable<[string, FileSystemHandle & { kind: "file" | "directory" }]>;
      for await (const [entryName, entryHandle] of iterable) {
        entries.push({
          name: entryName,
          kind: entryHandle.kind,
          path: joinPath(path, entryName),
        });
      }
      return entries;
    } catch (error) {
      throw new Error(
        `Failed to list directory "${path}": ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // watchFile is not implemented for Web - browsers do not support FS watching

  getRootPath(): string | null {
    return null;
  }

  isRootOpen(): boolean {
    return this.rootHandle !== null;
  }

  /**
   * Ensure the root directory handle has been set via openDirectory().
   * @throws Error if no root directory is available
   */
  private ensureRoot(): FileSystemDirectoryHandle {
    if (!this.rootHandle) {
      throw new Error(
        "No root directory has been opened. Call openDirectory() first."
      );
    }
    return this.rootHandle;
  }
}
