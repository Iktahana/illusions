/**
 * Regression tests for the window-activity → file-watcher pause wiring
 * (#1448, guarding against a #1445 recurrence).
 *
 * The hook subscribes to the framework-free window-activity service and
 * pauses/resumes watchers per the power policy. These tests drive the REAL
 * hook (createRoot + act, repo pattern) with the REAL file-watcher and
 * save-executor over a mocked VFS, and verify:
 *
 * 1. blur → focus with NO disk change fires no reload and no notification
 *    (the #1445 symptom guard),
 * 2. a genuine disk change while blurred fires the existing conflict flow
 *    on resume,
 * 3. a self-save through the save-executor while paused is NOT misdetected
 *    as an external change on resume (suppressFileWatch content-hash),
 * 4. unmounting unsubscribes from the activity service (no leaks).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ---------------------------------------------------------------------------
// Mocks (must precede importing the modules under test)
// ---------------------------------------------------------------------------

let mockLastModified = 1000;
let mockFileContent = "initial content";

const mockGetFileMetadata = vi.fn(async () => ({
  lastModified: mockLastModified,
  size: mockFileContent.length,
}));
const mockReadFile = vi.fn(async () => mockFileContent);
const mockWriteFile = vi.fn(async (_path: string, content: string) => {
  mockFileContent = content;
  mockLastModified += 1000;
});

vi.mock("@/lib/services/project-file-service", () => ({
  getProjectFileService: () => ({
    getFileMetadata: mockGetFileMetadata,
    readFile: mockReadFile,
    writeFile: mockWriteFile,
  }),
}));

// Force the polling WebFileWatcher (deterministic over the mocked VFS)
vi.mock("@/lib/utils/runtime-env", () => ({
  isElectronRenderer: () => false,
}));

const notificationInfo = vi.fn();
const notificationShowMessage = vi.fn();
vi.mock("@/lib/services/notification-manager", () => ({
  notificationManager: {
    info: (...args: unknown[]) => notificationInfo(...args),
    showMessage: (...args: unknown[]) => notificationShowMessage(...args),
  },
}));

// executeTabSave imports saveMdiFile; the project-mode path never calls it
vi.mock("@/lib/project/mdi-file", () => ({
  saveMdiFile: vi.fn(),
}));

import { suppressFileWatch } from "@/lib/services/file-watcher";
import { executeTabSave } from "../save-executor";
import { isEditorTab } from "../tab-types";
import { useFileWatchIntegration } from "../use-file-watch-integration";
import type { UseFileWatchIntegrationParams } from "../use-file-watch-integration";
import type { Dispatch, SetStateAction } from "react";
import type { EditorTabState, TabId, TabState } from "../tab-types";

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const FILE_PATH = "/project/test.mdi";

function makeTab(overrides: Partial<EditorTabState> = {}): EditorTabState {
  return {
    tabKind: "editor",
    id: "tab-1",
    file: { path: FILE_PATH, handle: null, name: "test.mdi" },
    content: "initial content",
    lastSavedContent: "initial content",
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

interface Harness {
  params: UseFileWatchIntegrationParams;
  tabsRef: { current: TabState[] };
  getTab: (id: TabId) => EditorTabState;
}

function makeHarness(tab: EditorTabState): Harness {
  const tabsRef = { current: [tab] as TabState[] };
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
      activeTabId: tab.id,
      setActiveTabId: vi.fn(),
      tabsRef,
      activeTabIdRef: { current: tab.id },
      isProjectRef: { current: true },
      isElectron: true,
      openDiffTab: vi.fn(),
      onEditorRemountNeeded: vi.fn(),
      tryCreateSnapshot: vi.fn(async () => undefined),
    },
  };
}

function HookHost({ params }: { params: UseFileWatchIntegrationParams }): null {
  useFileWatchIntegration(params);
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let root: Root;
let container: HTMLDivElement;

async function mountHook(params: UseFileWatchIntegrationParams): Promise<void> {
  await act(async () => {
    root.render(<HookHost params={params} />);
  });
  // Let the watcher's async baseline initialization complete
  await sleep(60);
}

function dispatchBlur(): void {
  window.dispatchEvent(new Event("blur"));
}

function dispatchFocus(): void {
  window.dispatchEvent(new Event("focus"));
}

beforeEach(() => {
  // jsdom's document.hasFocus() is unreliable (returns false in headless
  // runs); pin the initial activity state to "focused" so the watcher
  // starts in the foreground state, as in the real app.
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  mockLastModified = 1000;
  mockFileContent = "initial content";
  mockGetFileMetadata.mockClear();
  mockReadFile.mockClear();
  mockWriteFile.mockClear();
  notificationInfo.mockClear();
  notificationShowMessage.mockClear();
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

describe("#1448 — focus round-trip with no disk change (#1445 symptom guard)", () => {
  it("fires no external reload and no notification when nothing changed on disk", async () => {
    const tab = makeTab();
    const harness = makeHarness(tab);
    await mountHook(harness.params);

    // Lose focus → policy pauses the watcher
    await act(async () => {
      dispatchBlur();
    });
    await sleep(20);

    // Regain focus → watcher resumes and runs its catch-up comparison
    await act(async () => {
      dispatchFocus();
    });
    await sleep(80);

    // Disk did not change → NO reload, NO notification, tab untouched
    expect(notificationInfo).not.toHaveBeenCalled();
    expect(notificationShowMessage).not.toHaveBeenCalled();
    const after = harness.getTab(tab.id);
    expect(after.pendingExternalContent ?? null).toBeNull();
    expect(after.content).toBe("initial content");
    expect(after.fileSyncStatus).toBe("clean");
  });
});

describe("#1448 — genuine external change while paused", () => {
  it("routes a real disk change on a dirty tab through the existing conflict flow", async () => {
    const tab = makeTab({
      content: "local edits",
      isDirty: true,
      fileSyncStatus: "dirty",
    });
    const harness = makeHarness(tab);
    await mountHook(harness.params);

    await act(async () => {
      dispatchBlur();
    });
    await sleep(20);

    // External tool modifies the file while the window is in the background
    mockFileContent = "external content";
    mockLastModified = 5000;

    await act(async () => {
      dispatchFocus();
    });
    await sleep(80);

    // Existing conflict flow fired: persistent warning + conflicted state
    expect(notificationShowMessage).toHaveBeenCalledTimes(1);
    expect(notificationShowMessage).toHaveBeenCalledWith(
      "「test.mdi」が外部で変更されました",
      expect.objectContaining({ type: "warning" }),
    );
    const after = harness.getTab(tab.id);
    expect(after.fileSyncStatus).toBe("conflicted");
    expect(after.conflictDiskContent).toBe("external content");
    // Local buffer untouched
    expect(after.content).toBe("local edits");
  });

  it("auto-reloads a clean tab via pendingExternalContent (existing flow)", async () => {
    const tab = makeTab();
    const harness = makeHarness(tab);
    await mountHook(harness.params);

    await act(async () => {
      dispatchBlur();
    });
    await sleep(20);

    mockFileContent = "external content";
    mockLastModified = 5000;

    await act(async () => {
      dispatchFocus();
    });
    await sleep(80);

    expect(notificationInfo).toHaveBeenCalledWith("「test.mdi」が更新されました", 3000);
    const after = harness.getTab(tab.id);
    expect(after.pendingExternalContent).toBe("external content");
    expect(after.fileSyncStatus).toBe("clean");
  });
});

describe("#1448 — self-save while paused is not misdetected", () => {
  it("does not treat a save-executor write during the pause as an external change", async () => {
    const tab = makeTab({
      content: "edited content",
      isDirty: true,
      fileSyncStatus: "dirty",
    });
    const harness = makeHarness(tab);
    await mountHook(harness.params);

    await act(async () => {
      dispatchBlur();
    });
    await sleep(20);

    // Auto-save style flow: the save-executor writes through the VFS and
    // registers suppressFileWatch with the written content's hash.
    const outcome = await executeTabSave({
      tab: harness.getTab(tab.id),
      isProject: true,
      tabsRef: harness.tabsRef,
      setTabs: harness.params.setTabs,
      tryCreateSnapshot: vi.fn(async () => undefined),
      isAutoSave: true,
    });
    expect(outcome.status).toBe("saved");
    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    // The mock VFS advanced the file's mtime, like a real filesystem would
    expect(mockLastModified).toBeGreaterThan(1000);

    await act(async () => {
      dispatchFocus();
    });
    await sleep(80);

    // Resume catch-up sees the newer mtime but the content hash matches the
    // app's own save → no notification, no conflict, no pending reload
    expect(notificationInfo).not.toHaveBeenCalled();
    expect(notificationShowMessage).not.toHaveBeenCalled();
    const after = harness.getTab(tab.id);
    expect(after.fileSyncStatus).toBe("clean");
    expect(after.pendingExternalContent ?? null).toBeNull();
  });

  it("ignores the save echo even after the time-boxed suppression expired (Codex review)", async () => {
    // The suppressFileWatch entry lives only ~poll interval + 3s. A long
    // background stay outlives it; on resume the watcher reports our own
    // write (mtime advanced, suppression gone). buildOnChanged's echo guard
    // (diskContent === lastSavedContent) must absorb it.
    const tab = makeTab({
      content: "edited content",
      isDirty: true,
      fileSyncStatus: "dirty",
    });
    const harness = makeHarness(tab);
    await mountHook(harness.params);

    await act(async () => {
      dispatchBlur();
    });
    await sleep(20);

    const outcome = await executeTabSave({
      tab: harness.getTab(tab.id),
      isProject: true,
      tabsRef: harness.tabsRef,
      setTabs: harness.params.setTabs,
      tryCreateSnapshot: vi.fn(async () => undefined),
      isAutoSave: true,
    });
    expect(outcome.status).toBe("saved");

    // Simulate suppression expiry: register a zero-duration suppression for
    // the same content, which immediately replaces and expires the entry the
    // save-executor registered.
    suppressFileWatch("/test.mdi", mockFileContent, 0);
    await sleep(5);

    await act(async () => {
      dispatchFocus();
    });
    await sleep(80);

    // The watcher fires onChanged (suppression expired, mtime advanced), but
    // the echo guard sees diskContent === lastSavedContent and drops it.
    expect(notificationInfo).not.toHaveBeenCalled();
    expect(notificationShowMessage).not.toHaveBeenCalled();
    const after = harness.getTab(tab.id);
    expect(after.fileSyncStatus).toBe("clean");
    expect(after.conflictDiskContent ?? null).toBeNull();
    expect(after.pendingExternalContent ?? null).toBeNull();
  });
});

describe("#1448 — activity subscription lifecycle", () => {
  it("unsubscribes from the window-activity service on unmount (no leak)", async () => {
    const windowRemove = vi.spyOn(window, "removeEventListener");
    const tab = makeTab();
    const harness = makeHarness(tab);
    await mountHook(harness.params);

    await act(async () => {
      root.unmount();
    });

    // The service detaches its DOM listeners once the last subscriber leaves
    expect(
      windowRemove.mock.calls.filter(([type]) => String(type) === "blur").length,
    ).toBeGreaterThan(0);
    expect(
      windowRemove.mock.calls.filter(([type]) => String(type) === "focus").length,
    ).toBeGreaterThan(0);
    windowRemove.mockRestore();
  });
});
