import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { buildEditorContextMenu, commandRegistry } from "../registry";
const loadModule = createRequire(import.meta.url);
const { EDITOR_COMMANDS } = loadModule("../../../../electron/lib/editor-command-registry.js");

describe("editor command registry", () => {
  it("has unique allowlisted IDs and native roles", () => {
    expect(new Set(commandRegistry.map(({ id }) => id)).size).toBe(commandRegistry.length);
    expect(
      commandRegistry.filter(({ nativeRole }) => nativeRole).map(({ nativeRole }) => nativeRole),
    ).toEqual(["undo", "redo", "cut", "copy", "paste", "selectAll"]);
  });

  it("keeps renderer and Electron native metadata in parity", () => {
    const rendererNative = Object.fromEntries(
      commandRegistry
        .filter(({ nativeRole }) => nativeRole)
        .map(({ id, label, accelerator, nativeRole }) => [
          id,
          { label, accelerator, role: nativeRole },
        ]),
    );
    expect(EDITOR_COMMANDS).toEqual(rendererNative);
  });

  it("builds context menu enabled state from availability", () => {
    const availability = Object.fromEntries(
      commandRegistry.map(({ id }) => [id, id === "edit.copy"]),
    ) as never;
    const menu = buildEditorContextMenu(availability);
    expect(menu).toHaveLength(8);
    expect(menu).toContainEqual({ command: "edit.copy", enabled: true });
    expect(menu.filter((item) => "separator" in item)).toHaveLength(2);
  });
});
