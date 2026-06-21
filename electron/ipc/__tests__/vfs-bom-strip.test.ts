/**
 * Regression test for #1842: VFS .mdi read path must strip UTF-8 BOM
 *
 * Root cause: `vfs-ipc.js` `readFile` handler used a bare `fs.readFile(path, "utf-8")`
 * which preserves the BOM as U+FEFF at string position 0. The standalone `.mdi` read
 * and the `.txt` path (via `text-codec.ts` `readTextWithEncoding()`) both strip it,
 * making the VFS project read path asymmetric.
 *
 * Fix: a `stripBom()` helper in `vfs-ipc.js` wraps the return value of `readFile`.
 *
 * Node's `fs.readFile(path, "utf-8")` decodes raw UTF-8 bytes including the BOM
 * sequence (EF BB BF) as the Unicode character U+FEFF at position 0.
 * TextDecoder used in browser/jsdom environments strips the BOM automatically,
 * so tests construct BOM-prefixed strings directly (prepending "﻿").
 *
 * Architecture note: `vfs-ipc.js` is a CommonJS Electron main-process module and
 * cannot be imported directly into vitest. These tests validate the `stripBom`
 * invariant directly — the same approach used in `file-ipc-size-validation.test.ts`.
 */

import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Reference copy of the `stripBom` helper added to `vfs-ipc.js` for #1842.
// Kept in sync with the production code in electron/ipc/vfs-ipc.js.
// ---------------------------------------------------------------------------

function stripBom(content: string): string {
  return content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
}

// ---------------------------------------------------------------------------
// Reference copy of the BOM-strip logic from `text-codec.ts` (the .txt path).
// Used to verify symmetry without a cross-module import.
// ---------------------------------------------------------------------------

function textCodecBomStrip(buf: Uint8Array): string {
  let start = 0;
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    start = 3;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(buf.slice(start));
}

// ---------------------------------------------------------------------------
// stripBom – unit tests
// ---------------------------------------------------------------------------

describe("stripBom (vfs-ipc.js helper, #1842)", () => {
  it("removes leading U+FEFF from a string that has a BOM", () => {
    // Prepend U+FEFF directly — this is what Node fs.readFile("utf-8") returns
    // when the source file begins with the raw bytes EF BB BF.
    const withBom = "﻿こんにちは世界";
    expect(withBom.charCodeAt(0)).toBe(0xfeff); // sanity
    expect(stripBom(withBom)).toBe("こんにちは世界");
  });

  it("is a no-op when no BOM is present", () => {
    const plain = "普通のテキスト";
    expect(stripBom(plain)).toBe(plain);
  });

  it("handles an empty string without throwing", () => {
    expect(stripBom("")).toBe("");
  });

  it("handles a string that is only the BOM character", () => {
    expect(stripBom("﻿")).toBe("");
  });

  it("does not strip an embedded (non-leading) BOM", () => {
    const embedded = "テキスト﻿の途中";
    expect(stripBom(embedded)).toBe(embedded);
  });

  it("strips BOM from typical .mdi document content", () => {
    const mdiContent = "# タイトル\n\n本文テキスト。";
    const withBom = "﻿" + mdiContent;
    expect(stripBom(withBom)).toBe(mdiContent);
  });
});

// ---------------------------------------------------------------------------
// Symmetry: VFS .mdi path (stripBom) vs .txt path (text-codec.ts)
//
// A file with a UTF-8 BOM must yield identical BOM-free content whether it is
// opened via the VFS project path (stripBom ∘ fs.readFile) or the standalone
// .txt path (text-codec.ts readTextWithEncoding).  This is the core invariant
// of #1842.
// ---------------------------------------------------------------------------

describe("BOM-strip symmetry: VFS .mdi path vs .txt path (#1842)", () => {
  const UTF8_BOM = new Uint8Array([0xef, 0xbb, 0xbf]);
  const mdiContent = "# タイトル\n\n本文テキスト";

  it(".txt path (text-codec BOM strip) strips UTF-8 BOM from raw bytes", () => {
    const contentBytes = new TextEncoder().encode(mdiContent);
    const fileBytes = new Uint8Array([...UTF8_BOM, ...contentBytes]);
    const result = textCodecBomStrip(fileBytes);
    expect(result).toBe(mdiContent);
    expect(result.charCodeAt(0)).not.toBe(0xfeff);
  });

  it(".mdi VFS path (stripBom applied to Node readFile output) strips UTF-8 BOM", () => {
    // Node's fs.readFile("utf-8") on a BOM-prefixed file yields "﻿" + content.
    // We construct that string directly (TextDecoder strips BOM in jsdom/browser env).
    const nodeReadFileOutput = "﻿" + mdiContent;
    expect(nodeReadFileOutput.charCodeAt(0)).toBe(0xfeff); // sanity: BOM present

    const result = stripBom(nodeReadFileOutput);
    expect(result).toBe(mdiContent);
    expect(result.charCodeAt(0)).not.toBe(0xfeff);
  });

  it("both paths produce identical output for BOM-prefixed .mdi content", () => {
    const contentBytes = new TextEncoder().encode(mdiContent);
    const fileBytes = new Uint8Array([...UTF8_BOM, ...contentBytes]);

    // .txt path: reads raw bytes, strips BOM from bytes
    const txtResult = textCodecBomStrip(fileBytes);

    // VFS .mdi path: Node readFile emits "﻿" + content, stripBom removes it
    const nodeReadFileOutput = "﻿" + mdiContent;
    const vfsResult = stripBom(nodeReadFileOutput);

    expect(vfsResult).toBe(txtResult);
  });

  it("both paths produce identical output for BOM-free content", () => {
    const contentBytes = new TextEncoder().encode(mdiContent);

    const txtResult = textCodecBomStrip(contentBytes);
    const vfsResult = stripBom(mdiContent); // no BOM in string = no-op

    expect(vfsResult).toBe(txtResult);
  });
});
