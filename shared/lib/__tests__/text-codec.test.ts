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
// #1888: fatal (strict) UTF-8 decoding
//
// Non-UTF-8 manuscripts (Shift_JIS, EUC-JP, BOM-less UTF-16, arbitrary binary)
// must be REJECTED on read instead of silently decoded into U+FFFD, which would
// be saved back over the original file. The discriminator is fatal decoding —
// NOT a naive "contains U+FFFD" check — so valid UTF-8 that legitimately
// contains U+FFFD still decodes successfully.
// ---------------------------------------------------------------------------

describe("readTextWithEncoding — strict UTF-8 (#1888)", () => {
  // 「こんにちは」in various encodings + other non-UTF-8 byte patterns.
  const REJECTED: Array<{ name: string; bytes: number[] }> = [
    {
      // Shift_JIS for "日本語" (82 in lead-byte range, invalid as UTF-8)
      name: "Shift_JIS bytes",
      bytes: [0x93, 0xfa, 0x96, 0x7b, 0x8c, 0xea],
    },
    {
      // EUC-JP for "日本" (high bytes form an invalid UTF-8 sequence)
      name: "EUC-JP bytes",
      bytes: [0xc6, 0xfc, 0xcb, 0xdc],
    },
    {
      // UTF-16 LE BOM + content (rejected by BOM check before decode)
      name: "UTF-16 LE with BOM",
      bytes: [0xff, 0xfe, 0x48, 0x00, 0x69, 0x00],
    },
    {
      // UTF-16 BE BOM + content
      name: "UTF-16 BE with BOM",
      bytes: [0xfe, 0xff, 0x00, 0x48, 0x00, 0x69],
    },
    {
      // Lone continuation byte — never valid UTF-8
      name: "lone continuation byte 0x80",
      bytes: [0x41, 0x80, 0x42],
    },
    {
      // Truncated multi-byte sequence (lead byte without continuation)
      name: "truncated multi-byte sequence",
      bytes: [0xe3, 0x81],
    },
    {
      // Random invalid bytes
      name: "random invalid bytes",
      bytes: [0xff, 0xfe, 0xfd, 0xfc, 0x00, 0x80, 0xc0],
    },
  ];

  it.each(REJECTED)("rejects $name", ({ bytes }) => {
    const buf = new Uint8Array(bytes);
    expect(() => readTextWithEncoding(buf)).toThrow(
      "UTF-8 以外のファイルは現在サポートされていません",
    );
  });

  const ACCEPTED: Array<{ name: string; build: () => Uint8Array; expected: string }> = [
    {
      name: "valid UTF-8 (no BOM)",
      build: () => new TextEncoder().encode("こんにちは、世界\n"),
      expected: "こんにちは、世界\n",
    },
    {
      name: "valid UTF-8 with BOM",
      build: () => {
        const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
        const content = new TextEncoder().encode("先頭BOM");
        return new Uint8Array([...bom, ...content]);
      },
      expected: "先頭BOM",
    },
    {
      name: "valid UTF-8 containing a legitimate U+FFFD",
      // U+FFFD is itself a valid Unicode scalar; its UTF-8 encoding (EF BF BD)
      // is valid UTF-8 and MUST NOT be rejected.
      build: () => new TextEncoder().encode("text�more"),
      expected: "text�more",
    },
    {
      name: "ASCII only",
      build: () => new TextEncoder().encode("plain ascii"),
      expected: "plain ascii",
    },
  ];

  it.each(ACCEPTED)("accepts $name", ({ build, expected }) => {
    const result = readTextWithEncoding(build());
    expect(result.text).toBe(expected);
  });

  it("does NOT use a naive U+FFFD string check: a document made only of U+FFFD decodes", () => {
    // Three legitimately-encoded U+FFFD characters (valid UTF-8).
    const buf = new TextEncoder().encode("���");
    const result = readTextWithEncoding(buf);
    expect(result.text).toBe("���");
  });

  it("leaves the original file bytes UNCHANGED after a failed (rejected) open", () => {
    // Simulate the open→(no write) flow: when decode throws, nothing is written
    // back, so the source bytes are byte-for-byte identical to disk.
    const originalBytes = new Uint8Array([0x93, 0xfa, 0x96, 0x7b, 0x8c, 0xea]); // Shift_JIS
    const snapshot = Uint8Array.from(originalBytes);

    expect(() => readTextWithEncoding(originalBytes)).toThrow(
      "UTF-8 以外のファイルは現在サポートされていません",
    );

    // The buffer the caller would write back is untouched; no lossy round-trip.
    expect(Array.from(originalBytes)).toEqual(Array.from(snapshot));
    // And re-encoding the (never produced) decode output cannot have replaced
    // any byte, because no decode output exists to write.
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
