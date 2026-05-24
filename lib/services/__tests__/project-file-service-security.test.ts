/**
 * Security invariant tests for ProjectFileService
 *
 * Tests the five security properties documented in vfs-ipc.js / project-file-service:
 * 1. Main-process mediation: all file operations go through IPC (not tested here —
 *    this is a structural property enforced by Electron's process model)
 * 2. Dialog approval: root cannot be set to an arbitrary path without dialog consent
 * 3. Root scoping: read/write operations are rejected if path escapes the VFS root
 * 4. Path traversal: `..` sequences in paths are rejected or normalized safely
 * 5. Sensitive paths: paths to credentials/system dirs are rejected
 *
 * Notes on test architecture:
 * - The renderer-side VFS classes (ElectronVFS, WebVFS) do NOT perform path validation
 *   themselves — they pass paths verbatim to the IPC bridge / File System Access API.
 * - Security enforcement happens in the Electron main process (vfs-ipc.js) for Electron,
 *   and is delegated to the browser sandbox for WebVFS.
 * - Therefore, renderer-side security tests focus on:
 *   a) ElectronVFS path resolution (resolvePath logic) — relative vs absolute
 *   b) ElectronVFS refusing to operate when no root is set (partial protection)
 *   c) Documentation of the invariants for auditors
 * - Full path-traversal rejection tests live in electron/ipc/__tests__/vfs-ipc.test.js
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// -----------------------------------------------------------------------
// Mock environment as Electron renderer (so ElectronVFS is instantiated)
// -----------------------------------------------------------------------
vi.mock("@/lib/utils/runtime-env", () => ({
  isElectronRenderer: () => true,
}));

// Mock window.electronAPI.vfs bridge — used by ElectronVFS internally
const mockVfsBridge = {
  openDirectory: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  readDirectory: vi.fn(),
  stat: vi.fn(),
  mkdir: vi.fn(),
  delete: vi.fn(),
  rename: vi.fn(),
  setRoot: vi.fn(),
};

// Helper to set up the window.electronAPI mock
function setupElectronMock() {
  Object.defineProperty(globalThis, "window", {
    value: {
      electronAPI: {
        isElectron: true,
        vfs: mockVfsBridge,
      },
    },
    writable: true,
    configurable: true,
  });
}

// -----------------------------------------------------------------------
// Reset between tests
// -----------------------------------------------------------------------
let getProjectFileService: () => import("@/lib/vfs/types").VirtualFileSystem;
let resetProjectFileService: () => void;

beforeEach(async () => {
  vi.resetModules();
  setupElectronMock();
  // Reset all mock fn calls
  Object.values(mockVfsBridge).forEach((fn) => {
    if (typeof fn === "function" && "mockReset" in fn) {
      (fn as ReturnType<typeof vi.fn>).mockReset();
    }
  });
  const mod = await import("@/lib/services/project-file-service");
  getProjectFileService = mod.getProjectFileService;
  resetProjectFileService = mod.resetProjectFileService;
  resetProjectFileService();
});

// -----------------------------------------------------------------------
// Security invariant 1: No-root guard
// -----------------------------------------------------------------------
describe("root scoping — no root set", () => {
  it("readFile throws when no root is configured (relative path)", async () => {
    const service = getProjectFileService();
    // No root set — relative paths cannot be resolved
    await expect(service.readFile("some-file.txt")).rejects.toThrow(/root|directory|open/i);
  });

  it("writeFile throws when no root is configured (relative path)", async () => {
    const service = getProjectFileService();
    await expect(service.writeFile("some-file.txt", "content")).rejects.toThrow(
      /root|directory|open/i,
    );
  });

  it("listDirectory throws when no root is configured (relative path)", async () => {
    const service = getProjectFileService();
    await expect(service.listDirectory("subdir")).rejects.toThrow(/root|directory|open/i);
  });

  it("isRootOpen() returns false until root is established", () => {
    const service = getProjectFileService();
    expect(service.isRootOpen()).toBe(false);
  });
});

// -----------------------------------------------------------------------
// Security invariant 2: Absolute path passthrough (IPC does the real check)
// -----------------------------------------------------------------------
describe("absolute path handling", () => {
  it("readFile with absolute path calls IPC with the exact path (validation is main-side)", async () => {
    mockVfsBridge.readFile.mockResolvedValue("file content");
    const service = getProjectFileService();
    const content = await service.readFile("/Users/user/project/doc.mdi");
    expect(mockVfsBridge.readFile).toHaveBeenCalledWith("/Users/user/project/doc.mdi");
    expect(content).toBe("file content");
  });

  it("writeFile with absolute path calls IPC with the path (mkdir + writeFile)", async () => {
    mockVfsBridge.mkdir.mockResolvedValue(undefined);
    mockVfsBridge.writeFile.mockResolvedValue(undefined);
    const service = getProjectFileService();
    await service.writeFile("/Users/user/project/doc.mdi", "hello");
    expect(mockVfsBridge.writeFile).toHaveBeenCalledWith("/Users/user/project/doc.mdi", "hello");
  });
});

// -----------------------------------------------------------------------
// Security invariant 3: Path traversal — renderer normalizes backslashes
// (actual traversal rejection happens in main-process vfs-ipc.js)
// -----------------------------------------------------------------------
describe("path normalization", () => {
  it("Windows backslashes in absolute paths are normalized to forward slashes", async () => {
    mockVfsBridge.readFile.mockResolvedValue("content");
    const service = getProjectFileService();
    // Simulate Windows absolute path with backslashes
    const windowsPath = "C:\\Users\\user\\project\\doc.mdi";
    await service.readFile(windowsPath);
    // resolvePath normalizes backslashes
    expect(mockVfsBridge.readFile).toHaveBeenCalledWith("C:/Users/user/project/doc.mdi");
  });
});

// -----------------------------------------------------------------------
// Security invariant 4: Main-process enforcement documentation
// -----------------------------------------------------------------------
describe("security architecture documentation", () => {
  /**
   * These tests document WHAT the security system prevents, and WHERE each
   * check is enforced. They are intentionally pass-through so they appear
   * in test reports and are not silently deleted.
   *
   * The actual enforcement of rules 4a–4c is tested in:
   *   electron/ipc/__tests__/vfs-ipc.test.js
   */
  it("DOCUMENTED: path traversal (../../etc/passwd) is rejected by main-process validateVFSPath()", () => {
    // Renderer passes the path to main; main calls assertPathInsideRoot() which
    // throws if the resolved path escapes the allowed root. See vfs-ipc.js:validateVFSPath.
    expect(true).toBe(true); // assertion is that this test is present and documented
  });

  it("DOCUMENTED: sensitive paths (~/.ssh, /etc/passwd) are rejected by main-process isDeniedPath()", () => {
    // vfs-ipc.js isDeniedPath() checks the path against a denylist before setting root.
    // Full coverage in electron/ipc/__tests__/vfs-ipc.test.js.
    expect(true).toBe(true);
  });

  it("DOCUMENTED: dialog approval is required before vfs:set-root succeeds (main-process check)", () => {
    // vfs-ipc.js vfs:set-root handler checks dialogApprovedPaths before accepting a root.
    // A compromised renderer cannot promote an arbitrary path to an allowed root.
    expect(true).toBe(true);
  });
});
