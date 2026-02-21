/**
 * Unit tests for the Virtual File System abstraction layer.
 *
 * Tests cover:
 * - WebVFS: path resolution, file read/write, directory listing
 * - ElectronVFS: path joining, IPC bridging, file operations
 * - Factory: correct implementation selection based on environment
 *
 * Note: These tests mock browser/Electron APIs and do not require
 * a real filesystem or browser environment to run.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import type { VFSEntry, VirtualFileSystem } from "../types";

// -----------------------------------------------------------------------
// Mock helpers
// -----------------------------------------------------------------------

/**
 * Create a minimal mock FileSystemFileHandle.
 */
function createMockFileHandle(
  name: string,
  content: string,
  lastModified = Date.now()
): FileSystemFileHandle {
  const mockFile = new File([content], name, {
    type: "text/plain",
    lastModified,
  });

  let writtenContent = content;
  const mockWritable = {
    write: async (data: string): Promise<void> => {
      writtenContent = data;
    },
    close: async (): Promise<void> => {
      // no-op
    },
  };

  return {
    kind: "file" as const,
    name,
    getFile: async () =>
      new File([writtenContent], name, {
        type: "text/plain",
        lastModified,
      }),
    createWritable: async () => mockWritable,
    isSameEntry: async () => false,
    queryPermission: async () => "granted" as PermissionState,
    requestPermission: async () => "granted" as PermissionState,
  } as unknown as FileSystemFileHandle;
}

/**
 * Create a minimal mock FileSystemDirectoryHandle.
 * Supports nested directories and files via a simple map.
 */
function createMockDirectoryHandle(
  name: string,
  children: Map<string, { kind: "file" | "directory"; handle: unknown }>
): FileSystemDirectoryHandle {
  const handle: unknown = {
    kind: "directory" as const,
    name,
    getFileHandle: async (
      childName: string,
      options?: { create?: boolean }
    ) => {
      const child = children.get(childName);
      if (child && child.kind === "file") {
        return child.handle;
      }
      if (options?.create) {
        const newHandle = createMockFileHandle(childName, "");
        children.set(childName, { kind: "file", handle: newHandle });
        return newHandle;
      }
      throw new DOMException(
        `File "${childName}" not found`,
        "NotFoundError"
      );
    },
    getDirectoryHandle: async (
      childName: string,
      options?: { create?: boolean }
    ) => {
      const child = children.get(childName);
      if (child && child.kind === "directory") {
        return child.handle;
      }
      if (options?.create) {
        const newHandle = createMockDirectoryHandle(
          childName,
          new Map()
        );
        children.set(childName, {
          kind: "directory",
          handle: newHandle,
        });
        return newHandle;
      }
      throw new DOMException(
        `Directory "${childName}" not found`,
        "NotFoundError"
      );
    },
    removeEntry: async (_childName: string) => {
      children.delete(_childName);
    },
    isSameEntry: async () => false,
    queryPermission: async () => "granted" as PermissionState,
    requestPermission: async () => "granted" as PermissionState,
    // Make it async-iterable for entries()
    [Symbol.asyncIterator]: async function* () {
      for (const [entryName, entry] of children) {
        yield [entryName, { kind: entry.kind, name: entryName }];
      }
    },
  };

  return handle as FileSystemDirectoryHandle;
}

// -----------------------------------------------------------------------
// WebVFS Tests
// -----------------------------------------------------------------------

