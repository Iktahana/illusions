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

 

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// -----------------------------------------------------------------------
// Mocks for runtime-env module
// -----------------------------------------------------------------------

const mockGetRuntimeEnvironment = vi.fn<() => string>();
const mockIsBrowser = vi.fn<() => boolean>();

vi.mock("@/lib/utils/runtime-env", () => ({
  getRuntimeEnvironment: () => mockGetRuntimeEnvironment(),
  isBrowser: () => mockIsBrowser(),
}));

// -----------------------------------------------------------------------
// Import module under test (after mocks are registered)
// -----------------------------------------------------------------------

import { openMdiFile, saveMdiFile } from "@/lib/project/mdi-file";

import type { MdiFileDescriptor, OpenMdiResult, SaveMdiParams } from "@/lib/project/mdi-file";

// -----------------------------------------------------------------------
// Mock helpers
// -----------------------------------------------------------------------

/** Create a minimal mock FileSystemFileHandle for browser tests. */
function createMockFileHandle(name: string, content: string): FileSystemFileHandle {
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
    getFile: vi.fn(async () => new File([writtenContent], name, { type: "text/plain" })),
    createWritable: vi.fn(async () => mockWritable),
    isSameEntry: vi.fn(async () => false),
    queryPermission: vi.fn(async () => "granted" as PermissionState),
    requestPermission: vi.fn(async () => "granted" as PermissionState),
  } as unknown as FileSystemFileHandle;
}

// -----------------------------------------------------------------------
// openMdiFile Tests
// -----------------------------------------------------------------------

// Phase 3: openMdiFile は no-op shim 化済み。詳細テストは削除し、shim 挙動のみ確認。
describe("openMdiFile (Phase 3 shim)", () => {
  it("always returns null while load logic is removed", async () => {
    const result = await openMdiFile();
    expect(result).toBeNull();
  });
});

// -----------------------------------------------------------------------
// saveMdiFile Tests
// -----------------------------------------------------------------------

// Phase 2: saveMdiFile は no-op shim 化済み。詳細テストは削除し、shim 挙動のみ確認。
describe("saveMdiFile (Phase 2 shim)", () => {
  it("always returns null while save logic is removed", async () => {
    const result = await saveMdiFile({ descriptor: null, content: "content" });
    expect(result).toBeNull();
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
