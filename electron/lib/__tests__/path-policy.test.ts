/**
 * Tests for the shared path-security policy (#1435).
 *
 * isSensitiveSystemPath() is the single source of truth behind:
 * - file-ipc.js  isSavePathDenied()  — base policy, no extras
 * - vfs-ipc.js   isDeniedPath()      — base policy + Windows credential extras
 *
 * These tests pin the deny/allow behavior that both modules relied on before
 * the extraction, so policy drift between the two IPC boundaries is caught here.
 */

import os from "os";
import { describe, it, expect } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { isSensitiveSystemPath, MAX_CONTENT_BYTES, SYSTEM_DENY_PREFIXES, HOME_SENSITIVE_SUFFIXES } =
  require("../../../electron/lib/path-policy") as {
    isSensitiveSystemPath: (
      normalizedPath: string,
      options?: { extraHomeSensitiveSuffixes?: readonly string[] },
    ) => boolean;
    MAX_CONTENT_BYTES: number;
    SYSTEM_DENY_PREFIXES: readonly string[];
    HOME_SENSITIVE_SUFFIXES: readonly string[];
  };

const { normalizeSeparators, trimTrailingSlashes } =
  require("../../../electron/lib/path-utils") as {
    normalizeSeparators: (p: string) => string;
    trimTrailingSlashes: (p: string) => string;
  };

const home = trimTrailingSlashes(normalizeSeparators(os.homedir()));

// Same extras as vfs-ipc.js — duplicated here on purpose so a silent change
// to the vfs extras would not silently change these expectations.
const VFS_EXTRAS = [
  "/AppData/Roaming/Microsoft/Credentials",
  "/AppData/Roaming/Microsoft/Protect",
  "/AppData/Local/Microsoft/Credentials",
] as const;

describe("MAX_CONTENT_BYTES", () => {
  it("is the historical 50 MB limit shared by file-ipc and vfs-ipc", () => {
    expect(MAX_CONTENT_BYTES).toBe(50 * 1024 * 1024);
  });
});

describe("isSensitiveSystemPath() — system roots", () => {
  it("denies the filesystem root and every listed system directory", () => {
    for (const dir of SYSTEM_DENY_PREFIXES) {
      expect(isSensitiveSystemPath(dir)).toBe(true);
    }
  });

  it("denies nested paths under system directories", () => {
    expect(isSensitiveSystemPath("/etc/passwd")).toBe(true);
    expect(isSensitiveSystemPath("/usr/local/bin/evil")).toBe(true);
    expect(isSensitiveSystemPath("/private/etc/hosts")).toBe(true);
    expect(isSensitiveSystemPath("/tmp/anything.mdi")).toBe(true);
  });

  it("denies bare Windows drive roots (C: and C:/)", () => {
    expect(isSensitiveSystemPath("C:")).toBe(true);
    expect(isSensitiveSystemPath("C:/")).toBe(true);
    expect(isSensitiveSystemPath("d:/")).toBe(true);
  });

  it("does not deny a sibling whose name merely starts with a denied dir", () => {
    // "/etc" is denied as a prefix-with-slash, not as a string prefix
    expect(isSensitiveSystemPath("/etcetera/file.txt")).toBe(false);
  });
});

describe("isSensitiveSystemPath() — home directory rules", () => {
  it("denies the home directory itself", () => {
    expect(isSensitiveSystemPath(home)).toBe(true);
  });

  it("allows ordinary documents inside home", () => {
    expect(isSensitiveSystemPath(`${home}/Documents/novel.mdi`)).toBe(false);
    expect(isSensitiveSystemPath(`${home}/Desktop/draft.md`)).toBe(false);
  });

  it("denies every base sensitive directory under home (and nested paths)", () => {
    for (const suffix of HOME_SENSITIVE_SUFFIXES) {
      expect(isSensitiveSystemPath(`${home}${suffix}`)).toBe(true);
      expect(isSensitiveSystemPath(`${home}${suffix}/nested/file`)).toBe(true);
    }
  });

  it("includes the historical base suffixes used by both IPC modules", () => {
    expect(HOME_SENSITIVE_SUFFIXES).toEqual([
      "/.ssh",
      "/.gnupg",
      "/.aws",
      "/.kube",
      "/.docker",
      "/.config/gcloud",
      "/Library/Keychains",
    ]);
  });
});

describe("isSensitiveSystemPath() — caller-specific extras (vfs-ipc difference)", () => {
  it("base policy (file-ipc) allows Windows credential paths under home", () => {
    // Intentional difference: save-file writes are gated by dialog approval +
    // extension allowlist, so the base policy does not include these.
    expect(isSensitiveSystemPath(`${home}/AppData/Roaming/Microsoft/Credentials/x`)).toBe(false);
  });

  it("vfs extras deny Windows credential stores under home", () => {
    for (const extra of VFS_EXTRAS) {
      expect(
        isSensitiveSystemPath(`${home}${extra}/blob`, {
          extraHomeSensitiveSuffixes: VFS_EXTRAS,
        }),
      ).toBe(true);
    }
  });

  it("extras do not affect unrelated home paths", () => {
    expect(
      isSensitiveSystemPath(`${home}/AppData/Roaming/illusions/config.json`, {
        extraHomeSensitiveSuffixes: VFS_EXTRAS,
      }),
    ).toBe(false);
  });
});

describe("normalizeSeparators() / trimTrailingSlashes()", () => {
  it("normalizeSeparators converts backslashes and keeps trailing slashes", () => {
    expect(normalizeSeparators("C:\\Users\\me\\doc.mdi")).toBe("C:/Users/me/doc.mdi");
    expect(normalizeSeparators("/foo/bar/")).toBe("/foo/bar/");
  });

  it("trimTrailingSlashes removes trailing slashes only", () => {
    expect(trimTrailingSlashes("/foo/bar//")).toBe("/foo/bar");
    expect(trimTrailingSlashes("/foo/bar")).toBe("/foo/bar");
  });

  it("documents the bare-root edge: trimming '/' yields '' (vfs-ipc historical behavior)", () => {
    expect(trimTrailingSlashes("/")).toBe("");
  });
});
