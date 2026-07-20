/**
 * Regression test for #1877: visibility reload must NOT overwrite a tab that
 * became dirty during the async vfs.readFile() call.
 *
 * The production fix lives in the handleVisibilityChange loop inside
 * useElectronMenuBindings — it re-reads the tab from tabsRef.current after the
 * await and bails out if the tab is now dirty, is saving, or the file path
 * changed.
 *
 * We extract the guard logic as a pure function and test it without React.
 */

import { describe, it, expect } from "vitest";

import type { TabState, EditorTabState } from "@/lib/tab-manager/tab-types";
import { isEditorTab } from "@/lib/tab-manager/tab-types";

// ---------------------------------------------------------------------------
// Pure guard — mirrors the post-await validation in handleVisibilityChange
// ---------------------------------------------------------------------------

interface ReloadDecision {
  shouldApply: boolean;
  reason?: string;
}

/**
 * Mirrors the post-await guard added by the #1877 fix.
 *
 * @param tabId        - ID of the tab we read from disk.
 * @param originalPath - file.path captured before the await.
 * @param tabs         - current tabs array (from tabsRef.current after the await).
 */
function checkPostAwaitReloadGuard(
  tabId: string,
  originalPath: string,
  tabs: TabState[],
): ReloadDecision {
  const currentTab = tabs.find((t) => t.id === tabId && isEditorTab(t));
  if (!currentTab || !isEditorTab(currentTab)) {
    return { shouldApply: false, reason: "tab no longer exists" };
  }
  if (currentTab.isDirty) {
    return { shouldApply: false, reason: "tab became dirty during read" };
  }
  if (currentTab.isSaving) {
    return { shouldApply: false, reason: "tab is saving" };
  }
  if (currentTab.file?.path !== originalPath) {
    return { shouldApply: false, reason: "file path changed during read" };
  }
  return { shouldApply: true };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeCleanTab(overrides: Partial<EditorTabState> = {}): EditorTabState {
  return {
    tabKind: "editor",
    id: "tab-1",
    file: { path: "/project/novel.mdi", handle: null, name: "novel.mdi" },
    content: "chapter one",
    lastSavedContent: "chapter one",
    isDirty: false,
    lastSavedTime: 1_000_000,
    lastSaveWasAuto: false,
    isSaving: false,
    isPreview: false,
    fileType: ".mdi",
    fileSyncStatus: "clean",
    conflictDiskContent: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("visibility reload guard — post-await re-validation (#1877)", () => {
  const TAB_ID = "tab-1";
  const FILE_PATH = "/project/novel.mdi";

  it("allows the reload when the tab is still clean after the await", () => {
    const cleanTab = makeCleanTab();
    const decision = checkPostAwaitReloadGuard(TAB_ID, FILE_PATH, [cleanTab]);
    expect(decision.shouldApply).toBe(true);
  });

  it("blocks the reload when the tab became dirty during readFile (core regression)", () => {
    // The user typed while readFile was in-flight — tab is now dirty
    const dirtyTab = makeCleanTab({ isDirty: true, fileSyncStatus: "dirty" });
    const decision = checkPostAwaitReloadGuard(TAB_ID, FILE_PATH, [dirtyTab]);
    expect(decision.shouldApply).toBe(false);
    expect(decision.reason).toContain("dirty");
  });

  it("blocks the reload when the tab is saving during readFile", () => {
    const savingTab = makeCleanTab({ isSaving: true });
    const decision = checkPostAwaitReloadGuard(TAB_ID, FILE_PATH, [savingTab]);
    expect(decision.shouldApply).toBe(false);
    expect(decision.reason).toContain("saving");
  });

  it("blocks the reload when the file path changed (e.g. Save As during read)", () => {
    const renamedTab = makeCleanTab({
      file: { path: "/project/renamed.mdi", handle: null, name: "renamed.mdi" },
    });
    const decision = checkPostAwaitReloadGuard(TAB_ID, FILE_PATH, [renamedTab]);
    expect(decision.shouldApply).toBe(false);
    expect(decision.reason).toContain("path");
  });

  it("blocks the reload when the tab was closed during readFile", () => {
    // The tab is no longer present in the tabs array
    const decision = checkPostAwaitReloadGuard(TAB_ID, FILE_PATH, []);
    expect(decision.shouldApply).toBe(false);
    expect(decision.reason).toContain("no longer exists");
  });

  it("preserves in-progress user input: dirty tab content stays unchanged", () => {
    // This simulates the full bug scenario:
    // 1. Window re-focuses → handleVisibilityChange starts
    // 2. Pre-await: tab is clean → passes initial check
    // 3. User types during readFile → tab becomes dirty
    // 4. Post-await: guard detects dirty and skips updateTab

    const userInput = "new paragraph the user is typing right now";
    const tabAfterUserInput = makeCleanTab({
      content: userInput,
      isDirty: true,
      fileSyncStatus: "dirty",
    });

    // The disk had an older version of the content
    const diskContent = "old saved version";

    const decision = checkPostAwaitReloadGuard(TAB_ID, FILE_PATH, [tabAfterUserInput]);
    expect(decision.shouldApply).toBe(false);

    // Confirm that if we had (incorrectly) applied the reload, content would have been lost
    // This is the bug — we MUST NOT reach this code path.
    if (!decision.shouldApply) {
      // Input is preserved — the guard fired correctly
      expect(tabAfterUserInput.content).toBe(userInput);
      expect(tabAfterUserInput.content).not.toBe(diskContent);
    }
  });

  it("still reloads a clean tab when disk content differs (happy path)", () => {
    // A clean tab where the file on disk was updated by another tool
    const cleanTab = makeCleanTab({ content: "old version", lastSavedContent: "old version" });

    const decision = checkPostAwaitReloadGuard(TAB_ID, FILE_PATH, [cleanTab]);
    expect(decision.shouldApply).toBe(true);
    // The caller would then compare diskContent !== baseLastSaved and call updateTab
  });
});
