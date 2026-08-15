import { describe, expect, it } from "vitest";

const { buildEditorContextMenuTemplate } = require("../../lib/editor-command-registry.js");

const validMenu = () => [
  { command: "edit.undo", enabled: true },
  { command: "edit.redo", enabled: true },
  { separator: true },
  { command: "edit.cut", enabled: true },
  { command: "edit.copy", enabled: true },
  { command: "edit.paste", enabled: true },
  { separator: true },
  { command: "edit.selectAll", enabled: true },
  { separator: true },
  { command: "format.ruby", enabled: true },
  { separator: true },
  { command: "format.tcy", enabled: true },
  { command: "speech.toggle", enabled: true },
  { command: "speech.stop", enabled: true },
];

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
        { separator: true },
        { command: "format.ruby", enabled: false },
        { separator: true },
        { command: "format.tcy", enabled: true },
        { command: "speech.toggle", enabled: true },
        { command: "speech.stop", enabled: false },
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
      { type: "separator" },
      {
        label: "ルビを設定",
        accelerator: "CmdOrCtrl+Shift+R",
        enabled: false,
        command: "format.ruby",
      },
      { type: "separator" },
      {
        label: "縦中横を切替",
        accelerator: "CmdOrCtrl+Shift+T",
        enabled: true,
        command: "format.tcy",
      },
      {
        label: "読み上げ／一時停止",
        accelerator: "CmdOrCtrl+Alt+S",
        enabled: true,
        command: "speech.toggle",
      },
      {
        label: "読み上げを停止",
        accelerator: undefined,
        enabled: false,
        command: "speech.stop",
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
      { separator: true },
      { command: "format.ruby", enabled: true },
      { separator: true },
    ],
    [
      { command: "edit.undo", enabled: true },
      { command: "edit.redo", enabled: true },
      { separator: true },
      { command: "edit.cut", enabled: true },
      { command: "edit.copy", enabled: true },
      { command: "edit.paste", enabled: true },
      { separator: true },
      { command: "edit.selectAll", enabled: true },
      { separator: true },
      { command: "format.tcy", enabled: true },
    ],
    [{ command: "system.deleteEverything", enabled: true }],
    [{ command: "edit.copy", enabled: "yes" }],
    [{ separator: true, label: "injected" }],
    [{ label: "任意", action: "arbitrary" }],
    [
      { command: "edit.undo", enabled: true },
      { command: "edit.redo", enabled: true },
      { separator: true },
      { command: "edit.cut", enabled: true },
      { command: "edit.copy", enabled: true },
      { command: "edit.paste", enabled: true },
      { separator: true },
      { command: "edit.selectAll", enabled: true },
      { separator: true },
      { command: "format.strong", enabled: true },
    ],
  ])("rejects malformed or renderer-defined menu input", (items) => {
    expect(buildEditorContextMenuTemplate(items)).toBeNull();
  });

  it("rejects malformed entries even when the template length is correct", () => {
    const malformedSeparator = validMenu();
    malformedSeparator[2] = { separator: true, label: "injected" } as never;
    expect(buildEditorContextMenuTemplate(malformedSeparator)).toBeNull();

    const malformedCommand = validMenu();
    malformedCommand[4] = { command: "edit.copy", enabled: "yes" } as never;
    expect(buildEditorContextMenuTemplate(malformedCommand)).toBeNull();

    const wrongAllowlistedCommand = validMenu();
    wrongAllowlistedCommand[4] = { command: "edit.cut", enabled: true };
    expect(buildEditorContextMenuTemplate(wrongAllowlistedCommand)).toBeNull();
  });
});
