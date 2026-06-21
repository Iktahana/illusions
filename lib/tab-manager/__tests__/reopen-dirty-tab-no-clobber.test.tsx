/**
 * Regression tests for #1873 (P0 DATA LOSS):
 * 未保存ファイルを再度開くとdirty内容を無警告でディスク値へ置換する.
 *
 * When a path with unsaved (dirty) edits is opened again — via the "ファイルを開く"
 * dialog (openFile) or a Finder / OS open-file event (loadSystemFile) — the
 * existing tab must be ACTIVATED with its in-memory buffer left untouched. The
 * old code unconditionally overwrote content / lastSavedContent and reset
 * isDirty=false, silently destroying the user's unsaved work.
 *
 * These tests drive the REAL useFileIO hook via createRoot + act (repo pattern,
 * no @testing-library/react) so they cover the actual dedup branches, not a
 * re-implementation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { useEffect, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { useFileIO } from "../use-file-io";
import { decideReopenExistingTab } from "../reopen-existing-tab";
import type { EditorTabState, TabState, TabId } from "../tab-types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { openMdiFileMock } = vi.hoisted(() => ({
  openMdiFileMock: vi.fn(),
}));

vi.mock("../../project/mdi-file", () => ({
  openMdiFile: openMdiFileMock,
}));

vi.mock("../../services/notification-manager", () => ({
  notificationManager: { info: vi.fn(), warning: vi.fn(), error: vi.fn(), showMessage: vi.fn() },
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
// Harness
// ---------------------------------------------------------------------------

const DIRTY_CONTENT = "ユーザーが書いた未保存の本文";
const DISK_CONTENT = "ディスク上の古い内容";
const FILE_PATH = "/Users/x/novel.mdi";

function makeDirtyTab(): EditorTabState {
  return {
    tabKind: "editor",
    id: "tab-dirty",
    file: { path: FILE_PATH, handle: null, name: "novel.mdi" },
    content: DIRTY_CONTENT,
    lastSavedContent: DISK_CONTENT,
    isDirty: true,
    lastSavedTime: 1_000,
    lastSaveWasAuto: false,
    isSaving: false,
    isPreview: false,
    fileType: ".mdi",
    fileSyncStatus: "dirty",
    conflictDiskContent: null,
  };
}

interface Captured {
  openFile: () => Promise<void>;
  loadSystemFile: (path: string, content: string) => void;
  updateTab: ReturnType<typeof vi.fn>;
  setActiveTabId: ReturnType<typeof vi.fn>;
  setTabs: ReturnType<typeof vi.fn>;
}

// Stable module-level sink the Harness writes into via an effect (avoids
// mutating React props and avoids reassigning during render).
const captured: Partial<Captured> = {};

function resetCaptured(): void {
  captured.openFile = undefined;
  captured.loadSystemFile = undefined;
  captured.updateTab = undefined;
  captured.setActiveTabId = undefined;
  captured.setTabs = undefined;
}

function Harness({ tabs }: { tabs: TabState[] }): null {
  const tabsRef = useRef<TabState[]>(tabs);
  tabsRef.current = tabs;
  const activeTabIdRef = useRef<TabId>("tab-other"); // some other tab is active
  const isProjectRef = useRef(false);

  const setTabs = useRef(vi.fn()).current;
  const setActiveTabId = useRef(vi.fn()).current;
  const updateTab = useRef(vi.fn()).current;
  const findTabByPath = useRef((p: string) =>
    tabsRef.current.find((t): t is EditorTabState => t.tabKind === "editor" && t.file?.path === p),
  ).current;

  const io = useFileIO({
    tabs,
    setTabs,
    activeTabId: "tab-other",
    setActiveTabId,
    tabsRef,
    activeTabIdRef,
    isProjectRef,
    isElectron: true,
    updateTab,
    findTabByPath,
  });

  useEffect(() => {
    captured.openFile = io.openFile;
    captured.loadSystemFile = io.loadSystemFile;
    captured.updateTab = updateTab;
    captured.setActiveTabId = setActiveTabId;
    captured.setTabs = setTabs;
  });
  return null;
}

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.clearAllMocks();
  resetCaptured();
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
// Pure decision helper
// ---------------------------------------------------------------------------

describe("#1873 decideReopenExistingTab", () => {
  it("returns null when no existing tab (caller creates a new tab)", () => {
    expect(decideReopenExistingTab(undefined)).toBeNull();
  });

  it("activates the existing tab and never reloads from disk (dirty tab)", () => {
    const decision = decideReopenExistingTab(makeDirtyTab());
    expect(decision).toEqual({ activateTabId: "tab-dirty", reloadFromDisk: false });
  });

  it("activates the existing tab and never reloads from disk (clean tab)", () => {
    const clean: EditorTabState = { ...makeDirtyTab(), isDirty: false, fileSyncStatus: "clean" };
    const decision = decideReopenExistingTab(clean);
    expect(decision?.reloadFromDisk).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// openFile (file dialog) — repro A
// ---------------------------------------------------------------------------

describe("#1873 openFile reopening a dirty tab", () => {
  it("activates the existing dirty tab WITHOUT overwriting its content/isDirty", async () => {
    openMdiFileMock.mockResolvedValue({
      descriptor: { path: FILE_PATH, handle: null, name: "novel.mdi" },
      content: DISK_CONTENT,
    });

    await act(async () => {
      root.render(<Harness tabs={[makeDirtyTab()]} />);
    });

    await act(async () => {
      await captured.openFile!();
    });

    // Existing tab is activated…
    expect(captured.setActiveTabId).toHaveBeenCalledWith("tab-dirty");
    // …and its buffer was NOT touched (no updateTab clobber on the dirty tab).
    const clobbered = captured.updateTab!.mock.calls.some((call: unknown[]) => {
      const id = call[0] as TabId;
      const updates = call[1] as Partial<EditorTabState>;
      return (
        id === "tab-dirty" &&
        ("content" in updates || "lastSavedContent" in updates || "isDirty" in updates)
      );
    });
    expect(clobbered).toBe(false);
    // No new tab created.
    expect(captured.setTabs).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// loadSystemFile (Finder / OS open-file event) — repro B
// ---------------------------------------------------------------------------

describe("#1873 loadSystemFile reopening a dirty tab", () => {
  it("activates the existing dirty tab WITHOUT overwriting content/isDirty", async () => {
    await act(async () => {
      root.render(<Harness tabs={[makeDirtyTab()]} />);
    });

    await act(async () => {
      captured.loadSystemFile!(FILE_PATH, DISK_CONTENT);
    });

    expect(captured.setActiveTabId).toHaveBeenCalledWith("tab-dirty");
    const clobbered = captured.updateTab!.mock.calls.some(
      (call: unknown[]) => (call[0] as TabId) === "tab-dirty",
    );
    expect(clobbered).toBe(false);
    expect(captured.setTabs).not.toHaveBeenCalled();
  });

  it("activates a clean tab without implicitly reloading disk content", async () => {
    const clean: EditorTabState = {
      ...makeDirtyTab(),
      content: DISK_CONTENT,
      isDirty: false,
      fileSyncStatus: "clean",
    };
    await act(async () => {
      root.render(<Harness tabs={[clean]} />);
    });

    await act(async () => {
      captured.loadSystemFile!(FILE_PATH, "別の新しいディスク内容");
    });

    expect(captured.setActiveTabId).toHaveBeenCalledWith("tab-dirty");
    // Clean tab must not be implicitly reloaded either (reload = explicit action).
    expect(captured.updateTab!.mock.calls.length).toBe(0);
  });
});
