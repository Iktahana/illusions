/**
 * Unit tests for the explorer ↔ tab path-sync helpers (#1868).
 *
 * Covers the three distinct explorer mutations that previously left open tabs
 * pointing at a stale `tab.file.path`, resurrecting the old path on the next
 * save:
 *   - rename / move of an open file
 *   - rename / move of a folder containing open files (fan-out)
 *   - delete of an open file or folder (descriptor detach, no resurrection)
 */

import { describe, it, expect } from "vitest";

import {
  applyTabDelete,
  applyTabRename,
  findTabsUnderPath,
  isPathAtOrUnder,
  rewritePath,
} from "@/lib/tab-manager/tab-path-sync";
import { isEditorTab } from "@/lib/tab-manager/tab-types";
import type { EditorTabState, TabState } from "@/lib/tab-manager/tab-types";
import { generateTabId } from "@/lib/tab-manager/types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeEditorTab(
  path: string | null,
  name: string,
  overrides?: Partial<EditorTabState>,
): EditorTabState {
  return {
    tabKind: "editor",
    id: generateTabId(),
    file: path === null ? null : { path, handle: null, name },
    content: "本文",
    lastSavedContent: "本文",
    isDirty: false,
    lastSavedTime: null,
    lastSaveWasAuto: false,
    isSaving: false,
    isPreview: false,
    fileType: ".mdi",
    fileSyncStatus: "clean",
    conflictDiskContent: null,
    ...overrides,
  };
}

