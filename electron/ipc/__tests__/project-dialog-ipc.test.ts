import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.resolve(here, "../project-dialog-ipc.js"), "utf8");

describe("native create-project dialog smoke contract", () => {
  it("creates a modal child with the bundled preload and compositor background", () => {
    expect(source).toContain("getCenteredWindowPosition(parent, width, height)");
    expect(source).toContain("const height = 540");
    expect(source).toContain("minHeight: 480");
    expect(source).toContain("...macWindowOptions");
    expect(source).toContain("alwaysOnTop: true");
    expect(source).toContain('win.setAlwaysOnTop(true, "modal-panel")');
    expect(source).toContain("parent.setFocusable(false)");
    expect(source).toContain(": { parent, modal: true }");
    expect(source).toContain('preload: path.join(__dirname, "preload.js")');
    expect(source).toContain("nativeTheme.shouldUseDarkColors");
    expect(source).toContain("?create-project");
  });

  it("returns settings and restores the parent editor after closing", () => {
    expect(source).toContain('[".mdi", ".md", ".txt"].includes(result.fileExtension)');
    expect(source).toContain("entry.result = result ?? null");
    expect(source).toContain("restoreParentAfterModal(parent, () =>");
    expect(source).toContain("entry.resolve(entry.completed ? entry.result : null)");
    expect(source.indexOf("entry.result = result ?? null")).toBeLessThan(
      source.indexOf("BrowserWindow.fromWebContents(event.sender)?.close()"),
    );
    expect(source).toContain("parent.setFocusable(true)");
    expect(source).toContain("setImmediate(callback)");
    expect(source).toContain("win.focus()");
    expect(source.indexOf("parent.setFocusable(true)")).toBeLessThan(
      source.indexOf("entry.resolve(entry.completed ? entry.result : null)"),
    );
    expect(source).toContain("setActiveWindowId(parent.id)");
  });
});
