import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const fileIpc = readFileSync(path.resolve(here, "../file-ipc.js"), "utf8");
const vfsIpc = readFileSync(path.resolve(here, "../vfs-ipc.js"), "utf8");

describe("native file dialog parent-window contract", () => {
  it("attaches the welcome/editor open-file panel to its IPC sender", () => {
    expect(fileIpc).toContain("BrowserWindow?.fromWebContents?.(event.sender)");
    expect(fileIpc).toContain("dialog.showOpenDialog(parent, options)");
    expect(fileIpc).toContain("showOpenDialogForEvent(event, {");
    expect(fileIpc).not.toContain("dialog.showOpenDialog({");
  });

  it("attaches create-project, open-project and VFS open-file panels", () => {
    expect(vfsIpc).toContain("BrowserWindow?.fromWebContents?.(event.sender)");
    expect(vfsIpc).toContain("dialog.showOpenDialog(parent, options)");
    expect(vfsIpc.match(/showOpenDialogForEvent\(event, \{/g)).toHaveLength(3);
    expect(vfsIpc).not.toContain("dialog.showOpenDialog({");
    expect(vfsIpc).not.toContain("dialog.showOpenDialog(win ?? undefined");
  });
});