describe("WebVFS", () => {
  let WebVFS: new () => VirtualFileSystem;

  beforeEach(async () => {
    // Reset modules to get a clean slate
    vi.resetModules();

    // Remove Electron API from window
    delete (window as any).electronAPI;

    const webVfsModule = await import("../web-vfs");
    WebVFS = webVfsModule.WebVFS;
  });

  describe("openDirectory", () => {
    it("should throw if File System Access API is not supported", async () => {
      delete (window as any).showDirectoryPicker;
      const vfs = new WebVFS();

      await expect(vfs.openDirectory()).rejects.toThrow(
        "File System Access API is not supported"
      );
    });

    it("should throw if user cancels the picker", async () => {
      (window as any).showDirectoryPicker = async () => {
        throw new DOMException("User cancelled", "AbortError");
      };

      const vfs = new WebVFS();
      await expect(vfs.openDirectory()).rejects.toThrow(
        "Directory picker was cancelled by the user"
      );
    });

    it("should return a directory handle on success", async () => {
      const mockDir = createMockDirectoryHandle("project", new Map());
      (window as any).showDirectoryPicker = async () => mockDir;

      const vfs = new WebVFS();
      const handle = await vfs.openDirectory();

      expect(handle.name).toBe("project");
      expect(handle.path).toBe("");
    });
  });

  describe("readFile / writeFile", () => {
    it("should throw if no root directory is opened", async () => {
      const vfs = new WebVFS();

      await expect(vfs.readFile("test.txt")).rejects.toThrow(
        "No root directory has been opened"
      );
    });

    it("should read file content through path resolution", async () => {
      const fileHandle = createMockFileHandle("hello.txt", "Hello, world!");
      const subDir = createMockDirectoryHandle(
        "sub",
        new Map([["hello.txt", { kind: "file", handle: fileHandle }]])
      );
      const rootDir = createMockDirectoryHandle(
        "root",
        new Map([["sub", { kind: "directory", handle: subDir }]])
      );

      (window as any).showDirectoryPicker = async () => rootDir;

      const vfs = new WebVFS();
      await vfs.openDirectory();

      const content = await vfs.readFile("sub/hello.txt");
      expect(content).toBe("Hello, world!");
    });

    it("should write file and create parent directories", async () => {
      const rootDir = createMockDirectoryHandle("root", new Map());
      (window as any).showDirectoryPicker = async () => rootDir;

      const vfs = new WebVFS();
      await vfs.openDirectory();

      // writeFile with create=true should create dirs and file
      await vfs.writeFile("newdir/newfile.txt", "new content");

      // The file should now be readable
      const content = await vfs.readFile("newdir/newfile.txt");
      expect(content).toBe("new content");
    });
  });

  describe("getFileMetadata", () => {
    it("should return correct metadata", async () => {
      const timestamp = 1700000000000;
      const fileHandle = createMockFileHandle(
        "data.mdi",
        "some content",
        timestamp
      );
      const rootDir = createMockDirectoryHandle(
        "root",
        new Map([["data.mdi", { kind: "file", handle: fileHandle }]])
      );

      (window as any).showDirectoryPicker = async () => rootDir;

      const vfs = new WebVFS();
      await vfs.openDirectory();

      const meta = await vfs.getFileMetadata("data.mdi");
      expect(meta.name).toBe("data.mdi");
      expect(meta.lastModified).toBe(timestamp);
      expect(meta.size).toBeGreaterThan(0);
    });
  });

  describe("listDirectory", () => {
    it("should list entries in a directory", async () => {
      const file1 = createMockFileHandle("a.txt", "aaa");
      const file2 = createMockFileHandle("b.txt", "bbb");
      const subDir = createMockDirectoryHandle("sub", new Map());

      const rootDir = createMockDirectoryHandle(
        "root",
        new Map([
          ["a.txt", { kind: "file", handle: file1 }],
          ["b.txt", { kind: "file", handle: file2 }],
          ["sub", { kind: "directory", handle: subDir }],
        ])
      );

      (window as any).showDirectoryPicker = async () => rootDir;

      const vfs = new WebVFS();
      await vfs.openDirectory();

      const entries = await vfs.listDirectory("");
      const names = entries.map((e: VFSEntry) => e.name).sort();
      expect(names).toEqual(["a.txt", "b.txt", "sub"]);

      const fileEntries = entries.filter((e: VFSEntry) => e.kind === "file");
      expect(fileEntries.length).toBe(2);

      const dirEntries = entries.filter(
        (e: VFSEntry) => e.kind === "directory"
      );
      expect(dirEntries.length).toBe(1);
    });
  });

  describe("deleteFile", () => {
    it("should throw on empty path", async () => {
      const rootDir = createMockDirectoryHandle("root", new Map());
      (window as any).showDirectoryPicker = async () => rootDir;

      const vfs = new WebVFS();
      await vfs.openDirectory();

      await expect(vfs.deleteFile("")).rejects.toThrow("empty path");
    });
  });
});

// -----------------------------------------------------------------------
// ElectronVFS Tests
// -----------------------------------------------------------------------

