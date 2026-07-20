/**
 * Unit tests for the panel-heal decision logic (#1875).
 *
 * computeMissingEditorPanels() is the pure core of the fix: it decides which
 * editor tabs need their dockview panel recreated to restore the tab ⇆ panel
 * invariant after dockview removes a panel out from under a still-pending tab.
 */

import { describe, it, expect } from "vitest";
import { computeMissingEditorPanels } from "../panel-heal";
import { createNewTab } from "@/lib/tab-manager/types";
import type { TabState, TerminalTabState, DiffTabState } from "@/lib/tab-manager/tab-types";

function makeTerminalTab(id: string): TerminalTabState {
  return {
    tabKind: "terminal",
    id,
    sessionId: id,
    pendingId: null,
    label: "term",
    cwd: "",
    shell: "",
    status: "running",
    exitCode: null,
    createdAt: 0,
    source: "user",
  };
}

function makeDiffTab(id: string): DiffTabState {
  return {
    tabKind: "diff",
    id,
    sourceTabId: "src",
    sourceFileName: "a.mdi",
    localContent: "",
    remoteContent: "",
    remoteTimestamp: 0,
  };
}

describe("#1875 computeMissingEditorPanels", () => {
  it("returns the editor tab whose panel is missing (dirty-close cancelled)", () => {
    const a = createNewTab("a");
    const b = createNewTab("b");
    const tabs: TabState[] = [a, b];
    // b's panel was removed by dockview but b is still in the tab list.
    const existing = new Set([a.id]);

    const missing = computeMissingEditorPanels(tabs, existing);

    expect(missing.map((t) => t.id)).toEqual([b.id]);
  });

  it("returns an empty list when every editor tab still has a panel", () => {
    const a = createNewTab("a");
    const b = createNewTab("b");
    const existing = new Set([a.id, b.id]);

    expect(computeMissingEditorPanels([a, b], existing)).toEqual([]);
  });

  it("ignores missing non-editor tabs (terminal / diff are removed eagerly)", () => {
    const editor = createNewTab("a");
    const term = makeTerminalTab("term-1");
    const diff = makeDiffTab("diff-1");
    // None of the panels exist, but only the editor tab should be healed.
    const existing = new Set<string>();

    const missing = computeMissingEditorPanels([editor, term, diff], existing);

    expect(missing.map((t) => t.id)).toEqual([editor.id]);
  });

  it("preserves tab order across multiple missing editor panels", () => {
    const a = createNewTab("a");
    const b = createNewTab("b");
    const c = createNewTab("c");
    const existing = new Set([b.id]); // a and c lost their panels

    const missing = computeMissingEditorPanels([a, b, c], existing);

    expect(missing.map((t) => t.id)).toEqual([a.id, c.id]);
  });

  it("returns nothing when there are no tabs", () => {
    expect(computeMissingEditorPanels([], new Set())).toEqual([]);
  });
});
