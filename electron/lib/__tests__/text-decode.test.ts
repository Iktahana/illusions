/**
 * Tests for the main-process strict UTF-8 decode helper (#1888).
 *
 * `decodeUtf8Strict` / `readFileStrictUtf8` replace the lossy
 * `fs.readFile(path, "utf-8")` reads in file-ipc.js and vfs-ipc.js so that a
 * non-UTF-8 manuscript is REFUSED on open instead of being silently decoded
 * into U+FFFD and later saved back over the original (data loss).
 *
 * The byte-level test below asserts the source file on disk is byte-for-byte
 * unchanged after a failed open — i.e. nothing is ever written back.
 */

import { describe, it, expect, afterEach } from "vitest";
import os from "os";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const fs = require("fs") as typeof import("fs");

const { decodeUtf8Strict, readFileStrictUtf8, stripBom } =
  require("../../../electron/lib/text-decode") as {
    decodeUtf8Strict: (buf: Uint8Array | Buffer) => string;
    readFileStrictUtf8: (filePath: string) => Promise<string>;
    stripBom: (s: string) => string;
  };

// ---------------------------------------------------------------------------
// decodeUtf8Strict — TABLE: rejected encodings vs accepted UTF-8
// ---------------------------------------------------------------------------

describe("decodeUtf8Strict (#1888)", () => {
  const REJECTED: Array<{ name: string; bytes: number[] }> = [
    { name: "Shift_JIS bytes", bytes: [0x93, 0xfa, 0x96, 0x7b, 0x8c, 0xea] },
    { name: "EUC-JP bytes", bytes: [0xc6, 0xfc, 0xcb, 0xdc] },
    { name: "UTF-16 LE (lone low bytes)", bytes: [0x48, 0x00, 0x69, 0x00, 0x80] },
    { name: "lone continuation byte", bytes: [0x41, 0x80, 0x42] },
    { name: "truncated multi-byte", bytes: [0xe3, 0x81] },
    { name: "random invalid bytes", bytes: [0xff, 0xfe, 0xfd, 0xc0, 0x80] },
  ];

  it.each(REJECTED)("throws NON_UTF8 on $name", ({ bytes }) => {
    const buf = Buffer.from(bytes);
    let thrown: unknown;
    try {
      decodeUtf8Strict(buf);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as { code?: string }).code).toBe("NON_UTF8");
    expect((thrown as Error).message).toBe("UTF-8 以外のファイルは現在サポートされていません");
  });

  it("decodes valid UTF-8 and strips a leading BOM", () => {
    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    const buf = Buffer.concat([bom, Buffer.from("本文テキスト", "utf-8")]);
    expect(decodeUtf8Strict(buf)).toBe("本文テキスト");
  });

  it("accepts valid UTF-8 containing a legitimate U+FFFD (not a naive check)", () => {
    const buf = Buffer.from("a�b", "utf-8");
    expect(decodeUtf8Strict(buf)).toBe("a�b");
  });

  it("stripBom only removes a leading U+FEFF", () => {
    expect(stripBom("﻿hi")).toBe("hi");
    expect(stripBom("hi")).toBe("hi");
  });
});

// ---------------------------------------------------------------------------
// readFileStrictUtf8 — byte-level: original file unchanged after failed open
// ---------------------------------------------------------------------------

describe("readFileStrictUtf8 — original bytes preserved on failure (#1888)", () => {
  const tmpFiles: string[] = [];

  afterEach(() => {
    for (const f of tmpFiles.splice(0)) {
      try {
        fs.unlinkSync(f);
      } catch {
        /* ignore */
      }
    }
  });

  function writeTmp(name: string, bytes: Buffer): string {
    const p = path.join(os.tmpdir(), `illusions-1888-${Date.now()}-${name}`);
    fs.writeFileSync(p, bytes);
    tmpFiles.push(p);
    return p;
  }

  it("throws on a non-UTF-8 file and leaves the file bytes byte-for-byte identical", async () => {
    // Shift_JIS-encoded manuscript bytes.
    const original = Buffer.from([0x93, 0xfa, 0x96, 0x7b, 0x8c, 0xea, 0x0a]);
    const filePath = writeTmp("sjis.txt", original);

    await expect(readFileStrictUtf8(filePath)).rejects.toThrow(
      "UTF-8 以外のファイルは現在サポートされていません",
    );

    // The failed open performed no write-back: disk content is unchanged.
    const after = fs.readFileSync(filePath);
    expect(Array.from(after)).toEqual(Array.from(original));
  });

  it("reads a valid UTF-8 file successfully", async () => {
    const original = Buffer.from("有効なUTF-8\n", "utf-8");
    const filePath = writeTmp("utf8.txt", original);
    await expect(readFileStrictUtf8(filePath)).resolves.toBe("有効なUTF-8\n");
  });
});
