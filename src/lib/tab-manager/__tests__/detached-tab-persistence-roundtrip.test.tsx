/**
 * Regression test for #1868 — detached dirty tab survives an app restart.
 *
 * When an OPEN file is deleted from the explorer, applyTabDelete detaches the
 * tab (file → null) and marks it dirty so the next save can no longer resurrect
 * the deleted path. Earlier the project-mode persistence layer stored only
 * relativePath + fileName, so a detached tab (relativePath === null) was
 * restored as a BLANK new tab — silently losing the unsaved buffer across a
 * quit/reopen cycle.
 *
 * These tests exercise the REAL persistence round-trip (persistTabStateNow →
 * workspace.json shape → restoreProjectTabs) and prove the detached dirty tab's
 * content is recovered, not dropped. They drive the real hook via
 * createRoot + act (repo pattern, no @testing-library/react).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

import { useTabPersistence, type UseTabPersistenceReturn } from "../use-tab-persistence";
import { generateTabId } from "../types";
import { applyTabDelete } from "../tab-path-sync";
import { isEditorTab } from "../tab-types";
import type { EditorTabState, TabState, TabId } from "../tab-types";
import type { WorkspaceTab } from "../../project/project-types";

// Capture the openTabs payload written to workspace.json so we can feed it back
// into restoreProjectTabs and verify the full round-trip.
const { persistWorkspaceJsonMock } = vi.hoisted(() => ({
  persistWorkspaceJsonMock: vi.fn(async (_state: unknown) => undefined),
}));

vi.mock("@/lib/storage/storage-service", () => ({
  getStorageService: () => ({
    initialize: vi.fn(async () => undefined),
    loadAppState: vi.fn(async () => null),
    getItem: vi.fn(async () => null),
    loadEditorBuffer: vi.fn(async () => null),
    clearEditorBuffer: vi.fn(async () => undefined),
  }),
}));

vi.mock("@/lib/storage/app-state-manager", () => ({
  fetchWindowState: vi.fn(async () => null),
  persistWindowState: vi.fn(async () => undefined),
  persistAppState: vi.fn(async () => undefined),
}));

vi.mock("@/lib/project/workspace-persistence", () => ({
  persistWorkspaceJson: persistWorkspaceJsonMock,
  toRelativePath: (p: string) => p,
  toAbsolutePath: (p: string) => p,
}));

vi.mock("@/lib/services/project-file-service", () => ({
  getProjectFileService: () => ({ readFile: vi.fn(async () => "disk content") }),
}));

// ---------------------------------------------------------------------------
// Harness — exposes the hook's API + tab state to the test
// ---------------------------------------------------------------------------

interface HarnessHandle {
  api: UseTabPersistenceReturn;
  tabs: TabState[];
  setTabs: (next: TabState[]) => void;
}

function Harness({ onReady }: { onReady: (h: HarnessHandle) => void }): null {
  const [tabs, setTabsState] = React.useState<TabState[]>([]);
  const [activeTabId, setActiveTabId] = React.useState<TabId>("");

  const tabsRef = useRef<TabState[]>(tabs);
  tabsRef.current = tabs;
  const activeTabIdRef = useRef<TabId>(activeTabId);
  activeTabIdRef.current = activeTabId;
  const isProjectRef = useRef(true); // project mode → workspace.json path

  const api = useTabPersistence({
    tabs,
    setTabs: setTabsState as never,
    activeTabId,
    setActiveTabId: setActiveTabId as never,
    tabsRef,
    activeTabIdRef,
    isProjectRef,
    isElectron: true,
    skipAutoRestore: true,
    windowKey: "/proj",
  });

  onReady({ api, tabs, setTabs: (next) => setTabsState(next) });
  return null;
}

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  persistWorkspaceJsonMock.mockClear();
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

function makeFileTab(path: string, name: string, content: string): EditorTabState {
  return {
    tabKind: "editor",
    id: generateTabId(),
    file: { path, handle: null, name },
    content,
    lastSavedContent: content,
    isDirty: false,
    lastSavedTime: Date.now(),
    lastSaveWasAuto: false,
    isSaving: false,
    isPreview: false,
    fileType: ".mdi",
    fileSyncStatus: "clean",
    conflictDiskContent: null,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("#1868 — detached dirty tab persistence round-trip", () => {
  it("recovers the unsaved buffer of a tab detached after its file was deleted", async () => {
    let handle!: HarnessHandle;
    await act(async () => {
      root.render(<Harness onReady={(h) => (handle = h)} />);
    });

    // 1. Open a file-backed tab, then the user edits it (dirty).
    const opened = makeFileTab("chapter1.mdi", "chapter1.mdi", "下書きの本文");
    const dirty: EditorTabState = {
      ...opened,
      content: "編集した未保存の本文",
      isDirty: true,
      fileSyncStatus: "dirty",
    };

    // 2. The file is deleted from the explorer → tab is detached (file → null).
    const { tabs: detachedTabs } = applyTabDelete([dirty], "chapter1.mdi");
    const detached = detachedTabs.find(isEditorTab)!;
    expect(detached.file).toBeNull();
    expect(detached.isDirty).toBe(true);

    await act(async () => {
      handle.setTabs(detachedTabs);
    });

    // 3. Persist (quit) — capture the workspace.json openTabs payload.
    await act(async () => {
      await handle.api.flushTabState();
    });

    expect(persistWorkspaceJsonMock).toHaveBeenCalled();
    const lastCall = persistWorkspaceJsonMock.mock.calls.at(-1)![0] as {
      openTabs: { tabs: WorkspaceTab[]; activeIndex: number };
    };
    const savedTabs = lastCall.openTabs.tabs;
    expect(savedTabs).toHaveLength(1);
    // GAP guard: the detached tab has no path, but its content IS persisted.
    expect(savedTabs[0].relativePath).toBeNull();
    expect(savedTabs[0].unsavedContent).toBe("編集した未保存の本文");

    // 4. Reopen (restore) — the buffer must come back, dirty, not blank.
    let recovered = false;
    await act(async () => {
      recovered = await handle.api.restoreProjectTabs({ tabs: savedTabs, activeIndex: 0 }, "/proj");
    });
    expect(recovered).toBe(true);

    const restored = handle.tabs.filter(isEditorTab);
    expect(restored).toHaveLength(1);
    expect(restored[0].content).toBe("編集した未保存の本文");
    expect(restored[0].isDirty).toBe(true);
    expect(restored[0].fileSyncStatus).toBe("dirty");
  });

  it("does not persist content for clean file-backed tabs (re-read from disk)", async () => {
    let handle!: HarnessHandle;
    await act(async () => {
      root.render(<Harness onReady={(h) => (handle = h)} />);
    });

    const clean = makeFileTab("chapter2.mdi", "chapter2.mdi", "保存済み本文");
    await act(async () => {
      handle.setTabs([clean]);
    });
    await act(async () => {
      await handle.api.flushTabState();
    });

    const payload = persistWorkspaceJsonMock.mock.calls.at(-1)![0] as {
      openTabs: { tabs: WorkspaceTab[] };
    };
    expect(payload.openTabs.tabs[0].relativePath).toBe("chapter2.mdi");
    expect(payload.openTabs.tabs[0].unsavedContent).toBeUndefined();
  });

  it("restores an empty untitled tab as a clean blank tab", async () => {
    let handle!: HarnessHandle;
    await act(async () => {
      root.render(<Harness onReady={(h) => (handle = h)} />);
    });

    await act(async () => {
      await handle.api.restoreProjectTabs(
        {
          tabs: [{ relativePath: null, fileName: "新規ファイル", fileType: ".mdi" }],
          activeIndex: 0,
        },
        "/proj",
      );
    });

    const restored = handle.tabs.filter(isEditorTab);
    expect(restored).toHaveLength(1);
    expect(restored[0].content).toBe("");
    expect(restored[0].isDirty).toBe(false);
  });
});