function editorTabById(tabs: TabState[], id: string): EditorTabState {
  const tab = tabs.find((t) => t.id === id);
  if (!tab || !isEditorTab(tab)) throw new Error("expected editor tab");
  return tab;
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

describe("isPathAtOrUnder", () => {
  it("matches the exact path", () => {
    expect(isPathAtOrUnder("a/b.mdi", "a/b.mdi")).toBe(true);
  });

  it("matches descendants of a directory", () => {
    expect(isPathAtOrUnder("dir/sub/file.mdi", "dir")).toBe(true);
    expect(isPathAtOrUnder("dir/file.mdi", "dir")).toBe(true);
  });

  it("does not match sibling prefixes (no false positive on name overlap)", () => {
    // "dir2" must NOT be considered under "dir".
    expect(isPathAtOrUnder("dir2/file.mdi", "dir")).toBe(false);
    expect(isPathAtOrUnder("formatting-2.mdi", "formatting.mdi")).toBe(false);
  });
});

describe("rewritePath", () => {
  it("rewrites an exact file rename", () => {
    expect(rewritePath("a.mdi", "a.mdi", "b.mdi")).toBe("b.mdi");
  });

  it("rewrites nested paths under a renamed directory", () => {
    expect(rewritePath("old/c1/file.mdi", "old", "new")).toBe("new/c1/file.mdi");
  });

  it("returns null for unaffected paths", () => {
    expect(rewritePath("other.mdi", "a.mdi", "b.mdi")).toBeNull();
    expect(rewritePath("dir2/x.mdi", "dir", "renamed")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Rename / move
// ---------------------------------------------------------------------------

describe("applyTabRename", () => {
  it("updates the path and name of a renamed open file", () => {
    const tab = makeEditorTab("formatting.mdi", "formatting.mdi", { isDirty: true });
    const { tabs, changed } = applyTabRename([tab], "formatting.mdi", "formatting-renamed.mdi");

    expect(changed).toBe(true);
    const updated = editorTabById(tabs, tab.id);
    expect(updated.file?.path).toBe("formatting-renamed.mdi");
    expect(updated.file?.name).toBe("formatting-renamed.mdi");
    // Content / dirty state preserved (byte-preserving).
    expect(updated.content).toBe("本文");
    expect(updated.isDirty).toBe(true);
  });

  it("recomputes fileType when the extension changes", () => {
    const tab = makeEditorTab("note.mdi", "note.mdi");
    const { tabs } = applyTabRename([tab], "note.mdi", "note.md");
    expect(editorTabById(tabs, tab.id).fileType).toBe(".md");
  });

  it("fans out to every tab under a renamed/moved folder", () => {
    const a = makeEditorTab("chapter/a.mdi", "a.mdi");
    const b = makeEditorTab("chapter/sub/b.mdi", "b.mdi");
    const unrelated = makeEditorTab("other.mdi", "other.mdi");

    const { tabs, changed } = applyTabRename([a, b, unrelated], "chapter", "part1");

    expect(changed).toBe(true);
    expect(editorTabById(tabs, a.id).file?.path).toBe("part1/a.mdi");
    expect(editorTabById(tabs, b.id).file?.path).toBe("part1/sub/b.mdi");
    // Unrelated tab is untouched (same reference).
    expect(tabs.find((t) => t.id === unrelated.id)).toBe(unrelated);
  });

  it("does not touch sibling files that merely share a name prefix", () => {
    const tab = makeEditorTab("formatting-2.mdi", "formatting-2.mdi");
    const { tabs, changed } = applyTabRename([tab], "formatting.mdi", "renamed.mdi");
    expect(changed).toBe(false);
    expect(tabs).toBe(tabs); // same array (no change)
    expect(editorTabById(tabs, tab.id).file?.path).toBe("formatting-2.mdi");
  });

  it("is a no-op when old === new", () => {
    const tab = makeEditorTab("a.mdi", "a.mdi");
    const result = applyTabRename([tab], "a.mdi", "a.mdi");
    expect(result.changed).toBe(false);
    expect(result.tabs).toBe(result.tabs);
  });
});

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

describe("findTabsUnderPath", () => {
  it("lists the affected file tab with dirty flag", () => {
    const tab = makeEditorTab("a.mdi", "a.mdi", { isDirty: true });
    const affected = findTabsUnderPath([tab], "a.mdi");
    expect(affected).toEqual([{ id: tab.id, path: "a.mdi", name: "a.mdi", isDirty: true }]);
  });

  it("lists every tab under a deleted folder", () => {
    const a = makeEditorTab("dir/a.mdi", "a.mdi", { isDirty: true });
    const b = makeEditorTab("dir/sub/b.mdi", "b.mdi");
    const outside = makeEditorTab("dir2/c.mdi", "c.mdi");

    const affected = findTabsUnderPath([a, b, outside], "dir");
    expect(affected.map((t) => t.id).sort()).toEqual([a.id, b.id].sort());
  });
});

describe("applyTabDelete", () => {
  it("detaches the descriptor of a deleted file so it cannot be resurrected", () => {
    const tab = makeEditorTab("a.mdi", "a.mdi");
    const { tabs, changed } = applyTabDelete([tab], "a.mdi");

    expect(changed).toBe(true);
    const updated = editorTabById(tabs, tab.id);
    // No path/handle → save executor's project-VFS branch is skipped and
    // background auto-save's `!tab.file` guard skips the tab.
    expect(updated.file).toBeNull();
    // Content survives; tab is flagged unsaved.
    expect(updated.content).toBe("本文");
    expect(updated.isDirty).toBe(true);
    expect(updated.fileSyncStatus).toBe("dirty");
  });

  it("detaches every tab under a deleted folder, leaving siblings intact", () => {
    const a = makeEditorTab("dir/a.mdi", "a.mdi");
    const b = makeEditorTab("dir/sub/b.mdi", "b.mdi");
    const outside = makeEditorTab("dir2/c.mdi", "c.mdi");

    const { tabs } = applyTabDelete([a, b, outside], "dir");

    expect(editorTabById(tabs, a.id).file).toBeNull();
    expect(editorTabById(tabs, b.id).file).toBeNull();
    // The sibling folder's tab keeps its descriptor.
    expect(editorTabById(tabs, outside.id).file?.path).toBe("dir2/c.mdi");
  });

  it("is a no-op when no open tab matches", () => {
    const tab = makeEditorTab("a.mdi", "a.mdi");
    const result = applyTabDelete([tab], "b.mdi");
    expect(result.changed).toBe(false);
    expect(editorTabById(result.tabs, tab.id).file?.path).toBe("a.mdi");
  });
});

// ---------------------------------------------------------------------------
// Resurrection-prevention contract (the core of #1868)
// ---------------------------------------------------------------------------

describe("stale-path resurrection prevention (#1868)", () => {
  it("after rename, the tab targets ONLY the new path (no old-path write)", () => {
    const tab = makeEditorTab("formatting.mdi", "formatting.mdi", { isDirty: true });
    const { tabs } = applyTabRename([tab], "formatting.mdi", "formatting-renamed.mdi");
    const updated = editorTabById(tabs, tab.id);
    // The save executor writes to `tab.file.path` — it must now be the new path.
    expect(updated.file?.path).toBe("formatting-renamed.mdi");
    expect(updated.file?.path).not.toBe("formatting.mdi");
  });

  it("after delete, the tab has no path for any save flow to write back to", () => {
    const tab = makeEditorTab("formatting.mdi", "formatting.mdi", { isDirty: true });
    const { tabs } = applyTabDelete([tab], "formatting.mdi");
    expect(editorTabById(tabs, tab.id).file?.path ?? null).toBeNull();
  });
});
