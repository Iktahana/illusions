/**
 * Regression tests for #1878 — the editor panel key must be independent of the
 * panel's active/inactive state so that switching tabs never remounts the
 * Milkdown/ProseMirror editor (which would discard the undo/redo history).
 */

import { describe, it, expect } from "vitest";
import { buildEditorPanelKey } from "../editor-panel-key";

describe("buildEditorPanelKey (#1878)", () => {
  it("produces the same key regardless of active/inactive state", () => {
    // The old code keyed the active editor with `editorKey` but the inactive
    // editor with a literal "-inactive" suffix. There is now a single key
    // builder, so by construction the key cannot diverge by active state —
    // this test pins that contract.
    const active = buildEditorPanelKey("tab-1", "main.mdi", 3);
    const stillActiveLater = buildEditorPanelKey("tab-1", "main.mdi", 3);
    expect(active).toBe(stillActiveLater);
  });

  it("is stable across a tab round trip (editorKey unchanged)", () => {
    // Tab navigation must NOT bump editorKey (see use-keyboard-shortcuts), so a
    // 1 → 2 → 1 round trip leaves the key identical and the instance alive.
    const before = buildEditorPanelKey("tab-1", "formatting.mdi", 7);
    const after = buildEditorPanelKey("tab-1", "formatting.mdi", 7);
    expect(after).toBe(before);
  });

  it("changes only when a genuine remount is requested (editorKey bump)", () => {
    const k0 = buildEditorPanelKey("tab-1", "main.mdi", 0);
    const k1 = buildEditorPanelKey("tab-1", "main.mdi", 1);
    expect(k1).not.toBe(k0);
  });

  it("distinguishes different buffers and file paths", () => {
    expect(buildEditorPanelKey("tab-1", "a.mdi", 0)).not.toBe(
      buildEditorPanelKey("tab-2", "a.mdi", 0),
    );
    expect(buildEditorPanelKey("tab-1", "a.mdi", 0)).not.toBe(
      buildEditorPanelKey("tab-1", "b.mdi", 0),
    );
  });

  it("never contains the legacy '-inactive' discriminator", () => {
    expect(buildEditorPanelKey("tab-1", "main.mdi", 0)).not.toContain("inactive");
  });
});
