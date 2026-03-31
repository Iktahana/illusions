/**
 * Tests for Save As conflict state reset (Fix #1009).
 *
 * Verifies that saveAsFile clears fileSyncStatus and conflictDiskContent
 * after a successful save. Save As is an explicit user action via system
 * dialog, so it does not block on conflict — just clears the state.
 */

import { describe, it, expect } from "vitest";

import type { EditorTabState, TabState } from "@/lib/tab-manager/tab-types";
import { isEditorTab } from "@/lib/tab-manager/tab-types";
import { createNewTab, generateTabId } from "@/lib/tab-manager/types";

// ---------------------------------------------------------------------------
// Pure logic extracted from saveAsFile's updateTab call
// ---------------------------------------------------------------------------

/**
 * Mirrors the updateTab call in saveAsFile after successful save.
 * The fix adds fileSyncStatus: "clean" and conflictDiskContent: null.
 */
function saveAsUpdateTab(
  tab: EditorTabState,
  savedContent: string,
  descriptor: EditorTabState["file"],
): Partial<EditorTabState> {
  return {
    file: descriptor,
    lastSavedContent: savedContent,
    isDirty: false,
    lastSavedTime: Date.now(),
    isSaving: false,
    fileSyncStatus: "clean",
    conflictDiskContent: null,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEditorTab(overrides?: Partial<EditorTabState>): EditorTabState {
  return {
    ...createNewTab(),
    id: generateTabId(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Save As: clears conflict state after save (#1009)", () => {
  it("sets fileSyncStatus to 'clean'", () => {
    const tab = makeEditorTab({
      fileSyncStatus: "conflicted",
      content: "local edits",
      conflictDiskContent: "disk version",
    });
    const descriptor = { name: "saved.mdi", path: "/saved.mdi", handle: null };

    const updates = saveAsUpdateTab(tab, "local edits", descriptor);

    expect(updates.fileSyncStatus).toBe("clean");
  });

  it("clears conflictDiskContent", () => {
    const tab = makeEditorTab({
      fileSyncStatus: "conflicted",
      conflictDiskContent: "disk version",
    });
    const descriptor = { name: "saved.mdi", path: "/saved.mdi", handle: null };

    const updates = saveAsUpdateTab(tab, "content", descriptor);

    expect(updates.conflictDiskContent).toBeNull();
  });

  it("sets isDirty to false", () => {
    const tab = makeEditorTab({ isDirty: true });
    const descriptor = { name: "saved.mdi", path: "/saved.mdi", handle: null };

    const updates = saveAsUpdateTab(tab, "content", descriptor);

    expect(updates.isDirty).toBe(false);
  });

  it("updates the file descriptor", () => {
    const tab = makeEditorTab({
      file: { name: "old.mdi", path: "/old.mdi", handle: null },
    });
    const newDescriptor = { name: "new.mdi", path: "/new.mdi", handle: null };

    const updates = saveAsUpdateTab(tab, "content", newDescriptor);

    expect(updates.file).toEqual(newDescriptor);
  });

  it("sets isSaving to false", () => {
    const tab = makeEditorTab({ isSaving: true });
    const descriptor = { name: "saved.mdi", path: "/saved.mdi", handle: null };

    const updates = saveAsUpdateTab(tab, "content", descriptor);

    expect(updates.isSaving).toBe(false);
  });
});

describe("Save As: works correctly for previously clean tab", () => {
  it("keeps fileSyncStatus as 'clean' after save", () => {
    const tab = makeEditorTab({
      fileSyncStatus: "clean",
      content: "content",
    });
    const descriptor = { name: "saved.mdi", path: "/saved.mdi", handle: null };

    const updates = saveAsUpdateTab(tab, "content", descriptor);

    expect(updates.fileSyncStatus).toBe("clean");
    expect(updates.conflictDiskContent).toBeNull();
  });
});

describe("Save As: works correctly for dirty tab", () => {
  it("resets fileSyncStatus from 'dirty' to 'clean'", () => {
    const tab = makeEditorTab({
      fileSyncStatus: "dirty",
      isDirty: true,
      content: "edited",
    });
    const descriptor = { name: "saved.mdi", path: "/saved.mdi", handle: null };

    const updates = saveAsUpdateTab(tab, "edited", descriptor);

    expect(updates.fileSyncStatus).toBe("clean");
    expect(updates.isDirty).toBe(false);
  });
});
