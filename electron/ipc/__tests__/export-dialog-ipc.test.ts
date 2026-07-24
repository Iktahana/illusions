import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.resolve(here, "../export-dialog-ipc.js"), "utf8");

describe("native export dialog window smoke contract", () => {
  it("creates an OS modal child window that blocks its opener", () => {
    expect(source).toContain("parent,");
    expect(source).toContain("modal: true");
    expect(source).toContain('preload: path.join(__dirname, "preload.js")');
    expect(source).not.toContain('path.join(__dirname, "../preload.js")');
    expect(source).toContain("backgroundColor:");
    expect(source).toContain("nativeTheme.shouldUseDarkColors");
    expect(source).toContain('"?export-dialog"');
  });

  it("uses a compact native window for EPUB, which has no preview pane", () => {
    expect(source).toContain('request.format === "epub"');
    expect(source).toContain("width: isTxt ? 520 : isEpub ? 760 : 1280");
    expect(source).toContain("minWidth: isTxt ? 420 : isEpub ? 640 : 960");
  });

  it("returns confirmation data and resolves cancellation when the child closes", () => {
    expect(source).toContain("completeExportDialog");
    expect(source).toContain("entry.resolve(result ?? null)");
    expect(source).toContain("entry.resolve(null)");
  });

  it("restores the parent editor menu state after the modal closes", () => {
    expect(source).toContain("parent.focus()");
    expect(source).toContain("setActiveWindowId(parent.id)");
    expect(source).toContain("rebuildApplicationMenu()");
  });

  it("uses an OS-native message box for discarding changed settings", () => {
    expect(source).toContain("dialog.showMessageBox(win");
    expect(source).toContain('buttons: ["キャンセルする", "続ける"]');
    expect(source).toContain("return result.response === 0");
  });
});
