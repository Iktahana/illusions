import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.resolve(here, "../file-ipc.js"), "utf-8");
const previewHandler = source.match(
  /ipcMain\.handle\(\s*EXPORT_CHANNELS\.invoke\.generatePdfPreview[\s\S]*?(?=\n\s*ipcMain\.handle\(EXPORT_CHANNELS\.invoke\.cancelPdfPreview)/,
)?.[0];

describe("file-ipc PDF preview boundary", () => {
  it("registers generation and explicit cancellation handlers", () => {
    expect(previewHandler?.length).toBeGreaterThan(500);
    expect(source).toContain("ipcMain.handle(EXPORT_CHANNELS.invoke.cancelPdfPreview");
    expect(source).toContain("cancelPdfPreview(event.sender.id)");
  });

  it("uses system memory unless a validated setting overrides it", () => {
    expect(previewHandler).toContain("os.totalmem()");
    expect(previewHandler).toContain("resolvePdfPreviewPagePolicy(");
    expect(previewHandler).toContain("requestedMaxPages");
  });

  it("actively cancels stale and destroyed-window jobs", () => {
    expect(previewHandler).toContain("cancelPdfPreview(webContentsId)");
    expect(previewHandler).toContain("new AbortController()");
    expect(previewHandler).toContain('event.sender.once("destroyed", abortOnDestroyed)');
    expect(previewHandler).toContain("signal: controller.signal");
    expect(previewHandler).toContain("controller.signal.aborted");
  });

  it("returns binary PDF data without an extra copy or base64 encoding", () => {
    expect(previewHandler).toContain("data: result.pdf");
    expect(previewHandler).not.toContain("Uint8Array.from(result.pdf)");
    expect(previewHandler).not.toContain('toString("base64")');
    expect(previewHandler).toContain("systemMemoryGiB");
    expect(previewHandler).toContain("sourceTruncated");
  });
});
