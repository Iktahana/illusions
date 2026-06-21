/**
 * Regression tests for the project-switch data-loss fix (#1859).
 *
 * Root cause: the unsaved-warning flow saved only the ACTIVE tab and ran the
 * pending action (project switch) even when a save was cancelled/failed,
 * silently dropping unsaved content in background tabs.
 *
 * The fix adds useFileIO.saveAllDirtyTabs(): it loops EVERY dirty editor tab
 * through the shared executor and reports an aggregate result.
 *
 * These tests drive the REAL useFileIO hook (createRoot + act, repo pattern)
 * with the executor's VFS dependencies mocked, and verify:
 *   (a) a background dirty tab is actually written, and
 *   (b) when one tab's save is cancelled, the aggregate reports allSaved=false
 *       (so the caller blocks the project switch) and a later tab is NOT saved.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ---------------------------------------------------------------------------
// Mocks (must precede importing the modules under test)
// ---------------------------------------------------------------------------

vi.mock("@/lib/services/notification-manager", () => ({
  notificationManager: {
    warning: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    showMessage: vi.fn(),
  },
}));

vi.mock("../../project/mdi-file", () => ({
  saveMdiFile: vi.fn(),
  openMdiFile: vi.fn(),
}));
vi.mock("../../services/project-file-service", () => ({
  getProjectFileService: vi.fn(),
}));
vi.mock("../../services/file-watcher", () => ({
  suppressFileWatch: vi.fn(),
}));
vi.mock("../../storage/storage-service", () => ({
  getStorageService: vi.fn(),
}));
vi.mock("../../storage/app-state-manager", () => ({
  persistAppState: vi.fn(async () => undefined),
}));
vi.mock("../../services/history-service", () => ({
  getHistoryService: vi.fn(() => ({
    shouldCreateSnapshot: vi.fn(async () => false),
    createSnapshot: vi.fn(async () => undefined),
  })),
}));

import { getProjectFileService } from "../../services/project-file-service";
import { useFileIO } from "../use-file-io";
import { clearSaveLocks } from "../save-lock";
import { isEditorTab } from "../tab-types";
import type { UseFileIOParams, UseFileIOReturn } from "../use-file-io";
import type { Dispatch, SetStateAction } from "react";
import type { EditorTabState, TabId, TabState } from "../tab-types";

const getProjectFileServiceMock = vi.mocked(getProjectFileService);

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

function makeTab(overrides: Partial<EditorTabState> = {}): EditorTabState {
  return {
    tabKind: "editor",
    id: "tab-1",
    file: { path: "/p/a.mdi", handle: null, name: "a.mdi" },
    content: "edited",
    lastSavedContent: "old",
    isDirty: true,
    lastSavedTime: null,
    lastSaveWasAuto: false,
    isSaving: false,
    isPreview: false,
    fileType: ".mdi",
    fileSyncStatus: "dirty",
    conflictDiskContent: null,
    ...overrides,
  };
}

interface Harness {
  params: UseFileIOParams;
  tabsRef: { current: TabState[] };
  getTab: (id: TabId) => EditorTabState;
}

function makeHarness(initialTabs: TabState[], activeTabId: TabId): Harness {
  const tabsRef = { current: initialTabs };
  const setTabs: Dispatch<SetStateAction<TabState[]>> = (updater) => {
    tabsRef.current =
      typeof updater === "function"
        ? (updater as (prev: TabState[]) => TabState[])(tabsRef.current)
        : updater;
  };
  return {
    tabsRef,
    getTab: (id: TabId): EditorTabState => {
      const found = tabsRef.current.find((t) => t.id === id);
      if (!found || !isEditorTab(found)) throw new Error(`editor tab not found: ${id}`);
      return found;
    },
    params: {
      tabs: tabsRef.current,
      setTabs,
      activeTabId,
      setActiveTabId: vi.fn(),
      tabsRef,
      activeTabIdRef: { current: activeTabId },
      isProjectRef: { current: true },
      isElectron: true,
      updateTab: vi.fn(),
      findTabByPath: vi.fn(),
      forceCloseTab: vi.fn(),
      closeTab: vi.fn(),
    },
  };
}

let api: UseFileIOReturn | null = null;

function HookHost({ params }: { params: UseFileIOParams }): null {
  const value = useFileIO(params);
  useEffect(() => {
    api = value;
  });
  return null;
}

let root: Root;
let container: HTMLDivElement;
let vfsWriteFile: ReturnType<typeof vi.fn>;
let vfsReadFile: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  clearSaveLocks();
  api = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  vfsWriteFile = vi.fn().mockResolvedValue(undefined);
  vfsReadFile = vi.fn().mockResolvedValue("{}");
  getProjectFileServiceMock.mockReturnValue({
    writeFile: vfsWriteFile,
    readFile: vfsReadFile,
    isRootOpen: () => false,
    getRootPath: () => "/p",
  } as unknown as ReturnType<typeof getProjectFileService>);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

async function mountHook(params: UseFileIOParams): Promise<void> {
  await act(async () => {
    root.render(<HookHost params={params} />);
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("#1859 saveAllDirtyTabs", () => {
  it("saves a BACKGROUND dirty tab (not just the active tab)", async () => {
    const active = makeTab({
      id: "active",
      file: { path: "/p/active.mdi", handle: null, name: "active.mdi" },
    });
    const background = makeTab({
      id: "bg",
      file: { path: "/p/bg.mdi", handle: null, name: "bg.mdi" },
      content: "bg edited",
    });
    const h = makeHarness([active, background], "active");
    await mountHook(h.params);

    let result: { allSaved: boolean } | undefined;
    await act(async () => {
      result = await api!.saveAllDirtyTabs();
    });

    expect(result?.allSaved).toBe(true);
    // Both project-mode VFS writes happened — background tab is NOT dropped.
    const writtenPaths = vfsWriteFile.mock.calls.map((c) => c[0] as string);
    expect(writtenPaths).toContain("/p/active.mdi");
    expect(writtenPaths).toContain("/p/bg.mdi");
    expect(h.getTab("active").isDirty).toBe(false);
    expect(h.getTab("bg").isDirty).toBe(false);
  });

  it("returns allSaved=false and stops when a tab's save is cancelled", async () => {
    // Untitled tab (no path) → standalone branch → saveMdiFile dialog → cancel.
    const { saveMdiFile } = await import("../../project/mdi-file");
    const saveMdiFileMock = vi.mocked(saveMdiFile);
    saveMdiFileMock.mockResolvedValue(null); // user cancels dialog

    const untitled = makeTab({
      id: "untitled",
      file: null,
      content: "never saved",
    });
    const second = makeTab({
      id: "second",
      file: { path: "/p/second.mdi", handle: null, name: "second.mdi" },
      content: "second edited",
    });
    // Untitled is first in the dirty list → its cancel must block the rest.
    const h = makeHarness([untitled, second], "untitled");
    // active is untitled so flush is irrelevant; force standalone (not project)
    h.params.isProjectRef.current = false;
    await mountHook(h.params);

    let result: { allSaved: boolean } | undefined;
    await act(async () => {
      result = await api!.saveAllDirtyTabs();
    });

    // Cancelled save → caller must block the project switch.
    expect(result?.allSaved).toBe(false);
    // Short-circuit: the second tab was never written to disk.
    expect(vfsWriteFile).not.toHaveBeenCalled();
    expect(saveMdiFileMock).toHaveBeenCalledTimes(1);
    // The second tab remains dirty (its content is preserved, not lost).
    expect(h.getTab("second").isDirty).toBe(true);
  });

  it("returns allSaved=true with no dirty tabs", async () => {
    const clean = makeTab({ id: "clean", isDirty: false, fileSyncStatus: "clean" });
    const h = makeHarness([clean], "clean");
    await mountHook(h.params);

    let result: { allSaved: boolean } | undefined;
    await act(async () => {
      result = await api!.saveAllDirtyTabs();
    });

    expect(result?.allSaved).toBe(true);
    expect(vfsWriteFile).not.toHaveBeenCalled();
  });
});
