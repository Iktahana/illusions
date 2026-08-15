import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.resolve(here, "../ruby-dialog-ipc.js"), "utf8");

describe("native Ruby dialog smoke contract", () => {
  it("creates a modal child window with the bundled preload and Ruby route", () => {
    expect(source).toContain("getCenteredWindowPosition(parent, width, height)");
    expect(source).toContain("const width = 720");
    expect(source).toContain("const height = 680");
    expect(source).toContain("...macWindowOptions");
    expect(source).toContain('preload: path.join(__dirname, "preload.js")');
    expect(source).toContain('backgroundColor: "#00000000"');
    expect(source).toContain("?ruby-dialog");
  });

  it("allowlists the request/result payload shapes and resolves cancellation on close", () => {
    expect(source).toContain("function isValidRubyDialogRequest");
    expect(source).toContain("function isValidRubyDialogResult");
    expect(source).toContain("result.action === \"remove\"");
    expect(source).toContain("result.action === \"apply\"");
    expect(source).toContain("entry.result = result ?? null");
    expect(source).toContain("entry.resolve(entry.completed ? entry.result : null)");
  });

  it("restores the parent editor window after the dialog closes", () => {
    expect(source).toContain("restoreParentAfterModal(parent, () =>");
    expect(source).toContain("parent.setFocusable(true)");
    expect(source).toContain("parent.focus()");
    expect(source).toContain("setActiveWindowId(parent.id)");
    expect(source).toContain("rebuildApplicationMenu()");
  });
});
