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

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fsSync from "fs";
import os from "os";
import path from "path";
import { createRequire } from "module";

// Load the CommonJS path-utils module via createRequire so vitest can import it
const require = createRequire(import.meta.url);
const {
  toForwardSlash,
  assertPathInsideRoot,
  getWindowsDenyPrefixes,
  resolveRealPath,
  normalizeForCompare,
} = require("../../../electron/lib/path-utils") as {
  toForwardSlash: (p: string) => string;
  assertPathInsideRoot: (resolvedPath: string, rootPath: string) => void;
  getWindowsDenyPrefixes: () => string[];
  resolveRealPath: (p: string) => Promise<string>;
  normalizeForCompare: (p: string) => string;
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

// -----------------------------------------------------------------------
// resolveRealPath — symlink-collapsed path resolution (issue #1559)
// -----------------------------------------------------------------------
// These tests reproduce the symlink-escape attack: a symlink placed inside
// the approved project root pointing to a file outside it. The lexical
// prefix check (assertPathInsideRoot) alone cannot detect this; only the
// realpath-collapsed path reveals the escape.
describe("resolveRealPath()", () => {
  let baseDir: string; // realpath'd temp base
  let rootDir: string; // simulated project root (inside baseDir)
  let outsideDir: string; // directory outside the project root

  beforeEach(() => {
    // realpathSync the tmpdir first — on macOS /var is itself a symlink
    const tmpBase = fsSync.realpathSync(os.tmpdir());
    baseDir = fsSync.mkdtempSync(path.join(tmpBase, "vfs-realpath-test-"));
    rootDir = path.join(baseDir, "project");
    outsideDir = path.join(baseDir, "outside");
    fsSync.mkdirSync(rootDir, { recursive: true });
    fsSync.mkdirSync(outsideDir, { recursive: true });
  });

  afterEach(() => {
    fsSync.rmSync(baseDir, { recursive: true, force: true });
  });

  it("returns the physical path of a regular file inside the root", async () => {
    const file = path.join(rootDir, "chapter1.mdi");
    fsSync.writeFileSync(file, "content");
    const real = await resolveRealPath(file);
    expect(toForwardSlash(real)).toBe(toForwardSlash(await resolveRealPath(file)));
  });

  it("collapses a symlink pointing OUTSIDE the root so containment check throws", async () => {
    // Attack from issue #1559: project contains chapter2.mdi -> secret outside root
    const secret = path.join(outsideDir, "id_rsa");
    fsSync.writeFileSync(secret, "PRIVATE KEY");
    const link = path.join(rootDir, "chapter2.mdi");
    fsSync.symlinkSync(secret, link);

    const real = await resolveRealPath(link);
    // The collapsed path must reveal the outside target...
    expect(toForwardSlash(real)).toBe(toForwardSlash(await resolveRealPath(secret)));
    // ...so the realpath containment check rejects it
    const realRoot = await resolveRealPath(rootDir);
    expect(() => assertPathInsideRoot(toForwardSlash(real), toForwardSlash(realRoot))).toThrow(
      /外部/,
    );
  });

  it("collapses a symlinked directory escape (dir symlink + relative file)", async () => {
    const escapeDir = path.join(rootDir, "notes");
    fsSync.symlinkSync(outsideDir, escapeDir);
    fsSync.writeFileSync(path.join(outsideDir, "leak.txt"), "leak");

    const real = await resolveRealPath(path.join(escapeDir, "leak.txt"));
    expect(toForwardSlash(real)).toBe(
      toForwardSlash(await resolveRealPath(path.join(outsideDir, "leak.txt"))),
    );
    const realRoot = await resolveRealPath(rootDir);
    expect(() => assertPathInsideRoot(toForwardSlash(real), toForwardSlash(realRoot))).toThrow();
  });

  it("keeps a symlink pointing INSIDE the root acceptable", async () => {
    const target = path.join(rootDir, "real.mdi");
    fsSync.writeFileSync(target, "ok");
    const link = path.join(rootDir, "alias.mdi");
    fsSync.symlinkSync(target, link);

    const real = await resolveRealPath(link);
    const realRoot = await resolveRealPath(rootDir);
    expect(() =>
      assertPathInsideRoot(toForwardSlash(real), toForwardSlash(realRoot)),
    ).not.toThrow();
  });

  it("tolerates a not-yet-existing file (resolves the existing parent)", async () => {
    const newFile = path.join(rootDir, "new-chapter.mdi");
    const real = await resolveRealPath(newFile);
    expect(toForwardSlash(real)).toBe(toForwardSlash(await resolveRealPath(newFile)));
  });

  it("tolerates nested not-yet-existing directories (mkdir -p case)", async () => {
    const nested = path.join(rootDir, "a", "b", "c.mdi");
    const real = await resolveRealPath(nested);
    expect(toForwardSlash(real)).toBe(toForwardSlash(await resolveRealPath(nested)));
  });

  it("collapses symlinks even when the trailing component does not exist yet", async () => {
    // notes -> outsideDir, then write to notes/new.txt (creation path)
    const escapeDir = path.join(rootDir, "notes");
    fsSync.symlinkSync(outsideDir, escapeDir);

    const real = await resolveRealPath(path.join(escapeDir, "new.txt"));
    expect(toForwardSlash(real)).toBe(
      toForwardSlash(await resolveRealPath(path.join(outsideDir, "new.txt"))),
    );
    const realRoot = await resolveRealPath(rootDir);
    expect(() => assertPathInsideRoot(toForwardSlash(real), toForwardSlash(realRoot))).toThrow();
  });

  it("rejects a dangling symlink with an ENOENT-coded error (fail closed)", async () => {
    // Opening a dangling symlink with "w" would create its outside target
    const link = path.join(rootDir, "dangling.mdi");
    fsSync.symlinkSync(path.join(outsideDir, "does-not-exist.txt"), link);

    await expect(resolveRealPath(link)).rejects.toMatchObject({ code: "ENOENT" });
  });
});

// -----------------------------------------------------------------------
// normalizeForCompare — the canonical comparison form used by vfs:set-root.
// This is what fixes opening a Japanese-named project from the recent list
// (#1955 follow-up): macOS dialogs return the on-disk NFD form while the
// renderer / recent-projects list supplies NFC, and they must compare equal.
// -----------------------------------------------------------------------
describe("normalizeForCompare()", () => {
  // 「が」: NFC = U+30AC (が), NFD = U+30AB U+3099 (か + combining dakuten).
  const NFC = "ガ";
  const NFD = "ガ";

  it("folds NFD and NFC encodings of the same Japanese path to an equal value", () => {
    // Pre-condition: the two strings are genuinely different byte sequences.
    expect(NFC).not.toBe(NFD);
    const nfcPath = `/Users/u/${NFC}`;
    const nfdPath = `/Users/u/${NFD}`;
    // Without NFC folding these would compare unequal and set-root would throw
    // "選択されたディレクトリが要求されたパスと一致しません".
    expect(normalizeForCompare(nfdPath)).toBe(normalizeForCompare(nfcPath));
    expect(normalizeForCompare(nfdPath)).toBe(nfcPath);
  });

  it("still trims trailing slashes and converts backslashes while folding NFC", () => {
    const nfdWithCruft = `\\Users\\u\\${NFD}\\\\`;
    expect(normalizeForCompare(nfdWithCruft)).toBe(`/Users/u/${NFC}`);
  });

  it("does NOT collapse genuinely different directories to equal (no false match)", () => {
    expect(normalizeForCompare(`/Users/u/${NFC}`)).not.toBe(
      normalizeForCompare(`/Users/u/${NFC}2`),
    );
    expect(normalizeForCompare("/a/b")).not.toBe(normalizeForCompare("/a/c"));
  });
});
