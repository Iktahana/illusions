import { describe, expect, it } from "vitest";

const { buildEditorContextMenuTemplate } = require("../../lib/editor-command-registry.js");

describe("editor context menu contract", () => {
  it("resolves allowlisted IDs to Japanese native editing roles", () => {
    expect(
      buildEditorContextMenuTemplate([
        { command: "edit.undo", enabled: true },
        { command: "edit.redo", enabled: false },
        { separator: true },
        { command: "edit.cut", enabled: false },
        { command: "edit.copy", enabled: true },
        { command: "edit.paste", enabled: false },
        { separator: true },
        { command: "edit.selectAll", enabled: true },
      ]),
    ).toEqual([
      { label: "取り消す", accelerator: "CmdOrCtrl+Z", role: "undo", enabled: true },
      { label: "やり直す", accelerator: "CmdOrCtrl+Shift+Z", role: "redo", enabled: false },
      { type: "separator" },
      { label: "切り取り", accelerator: "CmdOrCtrl+X", role: "cut", enabled: false },
      { label: "コピー", accelerator: "CmdOrCtrl+C", role: "copy", enabled: true },
      { label: "貼り付け", accelerator: "CmdOrCtrl+V", role: "paste", enabled: false },
      { type: "separator" },
      {
        label: "すべて選択",
        accelerator: "CmdOrCtrl+A",
        role: "selectAll",
        enabled: true,
      },
    ]);
  });

  it.each<unknown>([
    null,
    [],
    [{ command: "edit.paste", enabled: true }],
    [
      { command: "edit.undo", enabled: true },
      { command: "edit.redo", enabled: true },
      { command: "edit.cut", enabled: true },
      { command: "edit.copy", enabled: true },
      { command: "edit.paste", enabled: true },
      { separator: true },
      { command: "edit.selectAll", enabled: true },
    ],
    [
      { command: "edit.undo", enabled: true },
      { command: "edit.redo", enabled: true },
      { separator: true },
      { command: "edit.cut", enabled: true },
      { command: "edit.copy", enabled: true },
      { command: "edit.paste", enabled: true },
      { command: "edit.selectAll", enabled: true },
      { separator: true },
    ],
    [{ command: "system.deleteEverything", enabled: true }],
    [{ command: "edit.copy", enabled: "yes" }],
    [{ separator: true, label: "injected" }],
    [{ label: "任意", action: "arbitrary" }],
  ])("rejects malformed or renderer-defined menu input", (items) => {
    expect(buildEditorContextMenuTemplate(items)).toBeNull();
  });
});
