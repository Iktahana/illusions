/**
 * Unit tests for the MDI file handler (mdi-file.ts).
 *
 * Tests cover:
 * - Internal helper functions (basename, ensureExtension, getDefaultFileName)
 * - openMdiFile: Electron IPC path, File System Access API path, error handling
 * - saveMdiFile: Electron IPC save, browser save, error handling
 * - MdiFileDescriptor and SaveMdiParams type contracts
 *
 * Note: Browser/Electron APIs are fully mocked; no real filesystem access.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// -----------------------------------------------------------------------
// Mocks for runtime-env module
// -----------------------------------------------------------------------

const mockGetRuntimeEnvironment = vi.fn<() => string>();
const mockIsBrowser = vi.fn<() => boolean>();

vi.mock("@/lib/runtime-env", () => ({
  getRuntimeEnvironment: () => mockGetRuntimeEnvironment(),
  isBrowser: () => mockIsBrowser(),
}));

// -----------------------------------------------------------------------
// Import module under test (after mocks are registered)
// -----------------------------------------------------------------------

import { openMdiFile, saveMdiFile } from "@/lib/mdi-file";

import type {
  MdiFileDescriptor,
  OpenMdiResult,
  SaveMdiParams,
} from "@/lib/mdi-file";

// -----------------------------------------------------------------------
// Mock helpers
// -----------------------------------------------------------------------

/** Create a minimal mock FileSystemFileHandle for browser tests. */
function createMockFileHandle(
  name: string,
  content: string
): FileSystemFileHandle {
  const mockFile = new File([content], name, { type: "text/plain" });

  let writtenContent = content;
  const mockWritable = {
    write: vi.fn(async (data: string): Promise<void> => {
      writtenContent = data;
    }),
    close: vi.fn(async (): Promise<void> => {
      // no-op
    }),
  };

  return {
    kind: "file" as const,
    name,
    getFile: vi.fn(async () =>
      new File([writtenContent], name, { type: "text/plain" })
    ),
    createWritable: vi.fn(async () => mockWritable),
    isSameEntry: vi.fn(async () => false),
    queryPermission: vi.fn(async () => "granted" as PermissionState),
    requestPermission: vi.fn(async () => "granted" as PermissionState),
  } as unknown as FileSystemFileHandle;
}

// -----------------------------------------------------------------------
// openMdiFile Tests
// -----------------------------------------------------------------------

