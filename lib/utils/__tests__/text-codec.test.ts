import { describe, it, expect } from "vitest";
import { readTextWithEncoding, writeTextPreservingEol } from "../text-codec";

// ---------------------------------------------------------------------------
// readTextWithEncoding
// ---------------------------------------------------------------------------

describe("readTextWithEncoding", () => {
  it("decodes plain UTF-8 text without BOM", () => {
    const input = "Hello, 世界\n";
    const buf = new TextEncoder().encode(input);
    const result = readTextWithEncoding(buf);
    expect(result.text).toBe(input);
    expect(result.eol).toBe("lf");
  });

  it("strips UTF-8 BOM (EF BB BF) on read", () => {
    const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
    const content = new TextEncoder().encode("テスト");
    const buf = new Uint8Array([...bom, ...content]);
    const result = readTextWithEncoding(buf);
    expect(result.text).toBe("テスト");
    expect(result.eol).toBe("lf");
  });

  it("detects LF-only files and preserves text unchanged", () => {
    const input = "line1\nline2\nline3";
    const buf = new TextEncoder().encode(input);
    const result = readTextWithEncoding(buf);
    expect(result.text).toBe(input);
    expect(result.eol).toBe("lf");
  });

  it("detects CRLF files and normalizes to LF in memory", () => {
    const input = "line1\r\nline2\r\nline3";
    const buf = new TextEncoder().encode(input);
    const result = readTextWithEncoding(buf);
    expect(result.text).toBe("line1\nline2\nline3");
    expect(result.eol).toBe("crlf");
  });

  it("handles UTF-8 BOM + CRLF file correctly", () => {
    const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
    const content = new TextEncoder().encode("first\r\nsecond");
    const buf = new Uint8Array([...bom, ...content]);
    const result = readTextWithEncoding(buf);
    expect(result.text).toBe("first\nsecond");
    expect(result.eol).toBe("crlf");
  });

  it("throws on UTF-16 LE BOM (FF FE)", () => {
    const buf = new Uint8Array([0xff, 0xfe, 0x48, 0x00, 0x69, 0x00]); // "Hi" in UTF-16 LE
    expect(() => readTextWithEncoding(buf)).toThrow(
      "UTF-8 以外のファイルは現在サポートされていません",
    );
  });

  it("throws on UTF-16 BE BOM (FE FF)", () => {
    const buf = new Uint8Array([0xfe, 0xff, 0x00, 0x48, 0x00, 0x69]); // "Hi" in UTF-16 BE
    expect(() => readTextWithEncoding(buf)).toThrow(
      "UTF-8 以外のファイルは現在サポートされていません",
    );
  });

  it("handles empty buffer", () => {
    const buf = new Uint8Array(0);
    const result = readTextWithEncoding(buf);
    expect(result.text).toBe("");
    expect(result.eol).toBe("lf");
  });

  it("handles buffer with only the UTF-8 BOM", () => {
    const buf = new Uint8Array([0xef, 0xbb, 0xbf]);
    const result = readTextWithEncoding(buf);
    expect(result.text).toBe("");
    expect(result.eol).toBe("lf");
  });
});

// ---------------------------------------------------------------------------
// writeTextPreservingEol
// ---------------------------------------------------------------------------

describe("writeTextPreservingEol", () => {
  it("writes LF text as LF", () => {
    const text = "line1\nline2";
    const bytes = writeTextPreservingEol(text, "lf");
    const decoded = new TextDecoder().decode(bytes);
    expect(decoded).toBe(text);
  });

  it("converts LF to CRLF when eol is crlf", () => {
    const text = "line1\nline2";
    const bytes = writeTextPreservingEol(text, "crlf");
    const decoded = new TextDecoder().decode(bytes);
    expect(decoded).toBe("line1\r\nline2");
  });

  it("does NOT write a BOM (1.2.10 simplification)", () => {
    const bytes = writeTextPreservingEol("hello", "lf");
    // First 3 bytes must NOT be the UTF-8 BOM sequence
    expect(bytes[0]).not.toBe(0xef);
  });

  it("round-trips CRLF: read → normalize → write restores CRLF", () => {
    const original = "first\r\nsecond\r\nthird";
    const inputBuf = new TextEncoder().encode(original);
    const { text, eol } = readTextWithEncoding(inputBuf);
    const outputBuf = writeTextPreservingEol(text, eol);
    const decoded = new TextDecoder().decode(outputBuf);
    expect(decoded).toBe(original);
  });

  it("round-trips LF file without introducing CRLF", () => {
    const original = "first\nsecond\nthird";
    const inputBuf = new TextEncoder().encode(original);
    const { text, eol } = readTextWithEncoding(inputBuf);
    const outputBuf = writeTextPreservingEol(text, eol);
    const decoded = new TextDecoder().decode(outputBuf);
    expect(decoded).toBe(original);
  });
});
