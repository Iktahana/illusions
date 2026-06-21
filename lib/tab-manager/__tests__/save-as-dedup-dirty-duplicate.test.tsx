/**
 * Regression test for #1872 follow-up (P0 DATA LOSS):
 * Save-As onto a path already open in another tab must NOT silently destroy
 * that other tab's unsaved edits.
 *
 * The original #1872 fix consolidated the duplicate by calling forceCloseTab()
 * UNCONDITIONALLY. forceCloseTab bypasses the unsaved-changes dialog, so if the
 * duplicate tab was itself DIRTY (its own divergent unsaved edits), those edits
 * were dropped without warning — exactly the kind of silent data loss #1872 set
 * out to prevent.
 *
 * The fix branches on the duplicate's dirty state:
 *   - CLEAN duplicate → forceCloseTab (silent consolidation; no unsaved work).
 *   - DIRTY duplicate → closeTab, which routes through the unsaved-changes
 *     dialog so the user can save / discard / cancel.
 *
 * These tests drive the REAL useFileIO.saveAsFile hook via createRoot + act
 * (repo pattern, no @testing-library/react) with executeTabSave mocked so the
 * native Save-As dialog is bypassed and the saved descriptor is controllable.
 * This exercises the actual saveAsFile wiring — not just the pure helper.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { useEffect, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { useFileIO } from "../use-file-io";
import type { EditorTabState, TabState, TabId } from "../tab-types";
import type { MdiFileDescriptor } from "../../project/mdi-file";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { executeTabSaveMock } = vi.hoisted(() => ({
  executeTabSaveMock: vi.fn(),
}));

vi.mock("../save-executor", () => ({
  executeTabSave: executeTabSaveMock,
}));

const { warningMock } = vi.hoisted(() => ({
  warningMock: vi.fn(),
}));

vi.mock("../../services/notification-manager", () => ({
  notificationManager: {
    info: vi.fn(),
    warning: warningMock,
    error: vi.fn(),
    showMessage: vi.fn(),
  },
}));

vi.mock("../../storage/storage-service", () => ({
  getStorageService: () => ({
    initialize: vi.fn(async () => undefined),
    saveEditorBuffer: vi.fn(async () => undefined),
    setItem: vi.fn(async () => undefined),
  }),
}));

vi.mock("../../storage/app-state-manager", () => ({
  persistAppState: vi.fn(async () => undefined),
}));

vi.mock("../../services/history-service", () => ({
  getHistoryService: () => ({
    shouldCreateSnapshot: vi.fn(async () => false),
    createSnapshot: vi.fn(async () => undefined),
  }),
}));

vi.mock("../../services/project-file-service", () => ({
  getProjectFileService: () => ({ isRootOpen: () => false, readFile: vi.fn(async () => "") }),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DEST_PATH = "/Users/x/dest.mdi";
const DEST_NAME = "dest.mdi";

/** Source tab (active) being Save-As'd onto DEST_PATH. */
function makeSourceTab(): EditorTabState {
  return {
    tabKind: "editor",
    id: "tab-source",
    file: { path: "/Users/x/source.mdi", handle: null, name: "source.mdi" },
    content: "保存先へ書き込む新しい本文",
    lastSavedContent: "保存先へ書き込む新しい本文",
    isDirty: false,
    lastSavedTime: 1_000,
    lastSaveWasAuto: false,
    isSaving: false,
    isPreview: false,
    fileType: ".mdi",
    fileSyncStatus: "clean",
    conflictDiskContent: null,
  };
}

/** Duplicate tab already open on DEST_PATH, carrying its own unsaved edits. */
const DUPLICATE_UNSAVED = "別タブで編集中の未保存テキスト";
function makeDuplicateTab(isDirty: boolean): EditorTabState {
  return {
    tabKind: "editor",
    id: "tab-duplicate",
    file: { path: DEST_PATH, handle: null, name: DEST_NAME },
    content: isDirty ? DUPLICATE_UNSAVED : "ディスクと一致した内容",
    lastSavedContent: "ディスクと一致した内容",
    isDirty,
    lastSavedTime: 500,
    lastSaveWasAuto: false,
    isSaving: false,
    isPreview: false,
    fileType: ".mdi",
    fileSyncStatus: isDirty ? "dirty" : "clean",
    conflictDiskContent: null,
  };
}

function destDescriptor(): MdiFileDescriptor {
  return { path: DEST_PATH, handle: null, name: DEST_NAME };
}

// ---------------------------------------------------------------------------
// Harness — drives the real saveAsFile
// ---------------------------------------------------------------------------

