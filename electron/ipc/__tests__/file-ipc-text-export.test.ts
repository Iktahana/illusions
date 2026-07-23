import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.resolve(here, "../file-ipc.js"), "utf-8");
const exportHandler =
  source.match(
    /ipcMain\.handle\(\s*EXPORT_CHANNELS\.invoke\.exportMdiText[\s\S]*?(?=\n\s*ipcMain\.handle\()/,
  )?.[0] ?? "";
const copyHandler =
  source.match(
    /ipcMain\.handle\(\s*EXPORT_CHANNELS\.invoke\.copyMdiText[\s\S]*?(?=\n\s*ipcMain\.handle\()/,
  )?.[0] ?? "";

describe("native MDI text export IPC", () => {
  it("uses the native save dialog before rendering", () => {
    expect(exportHandler).toContain("dialog.showSaveDialog");
    expect(exportHandler).toContain("txtExportSuggestedName(title, format)");
    expect(exportHandler.indexOf("dialog.showSaveDialog")).toBeLessThan(
      exportHandler.indexOf("renderMdiText(content, format, fileType, indent)"),
    );
  });

  it("writes UTF-8 output durably and preserves cancellation", () => {
    expect(exportHandler).toContain("if (!filePath) return null");
    expect(exportHandler).toContain('Buffer.from(converted, "utf-8")');
    expect(exportHandler).toContain("writeBufferDurably");
    expect(exportHandler).not.toContain("Blob");
    expect(exportHandler).not.toContain("createObjectURL");
  });

  it("validates all five formats and the shared 50 MB request ceiling", () => {
    for (const format of ["txt", "txt-ruby", "narou", "kakuyomu", "aozora"]) {
      expect(source).toContain(`"${format}"`);
    }
    expect(source).toContain("TEXT_EXPORT_FORMATS");
    expect(source).toContain("MAX_CONTENT_BYTES");
    expect(source).toContain('code: "CONTENT_TOO_LARGE"');
    expect(exportHandler).toContain("validateTextExportRequest(content, format)");
    expect(copyHandler).toContain("validateTextExportRequest(content, format)");
  });

  it("renders through the shared MDI adapter and writes only the converted text to clipboard", () => {
    expect(copyHandler).toContain("renderMdiText(content, format, fileType, indent)");
    expect(copyHandler).toContain("clipboard.writeText(converted)");
    expect(copyHandler).toContain("return { success: true }");
    expect(copyHandler).not.toContain("dialog.showSaveDialog");
    expect(copyHandler).not.toContain("writeBufferDurably");
  });
});
