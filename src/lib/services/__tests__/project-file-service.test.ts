/**
 * Tests for ProjectFileService
 *
 * Covers:
 * - Singleton stability: getProjectFileService() returns the same instance
 * - Reset: resetProjectFileService() clears the singleton
 * - Contract: the returned instance satisfies the VirtualFileSystem interface
 * - Integration: getProjectFileService() and getVFS() return the same singleton
 *   (since ProjectFileService is a thin alias over VFS in Phase 7)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// -----------------------------------------------------------------------
// Mock the runtime-env detection so we always get a predictable backend
// -----------------------------------------------------------------------
vi.mock("@/lib/utils/runtime-env", () => ({
  isElectronRenderer: () => false, // Force WebVFS path (no IPC needed)
}));

// -----------------------------------------------------------------------
// Reset singleton state before each test
// -----------------------------------------------------------------------
let resetProjectFileService: () => void;
let getProjectFileService: () => import("@/lib/vfs/types").VirtualFileSystem;
let resetVFS: () => void;
let getVFS: () => import("@/lib/vfs/types").VirtualFileSystem;

beforeEach(async () => {
  // Dynamic import so mocks are applied first
  vi.resetModules();
  const serviceModule = await import("@/lib/services/project-file-service");
  const vfsModule = await import("@/lib/vfs");
  getProjectFileService = serviceModule.getProjectFileService;
  resetProjectFileService = serviceModule.resetProjectFileService;
  getVFS = vfsModule.getVFS;
  resetVFS = vfsModule.resetVFS;
  // Reset both singletons before each test
  resetProjectFileService();
  resetVFS();
});

describe("getProjectFileService()", () => {
  it("returns a non-null object", () => {
    const service = getProjectFileService();
    expect(service).toBeDefined();
    expect(service).not.toBeNull();
    expect(typeof service).toBe("object");
  });

  it("returns the same instance on repeated calls (singleton)", () => {
    const a = getProjectFileService();
    const b = getProjectFileService();
    expect(a).toBe(b);
  });

  it("satisfies the VirtualFileSystem contract (has all required methods)", () => {
    const service = getProjectFileService();
    // Core IO methods
    expect(typeof service.openDirectory).toBe("function");
    expect(typeof service.getDirectoryHandle).toBe("function");
    expect(typeof service.readFile).toBe("function");
    expect(typeof service.writeFile).toBe("function");
    expect(typeof service.deleteFile).toBe("function");
    expect(typeof service.rename).toBe("function");
    expect(typeof service.getFileMetadata).toBe("function");
    expect(typeof service.listDirectory).toBe("function");
    // State inspection
    expect(typeof service.getRootPath).toBe("function");
    expect(typeof service.isRootOpen).toBe("function");
  });

  it("isRootOpen() returns false before any directory is opened", () => {
    const service = getProjectFileService();
    expect(service.isRootOpen()).toBe(false);
  });

  it("getRootPath() returns null before any directory is opened", () => {
    const service = getProjectFileService();
    // getRootPath is optional in the interface; the concrete implementations always provide it
    expect(service.getRootPath?.()).toBeNull();
  });
});

describe("resetProjectFileService()", () => {
  it("causes the next call to getProjectFileService() to return a new instance", () => {
    const a = getProjectFileService();
    resetProjectFileService();
    const b = getProjectFileService();
    // After reset, a new instance is created
    expect(a).not.toBe(b);
  });

  it("is idempotent (calling twice does not throw)", () => {
    expect(() => {
      resetProjectFileService();
      resetProjectFileService();
    }).not.toThrow();
  });
});

describe("getProjectFileService() vs getVFS() singleton identity", () => {
  it("both functions return the same singleton instance", () => {
    // getProjectFileService is a thin alias over getVFS; they must share
    // the same underlying instance so callers that mix old/new API work correctly.
    const fromService = getProjectFileService();
    const fromVFS = getVFS();
    expect(fromService).toBe(fromVFS);
  });

  it("resetProjectFileService() also resets the VFS singleton", () => {
    const vfsBefore = getVFS();
    resetProjectFileService();
    const vfsAfter = getVFS();
    expect(vfsBefore).not.toBe(vfsAfter);
  });
});
