import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.resolve(here, "../export-dialog-ipc.js"), "utf8");

describe("native export dialog window smoke contract", () => {
  it("creates an OS modal child window that blocks its opener", () => {
    expect(source).toContain("getCenteredWindowPosition(parent, width, height)");
    expect(source).toContain("...macWindowOptions");
    expect(source).toContain("alwaysOnTop: true");
    expect(source).toContain('win.setAlwaysOnTop(true, "modal-panel")');
    expect(source).toContain("parent.setFocusable(false)");
    expect(source).toContain(": { parent, modal: true }");
    expect(source).toContain('preload: path.join(__dirname, "preload.js")');
    expect(source).not.toContain('path.join(__dirname, "../preload.js")');
    expect(source).toContain("backgroundColor:");
    expect(source).toContain('useNativeFrame ? "#1e1e1e" : "#00000000"');
    expect(source).toContain('"?export-dialog"');
  });

  it("uses the native Windows frame so export and print windows have a system close button", () => {
    expect(source).toContain('process.platform === "win32"');
    expect(source).toContain("frame: useNativeFrame");
    expect(source).toContain("transparent: !useNativeFrame");
    expect(source).toContain('request.kind === "print" ? "印刷設定"');
  });

  it("uses a compact native window for EPUB, which has no preview pane", () => {
    expect(source).toContain('request.format === "epub"');
    expect(source).toContain("const width = isTxt ? 520 : isEpub ? 760 : 1280");
    expect(source).toContain("width,");
    expect(source).toContain("minWidth: isTxt ? 420 : isEpub ? 640 : 960");
  });

  it("returns confirmation data and resolves cancellation when the child closes", () => {
    expect(source).toContain("completeExportDialog");
    expect(source).toContain("entry.result = result ?? null");
    expect(source).toContain("entry.resolve(entry.completed ? entry.result : null)");
  });

  it("restores the parent editor menu state after the modal closes", () => {
    expect(source).toContain("restoreParentAfterModal(parent, () =>");
    expect(source).toContain("parent.setFocusable(true)");
    expect(source).toContain("parent.focus()");
    expect(source).toContain("setImmediate(callback)");
    expect(source.indexOf("parent.setFocusable(true)")).toBeLessThan(
      source.indexOf("entry.resolve(entry.completed ? entry.result : null)"),
    );
    expect(source).toContain("setActiveWindowId(parent.id)");
    expect(source).toContain("rebuildApplicationMenu()");
  });

  it("uses an OS-native message box for discarding changed settings", () => {
    expect(source).toContain("dialog.showMessageBox(win");
    expect(source).toContain('buttons: ["キャンセルする", "続ける"]');
    expect(source).toContain("return result.response === 0");
  });
});
