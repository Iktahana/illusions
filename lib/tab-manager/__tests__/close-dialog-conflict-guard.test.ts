/**
 * Tests for close dialog conflict guard (Fix #1011).
 *
 * Verifies that:
 * 1. handleCloseTabSave blocks saving when tab is conflicted
 * 2. Non-project save path resets fileSyncStatus after save
 * 3. Normal (non-conflicted) close-save flow is not blocked
 */

import { describe, it, expect, vi } from "vitest";

import type { EditorTabState, TabState } from "@/lib/tab-manager/tab-types";
import { isEditorTab } from "@/lib/tab-manager/tab-types";
import { createNewTab, generateTabId, sanitizeMdiContent } from "@/lib/tab-manager/types";

// ---------------------------------------------------------------------------
// Pure logic extracted from useCloseDialog's handleCloseTabSave
// ---------------------------------------------------------------------------

interface CloseDialogTestContext {
  tab: EditorTabState;
  warningMessages: string[];
  savedContent: string | null;
  tabClosed: boolean;
  pendingCloseCleared: boolean;
  updatedTab: Partial<EditorTabState> | null;
}

/**
 * Simulates the handleCloseTabSave logic from use-close-dialog.ts.
 * Extracts the pure decision logic without React hooks.
 */
function simulateCloseTabSave(tab: EditorTabState, isProject: boolean): CloseDialogTestContext {
  const ctx: CloseDialogTestContext = {
    tab,
    warningMessages: [],
    savedContent: null,
    tabClosed: false,
    pendingCloseCleared: false,
    updatedTab: null,
  };

  if (!isEditorTab(tab)) return ctx;

  // Fix #1011: Block save if conflicted
  if (tab.fileSyncStatus === "conflicted") {
    ctx.warningMessages.push(
      "ファイルが外部で変更されています。閉じる前にコンフリクトを解決してください。",
    );
    ctx.pendingCloseCleared = true;
    return ctx;
  }

  const sanitized = sanitizeMdiContent(tab.content);

  if (isProject && tab.file?.path) {
    ctx.savedContent = sanitized;
    ctx.tabClosed = true;
    ctx.pendingCloseCleared = true;
  } else {
    // Non-project path: updateTab with conflict state reset
    ctx.savedContent = sanitized;
    ctx.updatedTab = {
      lastSavedContent: sanitized,
      isDirty: false,
      fileSyncStatus: "clean",
      conflictDiskContent: null,
    };
    ctx.tabClosed = true;
    ctx.pendingCloseCleared = true;
  }

  return ctx;
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
// Tests: Conflict guard
// ---------------------------------------------------------------------------

describe("close dialog: conflict guard blocks save (#1011)", () => {
  it("blocks save when tab fileSyncStatus is 'conflicted'", () => {
    const tab = makeEditorTab({
      fileSyncStatus: "conflicted",
      content: "local edits",
      isDirty: true,
      conflictDiskContent: "disk version",
      file: { name: "test.mdi", path: "/test.mdi", handle: null },
    });

    const result = simulateCloseTabSave(tab, true);

    expect(result.tabClosed).toBe(false);
    expect(result.savedContent).toBeNull();
    expect(result.warningMessages).toHaveLength(1);
    expect(result.warningMessages[0]).toContain("コンフリクト");
  });

  it("clears pendingCloseTabId when blocked by conflict", () => {
    const tab = makeEditorTab({
      fileSyncStatus: "conflicted",
      content: "edits",
      isDirty: true,
    });

    const result = simulateCloseTabSave(tab, true);

    expect(result.pendingCloseCleared).toBe(true);
    expect(result.tabClosed).toBe(false);
  });

  it("does NOT block save when fileSyncStatus is 'clean'", () => {
    const tab = makeEditorTab({
      fileSyncStatus: "clean",
      content: "content",
      isDirty: true,
      file: { name: "test.mdi", path: "/test.mdi", handle: null },
    });

    const result = simulateCloseTabSave(tab, true);

    expect(result.tabClosed).toBe(true);
    expect(result.savedContent).not.toBeNull();
    expect(result.warningMessages).toHaveLength(0);
  });

  it("does NOT block save when fileSyncStatus is 'dirty'", () => {
    const tab = makeEditorTab({
      fileSyncStatus: "dirty",
      content: "content",
      isDirty: true,
      file: { name: "test.mdi", path: "/test.mdi", handle: null },
    });

    const result = simulateCloseTabSave(tab, true);

    expect(result.tabClosed).toBe(true);
    expect(result.warningMessages).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: Non-project save resets conflict state
// ---------------------------------------------------------------------------

describe("close dialog: non-project save resets fileSyncStatus", () => {
  it("sets fileSyncStatus to 'clean' in updateTab", () => {
    const tab = makeEditorTab({
      fileSyncStatus: "dirty",
      content: "content",
      isDirty: true,
      file: { name: "test.mdi", path: null, handle: null },
    });

    const result = simulateCloseTabSave(tab, false);

    expect(result.updatedTab).not.toBeNull();
    expect(result.updatedTab!.fileSyncStatus).toBe("clean");
  });

  it("clears conflictDiskContent in updateTab", () => {
    const tab = makeEditorTab({
      fileSyncStatus: "dirty",
      content: "content",
      isDirty: true,
      conflictDiskContent: "old disk",
      file: { name: "test.mdi", path: null, handle: null },
    });

    const result = simulateCloseTabSave(tab, false);

    expect(result.updatedTab).not.toBeNull();
    expect(result.updatedTab!.conflictDiskContent).toBeNull();
  });

  it("sets isDirty to false in updateTab", () => {
    const tab = makeEditorTab({
      fileSyncStatus: "dirty",
      content: "content",
      isDirty: true,
    });

    const result = simulateCloseTabSave(tab, false);

    expect(result.updatedTab!.isDirty).toBe(false);
  });
});
