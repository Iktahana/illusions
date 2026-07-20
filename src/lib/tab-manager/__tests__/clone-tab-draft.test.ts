/**
 * Regression test for #1874 (P0 data loss): editor split created independent
 * buffers for the SAME file that silently overwrote each other on save.
 *
 * Root cause: cloneTab copied `source.file` so the clone shared the original
 * file path while holding an independent buffer; createNewTab also forced
 * isDirty=false, so a clone of a dirty buffer was reported clean.
 *
 * Fix: cloneTabState() detaches the file descriptor (file=null) and marks the
 * clone dirty, turning split into "duplicate as draft" that cannot save to the
 * original path. These tests exercise the production helper directly.
 */

import { describe, it, expect } from "vitest";

import type { EditorTabState } from "@/lib/tab-manager/tab-types";
import { cloneTabState, createNewTab } from "@/lib/tab-manager/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a saved, file-backed editor tab (simulates an opened document). */
function makeSavedFileTab(path: string, content: string): EditorTabState {
  const tab = createNewTab(content);
  tab.file = { path, handle: null, name: "doc.mdi" };
  tab.lastSavedContent = content;
  tab.isDirty = false;
  return tab;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("cloneTabState — independent draft clone (#1874)", () => {
  it("(a) cloning a dirty buffer yields a clone with file=null and isDirty=true", () => {
    const source = makeSavedFileTab("/Users/x/novel.mdi", "saved text");
    // Source becomes dirty (unsaved edits in pane A)
    source.content = "saved text + unsaved edits";
    source.isDirty = true;

    const clone = cloneTabState(source);

    expect(clone.file).toBeNull();
    expect(clone.isDirty).toBe(true);
    // Content is carried over so the user keeps their work as a draft
    expect(clone.content).toBe("saved text + unsaved edits");
  });

  it("(b) clone shares NO path with source — cannot save to the original file", () => {
    const source = makeSavedFileTab("/Users/x/novel.mdi", "body");

    const clone = cloneTabState(source);

    // No path means the save pipeline must prompt for a destination (Save As),
    // so it can never silently overwrite the source path.
    expect(clone.file?.path ?? null).toBeNull();
    expect(clone.file?.path).not.toBe(source.file?.path);
  });

  it("(c) editing the clone does not mutate the source tab", () => {
    const source = makeSavedFileTab("/Users/x/novel.mdi", "original");

    const clone = cloneTabState(source);
    clone.content = "clone edited";
    clone.isDirty = true;

    // Source is untouched
    expect(source.content).toBe("original");
    expect(source.isDirty).toBe(false);
    expect(source.file?.path).toBe("/Users/x/novel.mdi");
    // Distinct tab ids guarantee setContent/setTabContent target only one tab
    expect(clone.id).not.toBe(source.id);
  });

  it("clone of a CLEAN file-backed tab is still detached and dirty (no hidden-clean clone)", () => {
    const source = makeSavedFileTab("/Users/x/novel.mdi", "clean body");
    expect(source.isDirty).toBe(false);

    const clone = cloneTabState(source);

    expect(clone.file).toBeNull();
    // Born dirty: the unsaved draft is never silently discarded on close
    expect(clone.isDirty).toBe(true);
  });

  it("regression guard: the OLD clone logic shared the path and reported clean", () => {
    const source = makeSavedFileTab("/Users/x/novel.mdi", "body");
    source.content = "dirty body";
    source.isDirty = true;

    // Reproduce the pre-fix behaviour: copy file descriptor, keep createNewTab's
    // forced isDirty=false.
    const broken = createNewTab(source.content, source.fileType);
    broken.file = source.file;

    // The bug: same path + reported clean despite a dirty source buffer.
    expect(broken.file?.path).toBe(source.file?.path);
    expect(broken.isDirty).toBe(false);

    // The fix avoids both.
    const fixed = cloneTabState(source);
    expect(fixed.file).toBeNull();
    expect(fixed.isDirty).toBe(true);
  });
});
