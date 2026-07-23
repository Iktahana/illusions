import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.resolve(here, "../ExportDialog.tsx"), "utf-8");

describe("ExportDialog PDF preview lifecycle", () => {
  it("loads the user's page-limit preference and passes it to Electron", () => {
    expect(source).toContain("localPreferences.getPdfPreviewMaxPages()");
    expect(source).toContain('previewMaxPagesPreference === "auto"');
    expect(source).toContain("Number(previewMaxPagesPreference)");
  });

  it("uses binary IPC data directly without base64 expansion", () => {
    expect(source).toContain('new Blob([result.data], { type: "application/pdf" })');
    expect(source).not.toContain("atob(");
  });

  it("cancels stale previews on rerender and unmount", () => {
    expect(source.match(/cancelPdfPreview/g)?.length).toBeGreaterThanOrEqual(2);
    expect(source).toContain("const id = ++generationIdRef.current");
    expect(source).toContain("generationIdRef.current === id");
    expect(source).toContain("generationIdRef.current += 1");
    expect(source).toContain("if (!result.cancelled)");
  });

  it("revokes the base Blob URL without the PDF viewer fragment", () => {
    expect(source).toContain("pdfUrlRef.current = objectUrl");
    expect(source).toContain("setPdfUrl(`${objectUrl}#view=FitH`)");
    expect(source).not.toContain("pdfUrlRef.current = newPdfUrl");
  });

  it("shows a regeneration error even when an older preview URL exists", () => {
    expect(source).toMatch(/previewError\s*\?\s*\(/);
    expect(source).toMatch(/\)\s*:\s*pdfUrl\s*\?\s*\(/);
  });

  it("shows natural Japanese memory and page-limit guidance", () => {
    expect(source).toContain("搭載メモリは");
    expect(source).toContain("プレビューの上限は");
    expect(source).toContain("設定の「エクスポート」で変更できます。");
  });
});