interface Captured {
  saveAsFile: () => Promise<void>;
  forceCloseTab: ReturnType<typeof vi.fn>;
  closeTab: ReturnType<typeof vi.fn>;
  setActiveTabId: ReturnType<typeof vi.fn>;
}

const captured: Partial<Captured> = {};

function resetCaptured(): void {
  captured.saveAsFile = undefined;
  captured.forceCloseTab = undefined;
  captured.closeTab = undefined;
  captured.setActiveTabId = undefined;
}

function Harness({ tabs }: { tabs: TabState[] }): null {
  const tabsRef = useRef<TabState[]>(tabs);
  tabsRef.current = tabs;
  const activeTabIdRef = useRef<TabId>("tab-source");
  const isProjectRef = useRef(false);

  const setTabs = useRef(vi.fn()).current;
  const setActiveTabId = useRef(vi.fn()).current;
  const updateTab = useRef(vi.fn()).current;
  const forceCloseTab = useRef(vi.fn()).current;
  const closeTab = useRef(vi.fn()).current;
  const findTabByPath = useRef((p: string) =>
    tabsRef.current.find((t): t is EditorTabState => t.tabKind === "editor" && t.file?.path === p),
  ).current;

  const io = useFileIO({
    tabs,
    setTabs,
    activeTabId: "tab-source",
    setActiveTabId,
    tabsRef,
    activeTabIdRef,
    isProjectRef,
    isElectron: true,
    updateTab,
    findTabByPath,
    forceCloseTab,
    closeTab,
  });

  useEffect(() => {
    captured.saveAsFile = io.saveAsFile;
    captured.forceCloseTab = forceCloseTab;
    captured.closeTab = closeTab;
    captured.setActiveTabId = setActiveTabId;
  });
  return null;
}

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.clearAllMocks();
  resetCaptured();
  // Default: Save As writes DEST_PATH successfully.
  executeTabSaveMock.mockResolvedValue({
    status: "saved",
    descriptor: destDescriptor(),
    savedContent: "保存先へ書き込む新しい本文",
    persistFailed: false,
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("#1872 Save-As onto a DIRTY duplicate tab", () => {
  it("does NOT force-close the dirty duplicate; routes it through the unsaved dialog (closeTab)", async () => {
    const tabs = [makeSourceTab(), makeDuplicateTab(true)];

    await act(async () => {
      root.render(<Harness tabs={tabs} />);
    });
    await act(async () => {
      await captured.saveAsFile!();
    });

    // The dirty duplicate's unsaved edits must NOT be silently destroyed:
    // forceCloseTab (which bypasses the unsaved-changes dialog) must NOT be
    // called for it.
    expect(captured.forceCloseTab).not.toHaveBeenCalled();
    // Instead it is routed through closeTab, which guards on isDirty and raises
    // the unsaved-changes dialog so the user can save / discard / cancel.
    expect(captured.closeTab).toHaveBeenCalledWith("tab-duplicate");
    // The user is warned with the dirty-specific (non-destructive) copy.
    expect(warningMock).toHaveBeenCalledTimes(1);
    expect(warningMock.mock.calls[0][0]).toContain("未保存");
  });
});

describe("#1872 Save-As onto a CLEAN duplicate tab", () => {
  it("silently consolidates by force-closing the clean duplicate", async () => {
    const tabs = [makeSourceTab(), makeDuplicateTab(false)];

    await act(async () => {
      root.render(<Harness tabs={tabs} />);
    });
    await act(async () => {
      await captured.saveAsFile!();
    });

    // A clean duplicate has no unsaved work, so force-closing it is safe.
    expect(captured.forceCloseTab).toHaveBeenCalledWith("tab-duplicate");
    expect(captured.closeTab).not.toHaveBeenCalled();
    expect(captured.setActiveTabId).toHaveBeenCalledWith("tab-source");
    expect(warningMock).toHaveBeenCalledTimes(1);
    // Clean-duplicate copy says the other tab was closed, never "統合".
    expect(warningMock.mock.calls[0][0]).toContain("閉じました");
  });
});

describe("#1872 Save-As with no colliding tab", () => {
  it("closes nothing and shows no duplicate warning", async () => {
    const tabs = [makeSourceTab()]; // only the source tab; no duplicate on DEST_PATH

    await act(async () => {
      root.render(<Harness tabs={tabs} />);
    });
    await act(async () => {
      await captured.saveAsFile!();
    });

    expect(captured.forceCloseTab).not.toHaveBeenCalled();
    expect(captured.closeTab).not.toHaveBeenCalled();
    expect(warningMock).not.toHaveBeenCalled();
  });
});
