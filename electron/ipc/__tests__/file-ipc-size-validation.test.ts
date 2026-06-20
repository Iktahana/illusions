/**
 * Tests for file-ipc content size validation
 *
 * Verifies that the 50 MB limit is enforced using Buffer.byteLength (UTF-8 byte
 * count) rather than String.prototype.length (UTF-16 code unit count).
 *
 * The bug (pre-fix): content.length was compared against MAX_CONTENT_BYTES.
 * BMP CJK characters (the vast majority of Japanese text, e.g. U+4E00) occupy
 * 3 bytes in UTF-8 but only 1 code unit in .length — some supplementary-plane
 * CJK code points even take 4 bytes — so a 150 MB Japanese manuscript was
 * allowed through as if it were 50 MB. These tests use the 3-byte BMP case.
 *
 * Architecture note: file-ipc.js is a CommonJS Electron main-process module and
 * cannot be imported directly into vitest. These tests validate the invariant that
 * must hold in file-ipc.js — that Buffer.byteLength is the correct measurement —
 * and serve as a regression guard for the fix applied at lines 304, 446, 592, 648.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const MAX_CONTENT_BYTES = 50 * 1024 * 1024; // 50 MB, matches file-ipc.js

/**
 * Reference implementation of the corrected size check used in file-ipc.js.
 * Returns true when content exceeds the limit.
 */
function isContentTooLarge(content: string): boolean {
  return Buffer.byteLength(content, "utf-8") > MAX_CONTENT_BYTES;
}

/**
 * Pre-fix (buggy) implementation for comparison.
 */
function isContentTooLargeByLength(content: string): boolean {
  return content.length > MAX_CONTENT_BYTES;
}

// -----------------------------------------------------------------------
// Core invariant: Buffer.byteLength vs .length for CJK text
// -----------------------------------------------------------------------
describe("content size validation — Buffer.byteLength vs .length", () => {
  it("Buffer.byteLength equals .length for ASCII-only text", () => {
    const ascii = "a".repeat(100);
    expect(Buffer.byteLength(ascii, "utf-8")).toBe(ascii.length);
  });

  it("Buffer.byteLength is 3× .length for 3-byte CJK characters", () => {
    // U+4E00 (一) is a typical 3-byte CJK character in UTF-8
    const cjk = "一".repeat(100);
    expect(Buffer.byteLength(cjk, "utf-8")).toBe(cjk.length * 3);
  });

  it("CJK string whose byte length exceeds 50 MB is rejected by Buffer.byteLength", () => {
    // Craft a string where byteLength > 50 MB but .length < 50 MB
    // One CJK char = 3 bytes, so ceil(50MB/3) + 1 chars is just over 50 MB
    const overLimitBytes = MAX_CONTENT_BYTES + 3; // 3 extra bytes = 1 extra CJK char
    const charCount = Math.ceil(overLimitBytes / 3);
    const cjkOver = "一".repeat(charCount);

    // String .length is about 16.7 million — well under 50 MB
    expect(cjkOver.length).toBeLessThan(MAX_CONTENT_BYTES);
    // But byte length exceeds 50 MB
    expect(Buffer.byteLength(cjkOver, "utf-8")).toBeGreaterThan(MAX_CONTENT_BYTES);

    // The correct check (post-fix) rejects this content
    expect(isContentTooLarge(cjkOver)).toBe(true);
    // The buggy check (pre-fix) would have passed it through — regression guard
    expect(isContentTooLargeByLength(cjkOver)).toBe(false);
  });

  it("ASCII string just over 50 MB is rejected by both implementations", () => {
    // For ASCII, both checks behave identically — ensure we didn't break that
    const asciiOver = "a".repeat(MAX_CONTENT_BYTES + 1);
    expect(isContentTooLarge(asciiOver)).toBe(true);
    expect(isContentTooLargeByLength(asciiOver)).toBe(true);
  });

  it("CJK string whose byte length is exactly at the limit is allowed", () => {
    // Exactly MAX_CONTENT_BYTES / 3 CJK chars = exactly 50 MB UTF-8
    const exactChars = Math.floor(MAX_CONTENT_BYTES / 3);
    const cjkExact = "一".repeat(exactChars);
    expect(Buffer.byteLength(cjkExact, "utf-8")).toBeLessThanOrEqual(MAX_CONTENT_BYTES);
    expect(isContentTooLarge(cjkExact)).toBe(false);
  });

  it("mixed ASCII and CJK content is measured by byte length", () => {
    // 10 MB of ASCII + 14 MB of CJK (each CJK char = 3 bytes, so ~4.67M chars)
    const asciiPart = "a".repeat(10 * 1024 * 1024); // 10 MB
    const cjkPart = "一".repeat(Math.ceil((14 * 1024 * 1024) / 3)); // ~14 MB in UTF-8
    const mixed = asciiPart + cjkPart;

    const byteLen = Buffer.byteLength(mixed, "utf-8");
    expect(byteLen).toBeLessThanOrEqual(MAX_CONTENT_BYTES);
    expect(isContentTooLarge(mixed)).toBe(false);
  });
});

