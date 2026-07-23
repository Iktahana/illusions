import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.resolve(here, "../file-ipc.js"), "utf-8");
const handler =
  source.match(
    /ipcMain\.handle\(EXPORT_CHANNELS\.invoke\.exportHtml[\s\S]*?(?=\n\s*ipcMain\.handle\()/,
  )?.[0] ?? "";

describe("native MDI HTML export IPC", () => {
  it("opens a native save dialog before invoking the Rust renderer", () => {
    expect(handler).toContain("dialog.showSaveDialog");
    expect(handler).toContain("safeExportBaseName(title)");
    expect(handler).toContain('extensions: ["html", "htm"]');
    expect(handler.indexOf("dialog.showSaveDialog")).toBeLessThan(
      handler.indexOf("generateHtml(content, fileType)"),
    );
    expect(handler).toContain("if (!filePath) return null");
  });

  it("validates the shared 50 MB ceiling and writes standalone HTML durably as UTF-8", () => {
    expect(handler).toContain("MAX_CONTENT_BYTES");
    expect(handler).toContain('code: "CONTENT_TOO_LARGE"');
    expect(handler).toContain('Buffer.from(html, "utf-8")');
    expect(handler).toContain("writeBufferDurably");
    expect(handler).not.toContain("Blob");
    expect(handler).not.toContain("createObjectURL");
  });
});
