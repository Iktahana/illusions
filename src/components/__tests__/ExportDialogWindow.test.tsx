import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.resolve(here, "../ExportDialogWindow.tsx"), "utf8");

describe("ExportDialogWindow", () => {
  it("hosts document, print, and TXT settings and returns their selection", () => {
    expect(source).toContain("<ExportDialog");
    expect(source).toContain("<TxtExportDialog");
    expect(source).toContain('request.kind === "print"');
    expect(source).toContain('mode="print"');
    expect(source.match(/presentation="window"/g)).toHaveLength(3);
    expect(source.match(/confirmDiscard=\{confirmDiscard\}/g)).toHaveLength(3);
    expect(source).toContain("confirmExportDialogDiscard");
    expect(source).toContain("completeExportDialog");
  });
});