describe("openMdiFile", () => {
  beforeEach(() => {
    mockGetRuntimeEnvironment.mockReset();
    mockIsBrowser.mockReset();
    delete (window as any).electronAPI;
    delete (window as any).showOpenFilePicker;
  });

  afterEach(() => {
    delete (window as any).electronAPI;
    delete (window as any).showOpenFilePicker;
  });

  describe("Electron environment", () => {
    it("should return parsed result from Electron IPC", async () => {
      mockGetRuntimeEnvironment.mockReturnValue("electron-renderer");
      (window as any).electronAPI = {
        openFile: vi.fn().mockResolvedValue({
          path: "/Users/test/novel/chapter1.mdi",
          content: "# Chapter 1\n\nHello world",
        }),
      };

      const result = await openMdiFile();

      expect(result).not.toBeNull();
      expect(result!.descriptor.path).toBe("/Users/test/novel/chapter1.mdi");
      expect(result!.descriptor.name).toBe("chapter1.mdi");
      expect(result!.descriptor.handle).toBeNull();
      expect(result!.content).toBe("# Chapter 1\n\nHello world");
    });

    it("should return null when user cancels the Electron dialog", async () => {
      mockGetRuntimeEnvironment.mockReturnValue("electron-renderer");
      (window as any).electronAPI = {
        openFile: vi.fn().mockResolvedValue(null),
      };

      const result = await openMdiFile();
      expect(result).toBeNull();
    });

    it("should return null when Electron IPC throws an error", async () => {
      mockGetRuntimeEnvironment.mockReturnValue("electron-renderer");
      (window as any).electronAPI = {
        openFile: vi.fn().mockRejectedValue(new Error("IPC error")),
      };

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const result = await openMdiFile();

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it("should extract basename correctly from Windows-style paths", async () => {
      mockGetRuntimeEnvironment.mockReturnValue("electron-renderer");
      (window as any).electronAPI = {
        openFile: vi.fn().mockResolvedValue({
          path: "C:\\Users\\test\\novel\\chapter1.mdi",
          content: "content",
        }),
      };

      const result = await openMdiFile();

      expect(result).not.toBeNull();
      expect(result!.descriptor.name).toBe("chapter1.mdi");
    });
  });

  describe("Browser environment (File System Access API)", () => {
    it("should return null if not in a browser environment", async () => {
      mockGetRuntimeEnvironment.mockReturnValue("unknown");
      mockIsBrowser.mockReturnValue(false);

      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const result = await openMdiFile();

      expect(result).toBeNull();
      consoleSpy.mockRestore();
    });

    it("should return null if showOpenFilePicker is not supported", async () => {
      mockGetRuntimeEnvironment.mockReturnValue("browser");
      mockIsBrowser.mockReturnValue(true);
      // showOpenFilePicker is not defined on window

      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const result = await openMdiFile();

      expect(result).toBeNull();
      consoleSpy.mockRestore();
    });

    it("should open a file via showOpenFilePicker", async () => {
      mockGetRuntimeEnvironment.mockReturnValue("browser");
      mockIsBrowser.mockReturnValue(true);

      const fileHandle = createMockFileHandle("novel.mdi", "MDI content here");
      (window as any).showOpenFilePicker = vi
        .fn()
        .mockResolvedValue([fileHandle]);

      const result = await openMdiFile();

      expect(result).not.toBeNull();
      expect(result!.descriptor.path).toBeNull();
      expect(result!.descriptor.handle).toBe(fileHandle);
      expect(result!.descriptor.name).toBe("novel.mdi");
      expect(result!.content).toBe("MDI content here");
    });

    it("should return null when user cancels the file picker (AbortError)", async () => {
      mockGetRuntimeEnvironment.mockReturnValue("browser");
      mockIsBrowser.mockReturnValue(true);

      const abortError = new DOMException("User cancelled", "AbortError");
      (window as any).showOpenFilePicker = vi
        .fn()
        .mockRejectedValue(abortError);

      const result = await openMdiFile();
      expect(result).toBeNull();
    });

    it("should return null and log error for non-AbortError exceptions", async () => {
      mockGetRuntimeEnvironment.mockReturnValue("browser");
      mockIsBrowser.mockReturnValue(true);

      (window as any).showOpenFilePicker = vi
        .fn()
        .mockRejectedValue(new Error("Permission denied"));

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const result = await openMdiFile();

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});

// -----------------------------------------------------------------------
// saveMdiFile Tests
// -----------------------------------------------------------------------

describe("saveMdiFile", () => {
  beforeEach(() => {
    mockGetRuntimeEnvironment.mockReset();
    mockIsBrowser.mockReset();
    delete (window as any).electronAPI;
    delete (window as any).showSaveFilePicker;
  });

  afterEach(() => {
    delete (window as any).electronAPI;
    delete (window as any).showSaveFilePicker;
  });

  describe("Electron environment", () => {
    it("should save to an existing path and return result", async () => {
      mockGetRuntimeEnvironment.mockReturnValue("electron-renderer");
      (window as any).electronAPI = {
        saveFile: vi
          .fn()
          .mockResolvedValue("/Users/test/novel/chapter1.mdi"),
      };

      const descriptor: MdiFileDescriptor = {
        path: "/Users/test/novel/chapter1.mdi",
        handle: null,
        name: "chapter1.mdi",
      };

      const result = await saveMdiFile({
        descriptor,
        content: "Updated content",
      });

      expect(result).not.toBeNull();
      expect(result!.descriptor.path).toBe("/Users/test/novel/chapter1.mdi");
      expect(result!.descriptor.name).toBe("chapter1.mdi");
      expect(result!.content).toBe("Updated content");
      expect((window as any).electronAPI.saveFile).toHaveBeenCalledWith(
        "/Users/test/novel/chapter1.mdi",
        "Updated content",
        ".mdi"
      );
    });

    it("should save new file (no existing descriptor) with Save As dialog", async () => {
      mockGetRuntimeEnvironment.mockReturnValue("electron-renderer");
      (window as any).electronAPI = {
        saveFile: vi
          .fn()
          .mockResolvedValue("/Users/test/novel/new-file.mdi"),
      };

      const result = await saveMdiFile({
        descriptor: null,
        content: "New file content",
      });

      expect(result).not.toBeNull();
      expect(result!.descriptor.path).toBe("/Users/test/novel/new-file.mdi");
      expect(result!.descriptor.name).toBe("new-file.mdi");
      expect((window as any).electronAPI.saveFile).toHaveBeenCalledWith(
        null,
        "New file content",
        ".mdi"
      );
    });

    it("should return null when user cancels the save dialog", async () => {
      mockGetRuntimeEnvironment.mockReturnValue("electron-renderer");
      (window as any).electronAPI = {
        saveFile: vi.fn().mockResolvedValue(null),
      };

      const result = await saveMdiFile({
        descriptor: null,
        content: "content",
      });

      expect(result).toBeNull();
    });

    it("should throw when Electron returns a structured error", async () => {
      mockGetRuntimeEnvironment.mockReturnValue("electron-renderer");
      (window as any).electronAPI = {
        saveFile: vi.fn().mockResolvedValue({
          success: false,
          error: "Disk full",
        }),
      };

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(
        saveMdiFile({ descriptor: null, content: "content" })
      ).rejects.toThrow("Disk full");

      consoleSpy.mockRestore();
    });

    it("should throw when Electron IPC rejects", async () => {
      mockGetRuntimeEnvironment.mockReturnValue("electron-renderer");
      (window as any).electronAPI = {
        saveFile: vi.fn().mockRejectedValue(new Error("IPC failure")),
      };

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(
        saveMdiFile({ descriptor: null, content: "content" })
      ).rejects.toThrow("IPC failure");

      consoleSpy.mockRestore();
    });

    it("should use the correct file extension for .md files", async () => {
      mockGetRuntimeEnvironment.mockReturnValue("electron-renderer");
      (window as any).electronAPI = {
        saveFile: vi
          .fn()
          .mockResolvedValue("/Users/test/doc.md"),
      };

      const result = await saveMdiFile({
        descriptor: null,
        content: "# Heading",
        fileType: ".md",
      });

      expect(result).not.toBeNull();
      expect(result!.descriptor.name).toBe("doc.md");
      expect((window as any).electronAPI.saveFile).toHaveBeenCalledWith(
        null,
        "# Heading",
        ".md"
      );
    });
  });

  describe("Browser environment", () => {
    it("should return null when not in a browser", async () => {
      mockGetRuntimeEnvironment.mockReturnValue("unknown");
      mockIsBrowser.mockReturnValue(false);

      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const result = await saveMdiFile({
        descriptor: null,
        content: "content",
      });

      expect(result).toBeNull();
      consoleSpy.mockRestore();
    });

    it("should save to an existing file handle without showing picker", async () => {
      mockGetRuntimeEnvironment.mockReturnValue("browser");
      mockIsBrowser.mockReturnValue(true);

      const fileHandle = createMockFileHandle("existing.mdi", "old content");
      const descriptor: MdiFileDescriptor = {
        path: null,
        handle: fileHandle,
        name: "existing.mdi",
      };

      const result = await saveMdiFile({
        descriptor,
        content: "updated content",
      });

      expect(result).not.toBeNull();
      expect(result!.descriptor.handle).toBe(fileHandle);
      expect(result!.descriptor.name).toBe("existing.mdi");
      expect(result!.content).toBe("updated content");
    });

    it("should use showSaveFilePicker when no handle exists", async () => {
      mockGetRuntimeEnvironment.mockReturnValue("browser");
      mockIsBrowser.mockReturnValue(true);

      const savedHandle = createMockFileHandle("saved.mdi", "");
      (window as any).showSaveFilePicker = vi
        .fn()
        .mockResolvedValue(savedHandle);

      const result = await saveMdiFile({
        descriptor: null,
        content: "new content",
      });

      expect(result).not.toBeNull();
      expect(result!.descriptor.handle).toBe(savedHandle);
      expect(result!.content).toBe("new content");
    });

    it("should return null when showSaveFilePicker is not available and no handle", async () => {
      mockGetRuntimeEnvironment.mockReturnValue("browser");
      mockIsBrowser.mockReturnValue(true);
      // No showSaveFilePicker on window, and no existing handle

      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const result = await saveMdiFile({
        descriptor: null,
        content: "content",
      });

      expect(result).toBeNull();
      consoleSpy.mockRestore();
    });

    it("should return null when user cancels save picker (AbortError)", async () => {
      mockGetRuntimeEnvironment.mockReturnValue("browser");
      mockIsBrowser.mockReturnValue(true);

      const abortError = new DOMException("User cancelled", "AbortError");
      (window as any).showSaveFilePicker = vi
        .fn()
        .mockRejectedValue(abortError);

      const result = await saveMdiFile({
        descriptor: null,
        content: "content",
      });

      expect(result).toBeNull();
    });
  });
});

// -----------------------------------------------------------------------
// MdiFileDescriptor type contract tests
// -----------------------------------------------------------------------

describe("MdiFileDescriptor", () => {
  it("should represent an Electron file descriptor", () => {
    const descriptor: MdiFileDescriptor = {
      path: "/Users/test/file.mdi",
      handle: null,
      name: "file.mdi",
    };

    expect(descriptor.path).toBe("/Users/test/file.mdi");
    expect(descriptor.handle).toBeNull();
    expect(descriptor.name).toBe("file.mdi");
  });

  it("should represent a browser file descriptor", () => {
    const mockHandle = createMockFileHandle("browser-file.mdi", "content");
    const descriptor: MdiFileDescriptor = {
      path: null,
      handle: mockHandle,
      name: "browser-file.mdi",
    };

    expect(descriptor.path).toBeNull();
    expect(descriptor.handle).toBe(mockHandle);
    expect(descriptor.name).toBe("browser-file.mdi");
  });
});

// -----------------------------------------------------------------------
// SaveMdiParams type contract tests
// -----------------------------------------------------------------------

describe("SaveMdiParams", () => {
  it("should accept minimal params (null descriptor, content only)", () => {
    const params: SaveMdiParams = {
      descriptor: null,
      content: "Hello, world!",
    };

    expect(params.descriptor).toBeNull();
    expect(params.content).toBe("Hello, world!");
    expect(params.fileType).toBeUndefined();
  });

  it("should accept all supported file types", () => {
    const mdiParams: SaveMdiParams = {
      descriptor: null,
      content: "content",
      fileType: ".mdi",
    };
    const mdParams: SaveMdiParams = {
      descriptor: null,
      content: "content",
      fileType: ".md",
    };
    const txtParams: SaveMdiParams = {
      descriptor: null,
      content: "content",
      fileType: ".txt",
    };

    expect(mdiParams.fileType).toBe(".mdi");
    expect(mdParams.fileType).toBe(".md");
    expect(txtParams.fileType).toBe(".txt");
  });
});
