/**
 * Regression guard for exported PDF/EPUB/DOCX durable writes (#2147).
 *
 * file-ipc.js is a CommonJS Electron main-process module and cannot be imported
 * directly in vitest. These source-text checks pin the export handler invariant:
 * binary exports must use the same open -> write -> sync -> close discipline as
 * normal manuscript saves, not direct fs.writeFile.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.resolve(here, "../file-ipc.js"), "utf-8");

function getHandler(channel: string): string {
  const match = source.match(
    new RegExp(
      `ipcMain\\.handle\\(${channel.replaceAll(".", "\\.")}[\\s\\S]*?(?=\\n\\s*ipcMain\\.handle\\(|\\n\\s*// Clean up)`,
    ),
  );
  return match ? match[0] : "";
}

const exportPdfHandler = getHandler("EXPORT_CHANNELS.invoke.exportPdf");
const exportEpubHandler = getHandler("EXPORT_CHANNELS.invoke.exportEpub");
const exportDocxHandler = getHandler("EXPORT_CHANNELS.invoke.exportDocx");

describe("file-ipc.js export handlers — durable binary writes (#2147)", () => {
  it("defines a durable buffer write helper using open -> writeFile -> sync -> close", () => {
    const helperMatch = source.match(
      /async function writeBufferDurably\([\s\S]*?(?=\n\s*\/\/ --- save-file path security validation ---)/,
    );
    const helper = helperMatch ? helperMatch[0] : "";

    expect(helper).toContain('fs.open(target, "w")');
    expect(helper).toContain("fileHandle.writeFile(buffer)");
    expect(helper).toContain("fileHandle.sync()");
    expect(helper).toContain("finally");
    expect(helper).toContain("fileHandle.close()");
  });

  it("finds all binary export handlers", () => {
    expect(exportPdfHandler.length).toBeGreaterThan(100);
    expect(exportEpubHandler.length).toBeGreaterThan(100);
    expect(exportDocxHandler.length).toBeGreaterThan(100);
  });

  it("writes PDF atomically while EPUB/DOCX use the durable buffer helper", () => {
    expect(exportPdfHandler).toContain("writePdfToFile");
    expect(exportPdfHandler).toContain("await writePdfToFile(content, options || {}, filePath)");
    expect(exportPdfHandler).not.toContain("generatePdf(");
    expect(exportPdfHandler).not.toContain("pdfBuffer");
    expect(exportEpubHandler).toContain("await writeBufferDurably(filePath, epubBuffer)");
    expect(exportDocxHandler).toContain("await writeBufferDurably(filePath, docxBuffer)");
  });

  it("does not use direct fs.writeFile in binary export handlers", () => {
    for (const handler of [exportPdfHandler, exportEpubHandler, exportDocxHandler]) {
      expect(handler).not.toMatch(/fs\.writeFile\(\s*filePath\s*,/);
    }
  });
});
