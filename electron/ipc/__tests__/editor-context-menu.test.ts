import { describe, expect, it } from "vitest";

const { buildEditorContextMenuTemplate } = require("../../lib/editor-command-registry.js");

describe("editor context menu contract", () => {
  it("resolves allowlisted IDs to Japanese native editing roles", () => {
    expect(
      buildEditorContextMenuTemplate([
        { command: "edit.copy", enabled: true },
        { separator: true },
        { command: "edit.paste", enabled: false },
      ]),
    ).toEqual([
      { label: "コピー", accelerator: "CmdOrCtrl+C", role: "copy", enabled: true },
      { type: "separator" },
      { label: "貼り付け", accelerator: "CmdOrCtrl+V", role: "paste", enabled: false },
    ]);
  });

  it.each<unknown>([
    null,
    [],
    [{ command: "system.deleteEverything", enabled: true }],
    [{ command: "edit.copy", enabled: "yes" }],
    [{ separator: true, label: "injected" }],
    [{ label: "任意", action: "arbitrary" }],
  ])("rejects malformed or renderer-defined menu input", (items) => {
    expect(buildEditorContextMenuTemplate(items)).toBeNull();
  });
});