describe("ElectronVFS", () => {
  let ElectronVFS: new () => VirtualFileSystem;

  const mockBridge = {
    openDirectory: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    readDirectory: vi.fn(),
    stat: vi.fn(),
    mkdir: vi.fn(),
    delete: vi.fn(),
  };

  beforeEach(async () => {
    vi.resetModules();

    // Set up Electron API mock with vfs bridge
    (window as any).electronAPI = {
      isElectron: true,
      vfs: mockBridge,
    };

    // Reset all mocks
    Object.values(mockBridge).forEach((fn) => fn.mockReset());

    const electronVfsModule = await import("../electron-vfs");
    ElectronVFS = electronVfsModule.ElectronVFS;
  });

  afterEach(() => {
    delete (window as any).electronAPI;
  });

  describe("openDirectory", () => {
    it("should throw if Electron API is not available", async () => {
      delete (window as any).electronAPI;
      const vfs = new ElectronVFS();

      await expect(vfs.openDirectory()).rejects.toThrow(
        "Electron API is not available"
      );
    });

    it("should throw if user cancels the dialog", async () => {
      mockBridge.openDirectory.mockResolvedValue(null);
      const vfs = new ElectronVFS();

      await expect(vfs.openDirectory()).rejects.toThrow(
        "Directory picker was cancelled"
      );
    });

    it("should return a directory handle on success", async () => {
      mockBridge.openDirectory.mockResolvedValue({
        path: "/Users/test/project",
        name: "project",
      });

      const vfs = new ElectronVFS();
      const handle = await vfs.openDirectory();

      expect(handle.name).toBe("project");
      expect(handle.path).toBe("");
    });
  });

  describe("readFile / writeFile", () => {
    it("should read file using absolute path", async () => {
      mockBridge.readFile.mockResolvedValue("file content");

      const vfs = new ElectronVFS();
      const content = await vfs.readFile("/absolute/path/file.txt");

      expect(content).toBe("file content");
      expect(mockBridge.readFile).toHaveBeenCalledWith(
        "/absolute/path/file.txt"
      );
    });

    it("should read file using relative path after openDirectory", async () => {
      mockBridge.openDirectory.mockResolvedValue({
        path: "/Users/test/project",
        name: "project",
      });
      mockBridge.readFile.mockResolvedValue("relative content");

      const vfs = new ElectronVFS();
      await vfs.openDirectory();
      const content = await vfs.readFile("docs/readme.txt");

      expect(content).toBe("relative content");
      expect(mockBridge.readFile).toHaveBeenCalledWith(
        "/Users/test/project/docs/readme.txt"
      );
    });

    it("should throw for relative path without root", async () => {
      const vfs = new ElectronVFS();

      await expect(vfs.readFile("relative/path.txt")).rejects.toThrow(
        "no root directory has been opened"
      );
    });

    it("should write file and create parent directories", async () => {
      mockBridge.mkdir.mockResolvedValue(undefined);
      mockBridge.writeFile.mockResolvedValue(undefined);

      const vfs = new ElectronVFS();
      await vfs.writeFile("/absolute/path/file.txt", "content");

      expect(mockBridge.mkdir).toHaveBeenCalledWith("/absolute/path");
      expect(mockBridge.writeFile).toHaveBeenCalledWith(
        "/absolute/path/file.txt",
        "content"
      );
    });
  });

  describe("getFileMetadata", () => {
    it("should return metadata from stat", async () => {
      mockBridge.stat.mockResolvedValue({
        size: 1024,
        lastModified: 1700000000000,
        type: "text/plain",
      });

      const vfs = new ElectronVFS();
      const meta = await vfs.getFileMetadata("/path/to/file.mdi");

      expect(meta.name).toBe("file.mdi");
      expect(meta.size).toBe(1024);
      expect(meta.lastModified).toBe(1700000000000);
      expect(meta.type).toBe("text/plain");
    });
  });

  describe("listDirectory", () => {
    it("should list directory entries", async () => {
      mockBridge.readDirectory.mockResolvedValue([
        { name: "chapter1.mdi", kind: "file" },
        { name: "images", kind: "directory" },
        { name: "chapter2.mdi", kind: "file" },
      ]);

      const vfs = new ElectronVFS();
      const entries = await vfs.listDirectory("/project/novel");

      expect(entries.length).toBe(3);
      expect(entries[0].name).toBe("chapter1.mdi");
      expect(entries[0].kind).toBe("file");
      expect(entries[1].name).toBe("images");
      expect(entries[1].kind).toBe("directory");
    });
  });

  describe("deleteFile", () => {
    it("should delete a file by absolute path", async () => {
      mockBridge.delete.mockResolvedValue(undefined);

      const vfs = new ElectronVFS();
      await vfs.deleteFile("/path/to/delete.txt");

      expect(mockBridge.delete).toHaveBeenCalledWith("/path/to/delete.txt");
    });
  });

  describe("directory handle operations", () => {
    it("should create file handle with create option", async () => {
      mockBridge.openDirectory.mockResolvedValue({
        path: "/Users/test/project",
        name: "project",
      });
      mockBridge.stat.mockRejectedValue(new Error("not found"));
      mockBridge.writeFile.mockResolvedValue(undefined);
      mockBridge.readFile.mockResolvedValue("created content");

      const vfs = new ElectronVFS();
      const dirHandle = await vfs.openDirectory();
      const fileHandle = await dirHandle.getFileHandle("new.txt", {
        create: true,
      });

      expect(fileHandle.name).toBe("new.txt");
      const content = await fileHandle.read();
      expect(content).toBe("created content");
    });

    it("should create subdirectory with create option", async () => {
      mockBridge.openDirectory.mockResolvedValue({
        path: "/Users/test/project",
        name: "project",
      });
      mockBridge.mkdir.mockResolvedValue(undefined);

      const vfs = new ElectronVFS();
      const dirHandle = await vfs.openDirectory();
      const subDir = await dirHandle.getDirectoryHandle("subdir", {
        create: true,
      });

      expect(subDir.name).toBe("subdir");
      expect(mockBridge.mkdir).toHaveBeenCalledWith(
        "/Users/test/project/subdir"
      );
    });
  });
});