// -----------------------------------------------------------------------
// UTF-8 BOM stripping (#1842)
//
// fs.readFile(path, "utf-8") does NOT strip a leading UTF-8 BOM (U+FEFF).
// The .txt read path (readTextWithEncoding in text-codec.ts) strips it.
// file-ipc.js must do the same for .mdi reads via its local stripBom() helper.
//
// file-ipc.js is a CommonJS Electron main-process module and cannot be
// imported directly in vitest, so:
//   1. The stripBom() logic is re-implemented here as a pure unit and tested
//      against BOM/non-BOM inputs.
//   2. A source-text regression guard verifies the helper is present and
//      applied at every fs.readFile call site in the file.
// -----------------------------------------------------------------------

/** Mirror of the stripBom() helper in file-ipc.js */
function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

describe("UTF-8 BOM stripping — stripBom() invariants", () => {
  it("strips a leading BOM from a string that has one", () => {
    const withBom = "﻿hello";
    expect(stripBom(withBom)).toBe("hello");
  });

  it("does not modify a string without a BOM", () => {
    const noBom = "hello";
    expect(stripBom(noBom)).toBe("hello");
  });

  it("strips only the leading BOM, not BOMs elsewhere", () => {
    const midBom = "abc﻿def";
    expect(stripBom(midBom)).toBe("abc﻿def");
  });

  it("returns an empty string unchanged", () => {
    expect(stripBom("")).toBe("");
  });

  it("strips BOM from a realistic .mdi snippet", () => {
    const content = "﻿# 吾輩は猫である\n\n吾輩は猫である。";
    const result = stripBom(content);
    expect(result.startsWith("#")).toBe(true);
    expect(result.charCodeAt(0)).not.toBe(0xfeff);
  });
});

// -----------------------------------------------------------------------
// Source-based regression guard: file-ipc.js cannot be imported in vitest
// (CommonJS Electron main-process module), so assert on its source text that
// every MAX_CONTENT_BYTES comparison measures UTF-8 bytes, not code units.
// -----------------------------------------------------------------------
describe("file-ipc.js source regression guard", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(path.resolve(here, "../file-ipc.js"), "utf-8");

  it("uses Buffer.byteLength for every MAX_CONTENT_BYTES comparison", () => {
    const comparisons = source.match(/[^\n]*>\s*MAX_CONTENT_BYTES[^\n]*/g) ?? [];
    // The fix covered 4 call sites; new ones must follow the same pattern
    expect(comparisons.length).toBeGreaterThanOrEqual(4);
    for (const line of comparisons) {
      expect(line).toContain("Buffer.byteLength(");
    }
  });

  it("does not compare content.length against MAX_CONTENT_BYTES", () => {
    expect(source).not.toMatch(/\.length\s*>\s*MAX_CONTENT_BYTES/);
  });

  // BOM stripping regression guard (#1842)
  it("defines a stripBom helper", () => {
    expect(source).toContain("function stripBom(");
  });

  it("applies stripBom at every fs.readFile call site that returns content", () => {
    // Each fs.readFile in the file is wrapped in stripBom(...)
    const readFileCalls = source.match(/fs\.readFile\([^)]+\)/g) ?? [];
    expect(readFileCalls.length).toBeGreaterThanOrEqual(3);
    for (const call of readFileCalls) {
      // The call itself appears inside stripBom(...) — check surrounding context
      const idx = source.indexOf(call);
      const before = source.slice(Math.max(0, idx - 20), idx);
      expect(before).toContain("stripBom(");
    }
  });
});
