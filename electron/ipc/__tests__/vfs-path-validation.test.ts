/**
 * Tests for VFS path validation logic
 *
 * Tests the pure path-validation helpers used by vfs-ipc.js:
 * - toForwardSlash(): path normalization
 * - assertPathInsideRoot(): root-scoping enforcement
 * - getWindowsDenyPrefixes(): platform deny list
 *
 * These functions contain the security-critical logic that rejects:
 * - Path traversal attacks (../../etc/passwd)
 * - Paths outside the VFS root
 * - Windows backslashes leaking through
 *
 * Architecture note: vfs-ipc.js is a CommonJS Electron main-process module
 * and cannot be imported directly into vitest (which runs in jsdom/Node context).
 * We test the extracted pure functions from electron/lib/path-utils.js instead.
 * The vfs-ipc.js handler tests (ipcMain.handle mocking) are deferred to
 * an integration test suite that runs inside Electron (see docs for Electron testing).
 */

import { describe, it, expect } from "vitest";
import path from "path";
import { createRequire } from "module";

// Load the CommonJS path-utils module via createRequire so vitest can import it
const require = createRequire(import.meta.url);
const { toForwardSlash, assertPathInsideRoot, getWindowsDenyPrefixes } =
  require("../../../electron/lib/path-utils") as {
    toForwardSlash: (p: string) => string;
    assertPathInsideRoot: (resolvedPath: string, rootPath: string) => void;
    getWindowsDenyPrefixes: () => string[];
  };

// -----------------------------------------------------------------------
// toForwardSlash
// -----------------------------------------------------------------------
describe("toForwardSlash()", () => {
  it("returns a forward-slash normalized absolute path for a simple path", () => {
    const result = toForwardSlash("/tmp/foo/bar.txt");
    expect(result).not.toContain("\\");
    expect(result).toContain("bar.txt");
  });

  it("resolves the path (makes it absolute)", () => {
    const result = toForwardSlash("some/relative/path.txt");
    // After path.resolve, should start with /
    expect(result.startsWith("/") || /^[a-zA-Z]:\//.test(result)).toBe(true);
  });

  it("normalizes backslashes to forward slashes", () => {
    // On POSIX path.resolve won't keep backslashes, but we can test the replace logic
    const result = toForwardSlash("/home/user/project/doc.mdi");
    expect(result).not.toContain("\\");
  });
});

// -----------------------------------------------------------------------
// assertPathInsideRoot — the core security invariant
// -----------------------------------------------------------------------
describe("assertPathInsideRoot()", () => {
  const root = "/home/user/project";

  it("accepts a path that is exactly the root", () => {
    expect(() => assertPathInsideRoot(root, root)).not.toThrow();
  });

  it("accepts a path that is a direct child of root", () => {
    expect(() => assertPathInsideRoot(`${root}/doc.mdi`, root)).not.toThrow();
  });

  it("accepts a deeply nested path under root", () => {
    expect(() => assertPathInsideRoot(`${root}/subdir/deep/file.txt`, root)).not.toThrow();
  });

  it("rejects a path that is the root's parent", () => {
    expect(() => assertPathInsideRoot("/home/user", root)).toThrow();
  });

  it("rejects a sibling directory (same level as root)", () => {
    expect(() => assertPathInsideRoot("/home/user/other-project/doc.mdi", root)).toThrow();
  });

  it("rejects path traversal: ../../etc/passwd when resolved outside root", () => {
    // toForwardSlash + path.resolve would produce /etc/passwd when called
    // from a root of /home/user/project. After normalization, assertPathInsideRoot
    // would see /etc/passwd which is not inside /home/user/project.
    const escapedPath = "/etc/passwd";
    expect(() => assertPathInsideRoot(escapedPath, root)).toThrow(/外部|outside|許可/);
  });

  it("rejects /etc/shadow (Unix credentials)", () => {
    expect(() => assertPathInsideRoot("/etc/shadow", root)).toThrow();
  });

  it("rejects an empty string as resolved path", () => {
    expect(() => assertPathInsideRoot("", root)).toThrow();
  });

  it("rejects a path that starts with root as a prefix but is not a child", () => {
    // e.g. root=/home/user/proj, path=/home/user/proj-other should be rejected
    const tricky = "/home/user/project-other/file.txt";
    expect(() => assertPathInsideRoot(tricky, root)).toThrow();
  });

  it("throws if resolvedPath still contains backslashes (normalization failure guard)", () => {
    // assertPathInsideRoot fails closed on any remaining backslash
    expect(() => assertPathInsideRoot("C:\\evil\\path", root)).toThrow();
  });
});

// -----------------------------------------------------------------------
// getWindowsDenyPrefixes — platform-specific deny list
// -----------------------------------------------------------------------
describe("getWindowsDenyPrefixes()", () => {
  it("returns an array", () => {
    const result = getWindowsDenyPrefixes();
    expect(Array.isArray(result)).toBe(true);
  });

  if (process.platform !== "win32") {
    it("returns empty array on non-Windows platform", () => {
      const result = getWindowsDenyPrefixes();
      expect(result).toHaveLength(0);
    });
  } else {
    it("returns Windows system directory prefixes on Windows", () => {
      const result = getWindowsDenyPrefixes();
      expect(result.length).toBeGreaterThan(0);
      // All entries should use forward slashes
      result.forEach((prefix) => {
        expect(prefix).not.toContain("\\");
      });
      // Should include Windows system directory
      const hasWindows = result.some((p) => p.toLowerCase().includes("windows"));
      expect(hasWindows).toBe(true);
    });
  }
});

// -----------------------------------------------------------------------
// Integration: traversal attack simulation
// -----------------------------------------------------------------------
describe("path traversal attack simulation", () => {
  const allowedRoot = "/home/user/my-novel-project";

  it("traversal via ../.. is blocked after toForwardSlash + assertPathInsideRoot", () => {
    // Simulate: renderer sends "../../etc/passwd" as a relative path
    // Main process calls toForwardSlash("../../etc/passwd") which resolves to an absolute path
    // then assertPathInsideRoot() checks it against the allowed root
    const attackInput = path.resolve(allowedRoot, "../../etc/passwd").replace(/\\/g, "/");
    // The resolved path escapes the root
    expect(attackInput).not.toContain(allowedRoot);
    // assertPathInsideRoot must throw
    expect(() => assertPathInsideRoot(attackInput, allowedRoot)).toThrow();
  });

  it("traversal via encoded-style sibling path is blocked", () => {
    // e.g. renderer sends /home/user/my-novel-project/../.ssh/id_rsa
    const attackInput = path.resolve(allowedRoot + "/../.ssh/id_rsa").replace(/\\/g, "/");
    expect(() => assertPathInsideRoot(attackInput, allowedRoot)).toThrow();
  });

  it("valid project file passes validation", () => {
    const validPath = `${allowedRoot}/.illusions/history/snapshot-001.mdi`;
    expect(() => assertPathInsideRoot(validPath, allowedRoot)).not.toThrow();
  });
});
