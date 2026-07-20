/**
 * Tests for computeHistoryRestoreTabUpdate — the clean/dirty decision logic
 * extracted from app/page.tsx's onHistoryRestore handler (#1845/G3). This is
 * the real production function now (not a copy/mirror) — app/page.tsx calls
 * it directly.
 */
import { describe, it, expect } from "vitest";
import { computeHistoryRestoreTabUpdate } from "../history-restore";
import type { EditorTabState, TerminalTabState } from "../tab-types";

function makeEditorTab(overrides: Partial<EditorTabState> = {}): EditorTabState {
  return {
    tabKind: "editor",
    id: "tab-1",
    file: null,
    content: "",
    lastSavedContent: "",
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

function makeTerminalTab(): TerminalTabState {
  return {
    tabKind: "terminal",
    id: "term-1",
    sessionId: "s1",
    label: "Terminal",
    cwd: "/",
    shell: "/bin/bash",
    status: "running",
    exitCode: null,
    createdAt: Date.now(),
    source: "user",
  };
}

describe("computeHistoryRestoreTabUpdate", () => {
  it("marks the tab clean when restored content sanitizes equal to lastSavedContent", () => {
    const tab = makeEditorTab({ lastSavedContent: "hello world" });
    const result = computeHistoryRestoreTabUpdate("hello world", tab);
    expect(result).toEqual({ fileSyncStatus: "clean", isDirty: false, conflictDiskContent: null });
  });

  it("marks the tab dirty when restored content differs from lastSavedContent", () => {
    const tab = makeEditorTab({ lastSavedContent: "hello world" });
    const result = computeHistoryRestoreTabUpdate("goodbye world", tab);
    expect(result).toEqual({ fileSyncStatus: "dirty", isDirty: true, conflictDiskContent: null });
  });

  it("falls back to an empty lastSaved baseline when targetTab is undefined", () => {
    expect(computeHistoryRestoreTabUpdate("", undefined)).toEqual({
      fileSyncStatus: "clean",
      isDirty: false,
      conflictDiskContent: null,
    });
    expect(computeHistoryRestoreTabUpdate("some content", undefined)).toEqual({
      fileSyncStatus: "dirty",
      isDirty: true,
      conflictDiskContent: null,
    });
  });

  it("falls back to an empty lastSaved baseline for a non-editor tab", () => {
    const terminalTab = makeTerminalTab();
    expect(computeHistoryRestoreTabUpdate("", terminalTab)).toEqual({
      fileSyncStatus: "clean",
      isDirty: false,
      conflictDiskContent: null,
    });
    expect(computeHistoryRestoreTabUpdate("some content", terminalTab)).toEqual({
      fileSyncStatus: "dirty",
      isDirty: true,
      conflictDiskContent: null,
    });
  });

  it("treats an undefined/empty lastSavedContent on the editor tab as the empty-string baseline", () => {
    const tab = makeEditorTab({ lastSavedContent: "" });
    expect(computeHistoryRestoreTabUpdate("", tab)).toEqual({
      fileSyncStatus: "clean",
      isDirty: false,
      conflictDiskContent: null,
    });
  });

  it("always clears conflictDiskContent regardless of clean/dirty outcome", () => {
    const tab = makeEditorTab({
      lastSavedContent: "x",
      conflictDiskContent: "some stale disk content",
    });
    const clean = computeHistoryRestoreTabUpdate("x", tab);
    const dirty = computeHistoryRestoreTabUpdate("y", tab);
    expect(clean.conflictDiskContent).toBeNull();
    expect(dirty.conflictDiskContent).toBeNull();
  });

  it("passes the tab's fileType through to sanitization for both sides of the comparison", () => {
    // Standalone <br /> line: Step 1a (br -> [[blank]] marker) only applies to
    // ".mdi"; .md/.txt fall through to Step 1b (<br /> -> "\n"). So the same
    // (restoredContent, lastSavedContent) pair sanitizes to equal strings under
    // ".mdi" but unequal strings under ".md" — this only holds if fileType
    // actually reaches sanitizeMdiContent for BOTH restoredContent and
    // lastSavedContent, not just one side.
    const restoredContent = "<br />";
    const lastSavedContent = "[[blank]]";

    const mdiTab = makeEditorTab({ fileType: ".mdi", lastSavedContent });
    expect(computeHistoryRestoreTabUpdate(restoredContent, mdiTab).fileSyncStatus).toBe("clean");

    const mdTab = makeEditorTab({ fileType: ".md", lastSavedContent });
    expect(computeHistoryRestoreTabUpdate(restoredContent, mdTab).fileSyncStatus).toBe("dirty");
  });

  it("returns an object with exactly the documented three keys", () => {
    const tab = makeEditorTab({ lastSavedContent: "x" });
    const result = computeHistoryRestoreTabUpdate("x", tab);
    expect(Object.keys(result).sort()).toEqual(
      ["conflictDiskContent", "fileSyncStatus", "isDirty"].sort(),
    );
  });
});
