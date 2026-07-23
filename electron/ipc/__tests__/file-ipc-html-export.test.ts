import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.resolve(here, "../file-ipc.js"), "utf-8");
const validation =
  source.match(
    /function validateHtmlRenderRequest\([\s\S]*?(?=\n\s*\/\*\* @param \{unknown\} options \*\/)/,
  )?.[0] ?? "";

function getHandler(channel: string): string {
  return (
    source.match(
      new RegExp(
        `ipcMain\\.handle\\(\\s*EXPORT_CHANNELS\\.invoke\\.${channel}[\\s\\S]*?(?=\\n\\s*ipcMain\\.handle\\()`,
      ),
    )?.[0] ?? ""
  );
}

const previewHandler = getHandler("generateHtmlPreview");
const exportHandler = getHandler("exportHtml");

describe("native MDI HTML export IPC", () => {
  it("opens a native save dialog before invoking the Rust renderer", () => {
    expect(exportHandler).toContain("dialog.showSaveDialog");
    expect(exportHandler).toContain("safeExportBaseName(title)");
    expect(exportHandler).toContain('extensions: ["html", "htm"]');
    expect(exportHandler.indexOf("dialog.showSaveDialog")).toBeLessThan(
      exportHandler.indexOf("generateHtml(content, fileType"),
    );
    expect(exportHandler).toContain("if (!filePath) return null");
  });

  it("validates the shared 50 MB ceiling and the upstream bodyOnly option", () => {
    expect(validation).toContain("MAX_CONTENT_BYTES");
    expect(validation).toContain('code: "CONTENT_TOO_LARGE"');
    expect(validation).toContain('key !== "bodyOnly"');
    expect(validation).toContain('typeof options.bodyOnly !== "boolean"');
  });

  it("renders previews and durable files through the same Rust HTML options", () => {
    expect(previewHandler).toContain("validateHtmlRenderRequest(content, options)");
    expect(previewHandler).toContain("normalizeHtmlRenderOptions(options)");
    expect(previewHandler).toContain("return { success: true, html }");
    expect(exportHandler).toContain("validateHtmlRenderRequest(content, options)");
    expect(exportHandler).toContain("normalizeHtmlRenderOptions(options)");
    expect(exportHandler).toContain('Buffer.from(html, "utf-8")');
    expect(exportHandler).toContain("writeBufferDurably");
    expect(exportHandler).not.toContain("Blob");
    expect(exportHandler).not.toContain("createObjectURL");
  });
});
