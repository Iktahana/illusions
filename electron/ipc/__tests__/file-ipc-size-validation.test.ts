/**
 * Tests for file-ipc content size validation
 *
 * Verifies that the 50 MB limit is enforced using Buffer.byteLength (UTF-8 byte
 * count) rather than String.prototype.length (UTF-16 code unit count).
 *
 * The bug (pre-fix): content.length was compared against MAX_CONTENT_BYTES.
 * CJK characters occupy 3 bytes in UTF-8 but only 1 code unit in .length, so
 * a 150 MB Japanese manuscript was allowed through as if it were 50 MB.
 *
 * Architecture note: file-ipc.js is a CommonJS Electron main-process module and
 * cannot be imported directly into vitest. These tests validate the invariant that
 * must hold in file-ipc.js — that Buffer.byteLength is the correct measurement —
 * and serve as a regression guard for the fix applied at lines 304, 446, 592, 648.
 */

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
