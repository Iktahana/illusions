import { describe, expect, it } from "vitest";

import { sourceLocationAtByteOffset, Utf8SourceOffsets } from "@/lib/mdi/utf8-source-offsets";

describe("Utf8SourceOffsets", () => {
  it("maps Rust UTF-8 byte boundaries to JavaScript UTF-16 indices", () => {
    const offsets = new Utf8SourceOffsets("A東京😀B");
    expect(offsets.toUtf16(0)).toBe(0);
    expect(offsets.toUtf16(1)).toBe(1);
    expect(offsets.toUtf16(4)).toBe(2);
    expect(offsets.toUtf16(7)).toBe(3);
    expect(offsets.toUtf16(11)).toBe(5);
    expect(offsets.toUtf16(12)).toBe(6);
  });

  it("clamps a byte offset inside a code point to its leading UTF-16 boundary", () => {
    const offsets = new Utf8SourceOffsets("東A");
    expect(offsets.toUtf16(2)).toBe(0);
  });

  it("reports one-based line and Unicode column from a Rust byte offset", () => {
    expect(sourceLocationAtByteOffset("一行目\r\n😀警告", 16)).toEqual({ line: 2, column: 2 });
  });
});