// -----------------------------------------------------------------------
// Factory Tests
// -----------------------------------------------------------------------

describe("VFS Factory (getVFS / resetVFS)", () => {
  beforeEach(async () => {
    vi.resetModules();
  });

  afterEach(() => {
    delete (window as any).electronAPI;
  });

  it("should return WebVFS in browser environment", async () => {
    delete (window as any).electronAPI;

    // Import the concrete class directly (bypassing require in factory)
    const { WebVFS } = await import("../web-vfs");
    const { getVFS, resetVFS } = await import("../index");
    resetVFS();

    const vfs = getVFS();
    expect(vfs).toBeDefined();
    expect(vfs).toBeInstanceOf(WebVFS);
    expect(typeof vfs.openDirectory).toBe("function");
    expect(typeof vfs.readFile).toBe("function");
  });

  it("should return ElectronVFS in Electron environment", async () => {
    (window as any).electronAPI = {
      isElectron: true,
      vfs: {
        openDirectory: vi.fn(),
        readFile: vi.fn(),
        writeFile: vi.fn(),
        readDirectory: vi.fn(),
        stat: vi.fn(),
        mkdir: vi.fn(),
        delete: vi.fn(),
      },
    };

    const { ElectronVFS } = await import("../electron-vfs");
    const { getVFS, resetVFS } = await import("../index");
    resetVFS();

    const vfs = getVFS();
    expect(vfs).toBeDefined();
    expect(vfs).toBeInstanceOf(ElectronVFS);
    expect(typeof vfs.openDirectory).toBe("function");
    expect(typeof vfs.readFile).toBe("function");
  });

  it("should return the same singleton instance", async () => {
    delete (window as any).electronAPI;

    const { getVFS, resetVFS } = await import("../index");
    resetVFS();

    const vfs1 = getVFS();
    const vfs2 = getVFS();
    expect(vfs1).toBe(vfs2);
  });

  it("should return a new instance after resetVFS", async () => {
    delete (window as any).electronAPI;

    const { getVFS, resetVFS } = await import("../index");
    resetVFS();

    const vfs1 = getVFS();
    resetVFS();
    const vfs2 = getVFS();

    expect(vfs1).not.toBe(vfs2);
  });
});
