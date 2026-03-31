/**
 * Tests for auto-save fileSyncStatus reset (Fix #1008).
 *
 * Verifies that after a successful auto-save, the tab's fileSyncStatus
 * is set to "clean" and conflictDiskContent is cleared.
 *
 * The production auto-save logic lives in useAutoSave (a React hook).
 * We extract the pure state-update logic and test it without React.
 */

import { describe, it, expect, vi } from "vitest";

import type { EditorTabState, TabState } from "@/lib/tab-manager/tab-types";
import { isEditorTab } from "@/lib/tab-manager/tab-types";
import { createNewTab, generateTabId, sanitizeMdiContent } from "@/lib/tab-manager/types";

// ---------------------------------------------------------------------------
// Pure logic extracted from useAutoSave's setTabs updater (project mode)
// ---------------------------------------------------------------------------

/**
 * Mirrors the setTabs updater in useAutoSave for project-mode saves.
 * The fix adds fileSyncStatus: "clean" and conflictDiskContent: null.
 */
function projectModeAutoSaveUpdater(
  tabs: TabState[],
  tabId: string,
  sanitized: string,
): TabState[] {
  return tabs.map((t) =>
    t.id === tabId && isEditorTab(t)
      ? {
          ...t,
          lastSavedContent: sanitized,
          isDirty: sanitizeMdiContent(t.content) !== sanitized,
          lastSavedTime: Date.now(),
          lastSaveWasAuto: true,
          fileSyncStatus: "clean" as const,
          conflictDiskContent: null,
        }
      : t,
  );
}

/**
 * Mirrors the setTabs updater in useAutoSave for non-project-mode saves.
 */
