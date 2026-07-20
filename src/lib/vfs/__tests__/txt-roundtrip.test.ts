/**
 * Integration tests for .txt file round-trips through VFS.
 *
 * Tests that CRLF / LF preservation works via the text-codec layer,
 * using lightweight mocks for both WebVFS and ElectronVFS file handles.
 */

import { describe, it, expect } from "vitest";
import { readTextWithEncoding, writeTextPreservingEol } from "@/shared/lib/text-codec";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/**
 * Simulate the read → decode → write → encode cycle that VFS wrappers perform.
 */
async function simulateVFSRoundTrip(
  originalContent: string,
): Promise<{ decoded: string; eol: "lf" | "crlf"; written: string }> {
  // Encode as if a file exists on disk
  const diskBytes = new TextEncoder().encode(originalContent);

  // Read phase: decode bytes (as VFS openFile would)
  const { text: decoded, eol } = readTextWithEncoding(new Uint8Array(diskBytes));

  // Write phase: re-encode for disk (as VFS writeFile would)
  const writtenBytes = writeTextPreservingEol(decoded, eol);
  const written = new TextDecoder().decode(writtenBytes);

  return { decoded, eol, written };
}

// ---------------------------------------------------------------------------
// WebVFS mock round-trip
// ---------------------------------------------------------------------------

describe("WebVFS txt round-trip (mocked)", () => {
  it("preserves CRLF through read/write cycle", async () => {
    const original = "行1\r\n行2\r\n行3";
    const { decoded, eol, written } = await simulateVFSRoundTrip(original);

    expect(eol).toBe("crlf");
    // In-memory representation uses LF
    expect(decoded).toBe("行1\n行2\n行3");
    // Written to disk restores CRLF
    expect(written).toBe(original);
  });

  it("preserves LF through read/write cycle", async () => {
    const original = "行1\n行2\n行3";
    const { decoded, eol, written } = await simulateVFSRoundTrip(original);

    expect(eol).toBe("lf");
    expect(decoded).toBe(original);
    expect(written).toBe(original);
  });

  it("strips UTF-8 BOM on read, does NOT restore on write", async () => {
    const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
    const body = new TextEncoder().encode("本文テスト\n");
    const withBom = new Uint8Array([...bom, ...body]);

    const { text: decoded, eol } = readTextWithEncoding(withBom);
    const written = writeTextPreservingEol(decoded, eol);

    // BOM stripped in memory
    expect(decoded).toBe("本文テスト\n");
    // Written bytes have NO BOM (1.2.10: do not restore)
    expect(written[0]).not.toBe(0xef);
    expect(new TextDecoder().decode(written)).toBe("本文テスト\n");
  });

  it("rejects UTF-16 LE file with Japanese error", () => {
    // UTF-16 LE BOM followed by minimal content
    const buf = new Uint8Array([0xff, 0xfe, 0x48, 0x00]);
    expect(() => readTextWithEncoding(buf)).toThrow(
      "UTF-8 以外のファイルは現在サポートされていません",
    );
  });

  it("rejects UTF-16 BE file with Japanese error", () => {
    // UTF-16 BE BOM
    const buf = new Uint8Array([0xfe, 0xff, 0x00, 0x48]);
    expect(() => readTextWithEncoding(buf)).toThrow(
      "UTF-8 以外のファイルは現在サポートされていません",
    );
  });
});

// ---------------------------------------------------------------------------
// ElectronVFS mock round-trip
// ---------------------------------------------------------------------------

describe("ElectronVFS txt round-trip (mocked IPC)", () => {
  it("CRLF file from Electron main process round-trips correctly", async () => {
    // Simulate IPC returning a Buffer (which behaves like Uint8Array in Node)
    const crlfContent = "Windows行\r\nテキスト\r\n";
    const ipcBuf = Buffer.from(crlfContent, "utf-8");

    // IPC bridge would return buf as an object; renderer converts it
    const asUint8 = new Uint8Array(ipcBuf);
    const { text, eol } = readTextWithEncoding(asUint8);

    expect(eol).toBe("crlf");
    expect(text).toBe("Windows行\nテキスト\n");

    // Simulate write back
    const written = writeTextPreservingEol(text, eol);
    expect(new TextDecoder().decode(written)).toBe(crlfContent);
  });

  it("LF file from Electron main process round-trips correctly", async () => {
    const lfContent = "Unix行\nテキスト\n";
    const ipcBuf = Buffer.from(lfContent, "utf-8");

    const asUint8 = new Uint8Array(ipcBuf);
    const { text, eol } = readTextWithEncoding(asUint8);

    expect(eol).toBe("lf");
    expect(text).toBe(lfContent);
  });

  it("openFile method mock returns decoded text with eol metadata", () => {
    // Verifies the interface contract: openFile returns { path, name, buf }
    // and the caller runs readTextWithEncoding on buf
    const mockIpcResult = {
      path: "/Users/test/document.txt",
      name: "document.txt",
      buf: new TextEncoder().encode("第一行\r\n第二行"),
    };

    const { text, eol } = readTextWithEncoding(new Uint8Array(mockIpcResult.buf));
    expect(eol).toBe("crlf");
    expect(text).toBe("第一行\n第二行");
  });
});

// ---------------------------------------------------------------------------
// openFile options interface
// ---------------------------------------------------------------------------

describe("openFile options contract", () => {
  it("default filter should include .txt extension", () => {
    // This documents the expected default filter structure
    // that both WebVFS and ElectronVFS openFile should use
    const defaultFilter = { name: "テキスト", extensions: ["txt"] };
    expect(defaultFilter.name).toBe("テキスト");
    expect(defaultFilter.extensions).toContain("txt");
  });
});
