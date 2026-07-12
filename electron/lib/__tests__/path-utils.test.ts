import { afterEach, describe, expect, it, vi } from "vitest";
import fsSync from "fs";
import os from "os";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const {
  normalizeForCompare,
  toForwardSlash,
  assertPathInsideRoot,
  getWindowsDenyPrefixes,
  resolveRealPath,
} = require("../../../electron/lib/path-utils") as {
  normalizeForCompare: (p: string) => string;
  toForwardSlash: (p: string, pathImpl?: typeof path) => string;
  assertPathInsideRoot: (resolvedPath: string, rootPath: string) => void;
  getWindowsDenyPrefixes: () => string[];
  resolveRealPath: (p: string) => Promise<string>;
};

function withPlatform<T>(platform: NodeJS.Platform, fn: () => T): T {
  const original = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", { configurable: true, value: platform });
  try {
    return fn();
  } finally {
    if (original) Object.defineProperty(process, "platform", original);
  }
}

describe("electron/lib/path-utils", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("normalizeForCompare folds NFC/NFD and path cruft", () => {
    const nfc = "ガ";
    const nfd = "ガ";
    expect(normalizeForCompare(`\\Users\\me\\${nfd}\\\\`)).toBe(`/Users/me/${nfc}`);
  });

  it("normalizeForCompare folds Windows drive and UNC case only on win32", () => {
    withPlatform("win32", () => {
      expect(normalizeForCompare("C:\\Users\\Me\\Project\\")).toBe("c:/users/me/project");
      expect(normalizeForCompare("\\\\SERVER\\Share\\Project\\")).toBe("//server/share/project");
    });

    withPlatform("darwin", () => {
      expect(normalizeForCompare("C:\\Users\\Me\\Project\\")).toBe("C:/Users/Me/Project");
    });
  });

  it("toForwardSlash uses explicit path.win32 drive and UNC semantics", () => {
    expect(toForwardSlash("C:\\Users\\Me\\Project\\..\\File.mdi", path.win32)).toBe(
      "C:/Users/Me/File.mdi",
    );
    expect(toForwardSlash("\\\\server\\share\\Project\\file.mdi", path.win32)).toBe(
      "//server/share/Project/file.mdi",
    );
  });

  it("toForwardSlash strips Windows extended path prefixes", () => {
    expect(toForwardSlash("\\\\?\\C:\\Users\\Me\\Project\\file.mdi", path.win32)).toBe(
      "C:/Users/Me/Project/file.mdi",
    );
    expect(toForwardSlash("\\\\?\\UNC\\server\\share\\Project\\file.mdi", path.win32)).toBe(
      "//server/share/Project/file.mdi",
    );
  });

  it("toForwardSlash uses explicit path.posix semantics independent of runner OS", () => {
    expect(toForwardSlash("/Users/me/project/../file.mdi", path.posix)).toBe("/Users/me/file.mdi");
  });

  it("assertPathInsideRoot handles Windows case-insensitive drive and UNC containment", () => {
    withPlatform("win32", () => {
      expect(() =>
        assertPathInsideRoot("c:/users/me/project/Chapter.mdi", "C:/Users/Me/Project"),
      ).not.toThrow();
      expect(() =>
        assertPathInsideRoot("C:/Users/Me/Project-Other/Chapter.mdi", "C:/Users/Me/Project"),
      ).toThrow();
      expect(() =>
        assertPathInsideRoot("//SERVER/Share/Project/chapter.mdi", "//server/share/project"),
      ).not.toThrow();
      expect(() =>
        assertPathInsideRoot("//server/share/project2/chapter.mdi", "//server/share/project"),
      ).toThrow();
    });
  });

  it("getWindowsDenyPrefixes is platform-gated and uses SystemRoot drive", () => {
    withPlatform("darwin", () => {
      expect(getWindowsDenyPrefixes()).toEqual([]);
    });

    vi.stubEnv("SystemRoot", "D:\\Windows");
    withPlatform("win32", () => {
      expect(getWindowsDenyPrefixes()).toEqual([
        "D:/Windows",
        "D:/Program Files",
        "D:/Program Files (x86)",
        "D:/ProgramData",
      ]);
    });
  });

  it("getWindowsDenyPrefixes defaults to C:\\Windows when SystemRoot is missing", () => {
    const original = process.env.SystemRoot;
    try {
      delete process.env.SystemRoot;
      withPlatform("win32", () => {
        expect(getWindowsDenyPrefixes()[0]).toBe("C:/Windows");
      });
    } finally {
      if (original === undefined) delete process.env.SystemRoot;
      else process.env.SystemRoot = original;
    }
  });

  it("resolveRealPath resolves existing ancestors and rejoins a missing tail", async () => {
    const tmpBase = fsSync.realpathSync(os.tmpdir());
    const root = fsSync.mkdtempSync(path.join(tmpBase, "path-utils-realpath-"));
    try {
      fsSync.mkdirSync(path.join(root, "existing"), { recursive: true });
      const target = path.join(root, "existing", "new", "file.mdi");

      const resolved = await resolveRealPath(target);

      expect(toForwardSlash(resolved).toLowerCase()).toMatch(/\/existing\/new\/file\.mdi$/);
    } finally {
      fsSync.rmSync(root, { recursive: true, force: true });
    }
  });
});