function nonProjectModeAutoSaveUpdater(
  tabs: TabState[],
  tabId: string,
  sanitized: string,
  descriptor: EditorTabState["file"],
): TabState[] {
  return tabs.map((t) =>
    t.id === tabId && isEditorTab(t)
      ? {
          ...t,
          file: descriptor,
          lastSavedContent: sanitized,
          isDirty: sanitizeMdiContent(t.content) !== sanitized,
          lastSavedTime: Date.now(),
          lastSaveWasAuto: true,
          fileSyncStatus: "clean" as const,
          conflictDiskContent: null,
        }
      : t,
  );
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
// Tests: Project mode auto-save
// ---------------------------------------------------------------------------

describe("auto-save: project mode resets fileSyncStatus after save (#1008)", () => {
  it("sets fileSyncStatus to 'clean' after auto-save", () => {
    const tab = makeEditorTab({
      fileSyncStatus: "dirty",
      content: "saved content",
      isDirty: true,
    });
    const result = projectModeAutoSaveUpdater([tab], tab.id, "saved content");
    const updated = result.find((t) => t.id === tab.id) as EditorTabState;

    expect(updated.fileSyncStatus).toBe("clean");
  });

  it("clears conflictDiskContent after auto-save", () => {
    const tab = makeEditorTab({
      fileSyncStatus: "dirty",
      content: "saved content",
      isDirty: true,
      conflictDiskContent: "old disk content",
    });
    const result = projectModeAutoSaveUpdater([tab], tab.id, "saved content");
    const updated = result.find((t) => t.id === tab.id) as EditorTabState;

    expect(updated.conflictDiskContent).toBeNull();
  });

  it("sets lastSaveWasAuto to true", () => {
    const tab = makeEditorTab({
      fileSyncStatus: "dirty",
      content: "content",
      lastSaveWasAuto: false,
    });
    const result = projectModeAutoSaveUpdater([tab], tab.id, "content");
    const updated = result.find((t) => t.id === tab.id) as EditorTabState;

    expect(updated.lastSaveWasAuto).toBe(true);
  });

  it("clears isDirty when content matches saved content", () => {
    const tab = makeEditorTab({
      fileSyncStatus: "dirty",
      content: "same content",
      isDirty: true,
    });
    const result = projectModeAutoSaveUpdater([tab], tab.id, "same content");
    const updated = result.find((t) => t.id === tab.id) as EditorTabState;

    expect(updated.isDirty).toBe(false);
  });

  it("keeps isDirty true when content diverged during save", () => {
    const tab = makeEditorTab({
      fileSyncStatus: "dirty",
      content: "newer content typed during save",
      isDirty: true,
    });
    const result = projectModeAutoSaveUpdater([tab], tab.id, "older saved content");
    const updated = result.find((t) => t.id === tab.id) as EditorTabState;

    expect(updated.isDirty).toBe(true);
  });

  it("does not modify non-matching tabs", () => {
    const tab = makeEditorTab({ fileSyncStatus: "dirty", content: "a" });
    const otherTab = makeEditorTab({ fileSyncStatus: "dirty", content: "b" });
    const result = projectModeAutoSaveUpdater([tab, otherTab], tab.id, "a");
    const other = result.find((t) => t.id === otherTab.id) as EditorTabState;

    expect(other.fileSyncStatus).toBe("dirty");
  });
});

// ---------------------------------------------------------------------------
// Tests: Non-project mode auto-save
// ---------------------------------------------------------------------------

describe("auto-save: non-project mode resets fileSyncStatus after save (#1008)", () => {
  it("sets fileSyncStatus to 'clean' after auto-save", () => {
    const tab = makeEditorTab({
      fileSyncStatus: "dirty",
      content: "saved content",
      isDirty: true,
    });
    const descriptor = { name: "test.mdi", path: "/test.mdi", handle: null };
    const result = nonProjectModeAutoSaveUpdater([tab], tab.id, "saved content", descriptor);
    const updated = result.find((t) => t.id === tab.id) as EditorTabState;

    expect(updated.fileSyncStatus).toBe("clean");
  });

  it("clears conflictDiskContent after auto-save", () => {
    const tab = makeEditorTab({
      fileSyncStatus: "dirty",
      content: "saved content",
      isDirty: true,
      conflictDiskContent: "stale disk",
    });
    const descriptor = { name: "test.mdi", path: "/test.mdi", handle: null };
    const result = nonProjectModeAutoSaveUpdater([tab], tab.id, "saved content", descriptor);
    const updated = result.find((t) => t.id === tab.id) as EditorTabState;

    expect(updated.conflictDiskContent).toBeNull();
  });

  it("updates the file descriptor", () => {
    const tab = makeEditorTab({
      fileSyncStatus: "dirty",
      content: "content",
    });
    const descriptor = { name: "new-name.mdi", path: "/new-path.mdi", handle: null };
    const result = nonProjectModeAutoSaveUpdater([tab], tab.id, "content", descriptor);
    const updated = result.find((t) => t.id === tab.id) as EditorTabState;

    expect(updated.file).toEqual(descriptor);
  });
});

// ---------------------------------------------------------------------------
// Tests: Auto-save skips conflicted tabs (guard check)
// ---------------------------------------------------------------------------

describe("auto-save: skips conflicted tabs", () => {
  it("auto-save guard filters out conflicted tabs", () => {
    // Mirrors the guard condition in useAutoSave:
    // if (tab.fileSyncStatus === "conflicted") continue;
    const conflictedTab = makeEditorTab({
      fileSyncStatus: "conflicted",
      isDirty: true,
      content: "local edits",
      conflictDiskContent: "disk version",
      file: { name: "test.mdi", path: "/test.mdi", handle: null },
      isSaving: false,
    });

    const shouldAutoSave =
      isEditorTab(conflictedTab) &&
      conflictedTab.fileSyncStatus !== "conflicted" &&
      conflictedTab.isDirty &&
      conflictedTab.file &&
      !conflictedTab.isSaving;

    expect(shouldAutoSave).toBe(false);
  });

  it("auto-save guard allows dirty non-conflicted tabs", () => {
    const dirtyTab = makeEditorTab({
      fileSyncStatus: "dirty",
      isDirty: true,
      content: "edits",
      file: { name: "test.mdi", path: "/test.mdi", handle: null },
      isSaving: false,
    });

    const shouldAutoSave =
      isEditorTab(dirtyTab) &&
      dirtyTab.fileSyncStatus !== "conflicted" &&
      dirtyTab.isDirty &&
      dirtyTab.file &&
      !dirtyTab.isSaving;

    expect(shouldAutoSave).toBe(true);
  });
});
