/**
 * Tests for the unified save executor (#1432) and its lock coverage (#1579).
 *
 * #1432: every save flow shares one pipeline — sanitize, project-VFS vs
 * standalone branching, self-watch suppression, tab-state update, file
 * reference persistence, snapshot creation.
 *
 * #1579: the executor acquires the unified save lock for *every* flow,
 * including targets without a path (web File System Access handles and
 * untitled tabs), which previously skipped locking entirely.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { saveMdiFile } from "../../project/mdi-file";
import { getProjectFileService } from "../../services/project-file-service";
import { suppressFileWatch } from "../../services/file-watcher";
import { executeTabSave, getSaveLockKey } from "../save-executor";
import { acquireSaveLock, isSaveLocked, clearSaveLocks } from "../save-lock";
import { isEditorTab } from "../tab-types";
import type { Dispatch, SetStateAction } from "react";
import type { MdiFileDescriptor } from "../../project/mdi-file";
import type { EditorTabState, TabState } from "../tab-types";

vi.mock("../../project/mdi-file", () => ({
  saveMdiFile: vi.fn(),
}));
vi.mock("../../services/project-file-service", () => ({
  getProjectFileService: vi.fn(),
}));
vi.mock("../../services/file-watcher", () => ({
  suppressFileWatch: vi.fn(),
}));

const saveMdiFileMock = vi.mocked(saveMdiFile);
const getProjectFileServiceMock = vi.mocked(getProjectFileService);
const suppressFileWatchMock = vi.mocked(suppressFileWatch);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTab(overrides: Partial<EditorTabState> = {}): EditorTabState {
  return {
    tabKind: "editor",
    id: "tab-1",
    file: { path: "/p/main.mdi", handle: null, name: "main.mdi" },
    content: "edited content",
    lastSavedContent: "old content",
    isDirty: true,
    lastSavedTime: 1_000_000,
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
  tabsRef: { current: TabState[] };
  setTabs: Dispatch<SetStateAction<TabState[]>>;
  getTab: (id: string) => EditorTabState;
}

function makeHarness(initialTabs: TabState[]): Harness {
  const tabsRef = { current: initialTabs };
  const setTabs: Dispatch<SetStateAction<TabState[]>> = (updater) => {
    tabsRef.current =
      typeof updater === "function"
        ? (updater as (prev: TabState[]) => TabState[])(tabsRef.current)
        : updater;
  };
  return {
    tabsRef,
    setTabs,
    getTab: (id: string): EditorTabState => {
      const tab = tabsRef.current.find((t) => t.id === id);
      if (!tab || !isEditorTab(tab)) throw new Error(`editor tab not found: ${id}`);
      return tab;
    },
  };
}

let vfsWriteFile: ReturnType<typeof vi.fn>;
let vfsReadFile: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  clearSaveLocks();
  vfsWriteFile = vi.fn().mockResolvedValue(undefined);
  vfsReadFile = vi.fn().mockResolvedValue("{}");
  getProjectFileServiceMock.mockReturnValue({
    writeFile: vfsWriteFile,
    readFile: vfsReadFile,
  } as unknown as ReturnType<typeof getProjectFileService>);
});

// ---------------------------------------------------------------------------
// getSaveLockKey (#1579: stable key even when path is null)
// ---------------------------------------------------------------------------

describe("getSaveLockKey", () => {
  it("uses the raw path for path-based files", () => {
    const tab = makeTab();
    expect(getSaveLockKey(tab)).toBe("/p/main.mdi");
  });

  it("uses a stable identity key for path-less handle-based files (web)", () => {
    const handle = {} as unknown as FileSystemFileHandle;
    const tabA = makeTab({ id: "tab-a", file: { path: null, handle, name: "a.mdi" } });
    const tabB = makeTab({ id: "tab-b", file: { path: null, handle, name: "a.mdi" } });
    const key = getSaveLockKey(tabA);
    // Same handle identity → same key, even across different tabs
    expect(getSaveLockKey(tabB)).toBe(key);
    // Stable across calls
    expect(getSaveLockKey(tabA)).toBe(key);
  });

  it("uses distinct keys for distinct handles", () => {
    const tabA = makeTab({
      file: { path: null, handle: {} as unknown as FileSystemFileHandle, name: "a.mdi" },
    });
    const tabB = makeTab({
      file: { path: null, handle: {} as unknown as FileSystemFileHandle, name: "a.mdi" },
    });
    expect(getSaveLockKey(tabA)).not.toBe(getSaveLockKey(tabB));
  });

  it("falls back to the tab id for untitled tabs", () => {
    const tab = makeTab({ file: null });
    expect(getSaveLockKey(tab)).toBe("tab:tab-1");
  });

  it("keys Save As (forceDialog) by tab id, not the original path", () => {
    const tab = makeTab();
    expect(getSaveLockKey(tab, { forceDialog: true })).toBe("tab:tab-1");
  });
});

// ---------------------------------------------------------------------------
// Lock acquisition (#1579)
// ---------------------------------------------------------------------------

describe("executeTabSave: unified lock acquisition (#1579)", () => {
  it("returns 'locked' and does not write while the path lock is held", async () => {
    const tab = makeTab();
    const h = makeHarness([tab]);
    acquireSaveLock("/p/main.mdi");

    const outcome = await executeTabSave({
      tab,
      isProject: true,
      tabsRef: h.tabsRef,
      setTabs: h.setTabs,
      tryCreateSnapshot: vi.fn(),
    });

    expect(outcome.status).toBe("locked");
    expect(vfsWriteFile).not.toHaveBeenCalled();
  });

  it("serializes handle-based saves even though path is null (web gap)", async () => {
    const handle = {} as unknown as FileSystemFileHandle;
    const tab = makeTab({ file: { path: null, handle, name: "a.mdi" } });
    const h = makeHarness([tab]);
    acquireSaveLock(getSaveLockKey(tab));

    const outcome = await executeTabSave({
      tab,
      isProject: false,
      tabsRef: h.tabsRef,
      setTabs: h.setTabs,
      tryCreateSnapshot: vi.fn(),
    });

    expect(outcome.status).toBe("locked");
    expect(saveMdiFileMock).not.toHaveBeenCalled();
  });

  it("rejects a second concurrent save for the same path while the first is in flight", async () => {
    const tab = makeTab();
    const h = makeHarness([tab]);
    let resolveWrite: () => void = () => {};
    vfsWriteFile.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveWrite = resolve;
      }),
    );

    const first = executeTabSave({
      tab,
      isProject: true,
      tabsRef: h.tabsRef,
      setTabs: h.setTabs,
      tryCreateSnapshot: vi.fn(),
    });
    const second = await executeTabSave({
      tab,
      isProject: true,
      tabsRef: h.tabsRef,
      setTabs: h.setTabs,
      tryCreateSnapshot: vi.fn(),
    });

    expect(second.status).toBe("locked");
    resolveWrite();
    const firstOutcome = await first;
    expect(firstOutcome.status).toBe("saved");
    expect(vfsWriteFile).toHaveBeenCalledTimes(1);
  });

  it("releases the lock after success and after failure", async () => {
    const tab = makeTab();
    const h = makeHarness([tab]);

    await executeTabSave({
      tab,
      isProject: true,
      tabsRef: h.tabsRef,
      setTabs: h.setTabs,
      tryCreateSnapshot: vi.fn(),
    });
    expect(isSaveLocked("/p/main.mdi")).toBe(false);

    vfsWriteFile.mockRejectedValue(new Error("disk full"));
    const failed = await executeTabSave({
      tab,
      isProject: true,
      tabsRef: h.tabsRef,
      setTabs: h.setTabs,
      tryCreateSnapshot: vi.fn(),
    });
    expect(failed.status).toBe("failed");
    expect(isSaveLocked("/p/main.mdi")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Project mode pipeline
// ---------------------------------------------------------------------------

describe("executeTabSave: project mode (VFS write)", () => {
  it("suppresses the file watcher and writes sanitized content via VFS", async () => {
    const tab = makeTab({ content: "<div>本文</div>" });
    const h = makeHarness([tab]);

    const outcome = await executeTabSave({
      tab,
      isProject: true,
      tabsRef: h.tabsRef,
      setTabs: h.setTabs,
      tryCreateSnapshot: vi.fn(),
    });

    expect(outcome.status).toBe("saved");
    expect(suppressFileWatchMock).toHaveBeenCalledWith("/p/main.mdi", "本文");
    expect(vfsWriteFile).toHaveBeenCalledWith("/p/main.mdi", "本文");
    // Standalone path must not be used in project mode
    expect(saveMdiFileMock).not.toHaveBeenCalled();
  });

  it("updates tab state: lastSavedContent / isDirty / fileSyncStatus / lastSaveWasAuto", async () => {
    const tab = makeTab({ content: "本文" });
    const h = makeHarness([tab]);

    await executeTabSave({
      tab,
      isProject: true,
      tabsRef: h.tabsRef,
      setTabs: h.setTabs,
      tryCreateSnapshot: vi.fn(),
      isAutoSave: true,
    });

    const updated = h.getTab("tab-1");
    expect(updated.lastSavedContent).toBe("本文");
    expect(updated.isDirty).toBe(false);
    expect(updated.fileSyncStatus).toBe("clean");
    expect(updated.lastSaveWasAuto).toBe(true);
    expect(updated.isSaving).toBe(false);
    expect(updated.conflictDiskContent).toBeNull();
  });

  it("keeps isDirty when the user edits during the async write", async () => {
    const tab = makeTab({ content: "保存時の内容" });
    const h = makeHarness([tab]);
    vfsWriteFile.mockImplementation(async () => {
      // Simulate an edit landing while the write is in flight
      h.setTabs((prev) =>
        prev.map((t) => (t.id === "tab-1" ? { ...t, content: "書き込み中の追記" } : t)),
      );
    });

    await executeTabSave({
      tab,
      isProject: true,
      tabsRef: h.tabsRef,
      setTabs: h.setTabs,
      tryCreateSnapshot: vi.fn(),
    });

    const updated = h.getTab("tab-1");
    expect(updated.isDirty).toBe(true);
    expect(updated.fileSyncStatus).toBe("dirty");
    expect(updated.lastSavedContent).toBe("保存時の内容");
  });

  it("creates a snapshot with the given type and the tab's path", async () => {
    const tab = makeTab({ content: "本文" });
    const h = makeHarness([tab]);
    const tryCreateSnapshot = vi.fn().mockResolvedValue(undefined);

    await executeTabSave({
      tab,
      isProject: true,
      tabsRef: h.tabsRef,
      setTabs: h.setTabs,
      tryCreateSnapshot,
      snapshotType: "pre-close",
    });

    expect(tryCreateSnapshot).toHaveBeenCalledWith("pre-close", "/p/main.mdi", "main.mdi", "本文");
  });

  it("skips snapshot creation when snapshotType is omitted", async () => {
    const tab = makeTab();
    const h = makeHarness([tab]);
    const tryCreateSnapshot = vi.fn();

    await executeTabSave({
      tab,
      isProject: true,
      tabsRef: h.tabsRef,
      setTabs: h.setTabs,
      tryCreateSnapshot,
    });

    expect(tryCreateSnapshot).not.toHaveBeenCalled();
  });

  it("bumps project.json lastModified only when updateProjectMetadata is set", async () => {
    const tab = makeTab();
    const h = makeHarness([tab]);
    vfsReadFile.mockResolvedValue(JSON.stringify({ lastModified: 1 }));

    await executeTabSave({
      tab,
      isProject: true,
      tabsRef: h.tabsRef,
      setTabs: h.setTabs,
      tryCreateSnapshot: vi.fn(),
      updateProjectMetadata: true,
    });

    expect(vfsReadFile).toHaveBeenCalledWith(".illusions/project.json");
    const projectJsonWrite = vfsWriteFile.mock.calls.find(
      (call) => call[0] === ".illusions/project.json",
    );
    expect(projectJsonWrite).toBeDefined();
    const written = JSON.parse((projectJsonWrite as string[])[1]) as { lastModified: number };
    expect(written.lastModified).toBeGreaterThan(1);

    // Default: no metadata update
    vfsReadFile.mockClear();
    await executeTabSave({
      tab,
      isProject: true,
      tabsRef: h.tabsRef,
      setTabs: h.setTabs,
      tryCreateSnapshot: vi.fn(),
    });
    expect(vfsReadFile).not.toHaveBeenCalled();
  });

  it("project.json update failure is non-fatal", async () => {
    const tab = makeTab();
    const h = makeHarness([tab]);
    vfsReadFile.mockRejectedValue(new Error("missing"));

    const outcome = await executeTabSave({
      tab,
      isProject: true,
      tabsRef: h.tabsRef,
      setTabs: h.setTabs,
      tryCreateSnapshot: vi.fn(),
      updateProjectMetadata: true,
    });

    expect(outcome.status).toBe("saved");
  });
});

// ---------------------------------------------------------------------------
// Conflict re-check (#1562 b)
// ---------------------------------------------------------------------------

describe("executeTabSave: conflict re-check", () => {
  it("aborts without writing when the latest tab state is conflicted", async () => {
    const tab = makeTab();
    // The watcher flagged a conflict after the caller captured its snapshot
    const h = makeHarness([{ ...tab, fileSyncStatus: "conflicted" }]);

    const outcome = await executeTabSave({
      tab,
      isProject: true,
      tabsRef: h.tabsRef,
      setTabs: h.setTabs,
      tryCreateSnapshot: vi.fn(),
    });

    expect(outcome.status).toBe("conflicted");
    expect(vfsWriteFile).not.toHaveBeenCalled();
    expect(isSaveLocked("/p/main.mdi")).toBe(false);
  });

  it("returns 'skipped' when the tab no longer exists", async () => {
    const tab = makeTab();
    const h = makeHarness([]);

    const outcome = await executeTabSave({
      tab,
      isProject: true,
      tabsRef: h.tabsRef,
      setTabs: h.setTabs,
      tryCreateSnapshot: vi.fn(),
    });

    expect(outcome.status).toBe("skipped");
    expect(vfsWriteFile).not.toHaveBeenCalled();
  });

  it("recheckConflict=false saves even when conflicted (Save As semantics)", async () => {
    const tab = makeTab({ fileSyncStatus: "conflicted" });
    const h = makeHarness([tab]);
    saveMdiFileMock.mockResolvedValue({
      descriptor: { path: "/p/new.mdi", handle: null, name: "new.mdi" },
      content: "edited content",
    });

    const outcome = await executeTabSave({
      tab,
      isProject: false,
      tabsRef: h.tabsRef,
      setTabs: h.setTabs,
      tryCreateSnapshot: vi.fn(),
      forceDialog: true,
      recheckConflict: false,
    });

    expect(outcome.status).toBe("saved");
    const updated = h.getTab("tab-1");
    expect(updated.fileSyncStatus).toBe("clean");
    expect(updated.conflictDiskContent).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Standalone pipeline (saveMdiFile / Save As)
// ---------------------------------------------------------------------------

describe("executeTabSave: standalone (saveMdiFile)", () => {
  it("suppresses the file watcher before saving an existing standalone path", async () => {
    const tab = makeTab({ content: "<div>本文</div>" });
    const h = makeHarness([tab]);
    const descriptor = tab.file as MdiFileDescriptor;
    saveMdiFileMock.mockResolvedValue({ descriptor, content: "本文" });

    const outcome = await executeTabSave({
      tab,
      isProject: false,
      tabsRef: h.tabsRef,
      setTabs: h.setTabs,
      tryCreateSnapshot: vi.fn(),
    });

    expect(outcome.status).toBe("saved");
    expect(suppressFileWatchMock).toHaveBeenCalledWith("/p/main.mdi", "本文");
    expect(saveMdiFileMock).toHaveBeenCalledWith({
      descriptor,
      content: "本文",
      fileType: ".mdi",
    });
    expect(suppressFileWatchMock.mock.invocationCallOrder[0]).toBeLessThan(
      saveMdiFileMock.mock.invocationCallOrder[0],
    );
  });

  it("returns 'cancelled' and clears isSaving when the dialog is cancelled", async () => {
    const tab = makeTab({ file: null });
    const h = makeHarness([tab]);
    saveMdiFileMock.mockResolvedValue(null);
    const tryCreateSnapshot = vi.fn();
    const persistFileReference = vi.fn();

    const outcome = await executeTabSave({
      tab,
      isProject: false,
      tabsRef: h.tabsRef,
      setTabs: h.setTabs,
      tryCreateSnapshot,
      snapshotType: "manual",
      persistFileReference,
    });

    expect(outcome.status).toBe("cancelled");
    expect(h.getTab("tab-1").isSaving).toBe(false);
    expect(h.getTab("tab-1").isDirty).toBe(true);
    expect(tryCreateSnapshot).not.toHaveBeenCalled();
    expect(persistFileReference).not.toHaveBeenCalled();
  });

  it("writes the new descriptor back and persists the file reference", async () => {
    const tab = makeTab({ file: null, content: "本文" });
    const h = makeHarness([tab]);
    const descriptor: MdiFileDescriptor = { path: "/p/new.mdi", handle: null, name: "new.mdi" };
    saveMdiFileMock.mockResolvedValue({ descriptor, content: "本文" });
    const persistFileReference = vi.fn().mockResolvedValue(true);
    const tryCreateSnapshot = vi.fn().mockResolvedValue(undefined);

    const outcome = await executeTabSave({
      tab,
      isProject: false,
      tabsRef: h.tabsRef,
      setTabs: h.setTabs,
      tryCreateSnapshot,
      snapshotType: "manual",
      persistFileReference,
    });

    expect(outcome).toMatchObject({ status: "saved", persistFailed: false });
    expect(h.getTab("tab-1").file).toEqual(descriptor);
    expect(persistFileReference).toHaveBeenCalledWith(descriptor, "本文");
    expect(tryCreateSnapshot).toHaveBeenCalledWith("manual", "/p/new.mdi", "new.mdi", "本文");
  });

  it("reports persistFailed=true when file-reference persistence fails", async () => {
    const tab = makeTab({ file: null });
    const h = makeHarness([tab]);
    saveMdiFileMock.mockResolvedValue({
      descriptor: { path: "/p/new.mdi", handle: null, name: "new.mdi" },
      content: "edited content",
    });

    const outcome = await executeTabSave({
      tab,
      isProject: false,
      tabsRef: h.tabsRef,
      setTabs: h.setTabs,
      tryCreateSnapshot: vi.fn(),
      persistFileReference: vi.fn().mockResolvedValue(false),
    });

    expect(outcome).toMatchObject({ status: "saved", persistFailed: true });
  });

  it("forceDialog strips path and handle so the dialog is always shown", async () => {
    const tab = makeTab();
    const h = makeHarness([tab]);
    saveMdiFileMock.mockResolvedValue(null);

    await executeTabSave({
      tab,
      isProject: true, // even in project mode, Save As must use the dialog
      tabsRef: h.tabsRef,
      setTabs: h.setTabs,
      tryCreateSnapshot: vi.fn(),
      forceDialog: true,
      recheckConflict: false,
    });

    expect(vfsWriteFile).not.toHaveBeenCalled();
    expect(saveMdiFileMock).toHaveBeenCalledWith({
      descriptor: { path: null, handle: null, name: "main.mdi" },
      content: "edited content",
      fileType: ".mdi",
    });
  });

  it("snapshotPathFallback='name' snapshots path-less saves; default skips", async () => {
    const handle = {} as unknown as FileSystemFileHandle;
    const tab = makeTab({ file: { path: null, handle, name: "a.mdi" }, content: "本文" });
    const h = makeHarness([tab]);
    saveMdiFileMock.mockResolvedValue({
      descriptor: { path: null, handle, name: "a.mdi" },
      content: "本文",
    });

    const tryCreateSnapshot = vi.fn().mockResolvedValue(undefined);
    await executeTabSave({
      tab,
      isProject: false,
      tabsRef: h.tabsRef,
      setTabs: h.setTabs,
      tryCreateSnapshot,
      snapshotType: "pre-close",
      snapshotPathFallback: "name",
    });
    expect(tryCreateSnapshot).toHaveBeenCalledWith("pre-close", "a.mdi", "a.mdi", "本文");

    tryCreateSnapshot.mockClear();
    await executeTabSave({
      tab,
      isProject: false,
      tabsRef: h.tabsRef,
      setTabs: h.setTabs,
      tryCreateSnapshot,
      snapshotType: "manual",
    });
    expect(tryCreateSnapshot).not.toHaveBeenCalled();
  });

  it("updateTabState=false leaves tab state untouched (window-quit flow)", async () => {
    const tab = makeTab();
    const h = makeHarness([tab]);
    saveMdiFileMock.mockResolvedValue({
      descriptor: tab.file as MdiFileDescriptor,
      content: "edited content",
    });

    const outcome = await executeTabSave({
      tab,
      isProject: false,
      tabsRef: h.tabsRef,
      setTabs: h.setTabs,
      tryCreateSnapshot: vi.fn(),
      updateTabState: false,
    });

    expect(outcome.status).toBe("saved");
    expect(h.getTab("tab-1").isDirty).toBe(true);
    expect(h.getTab("tab-1").lastSavedContent).toBe("old content");
  });
});

// ---------------------------------------------------------------------------
// Failure and unmount handling
// ---------------------------------------------------------------------------

describe("executeTabSave: failure and unmount handling", () => {
  it("returns 'failed' with the error and clears isSaving", async () => {
    const tab = makeTab();
    const h = makeHarness([tab]);
    const error = new Error("EACCES");
    vfsWriteFile.mockRejectedValue(error);

    const outcome = await executeTabSave({
      tab,
      isProject: true,
      tabsRef: h.tabsRef,
      setTabs: h.setTabs,
      tryCreateSnapshot: vi.fn(),
    });

    expect(outcome).toEqual({ status: "failed", error });
    expect(h.getTab("tab-1").isSaving).toBe(false);
  });

  it("skips tab-state updates and snapshots after unmount (auto-save semantics)", async () => {
    const tab = makeTab();
    const h = makeHarness([tab]);
    const tryCreateSnapshot = vi.fn();

    const outcome = await executeTabSave({
      tab,
      isProject: true,
      tabsRef: h.tabsRef,
      setTabs: h.setTabs,
      tryCreateSnapshot,
      snapshotType: "auto",
      isMounted: () => false,
    });

    expect(outcome.status).toBe("saved");
    expect(vfsWriteFile).toHaveBeenCalled();
    expect(h.getTab("tab-1").isDirty).toBe(true);
    expect(tryCreateSnapshot).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Save As fileType recompute (#1871)
// ---------------------------------------------------------------------------

describe("executeTabSave: Save As recomputes fileType from new descriptor (#1871)", () => {
  it("changes fileType from .mdi to .txt when Save As targets a .txt file", async () => {
    const tab = makeTab({ file: null, fileType: ".mdi", content: "本文" });
    const h = makeHarness([tab]);
    const newDescriptor: MdiFileDescriptor = {
      path: "/p/export.txt",
      handle: null,
      name: "export.txt",
    };
    saveMdiFileMock.mockResolvedValue({ descriptor: newDescriptor, content: "本文" });

    const outcome = await executeTabSave({
      tab,
      isProject: false,
      tabsRef: h.tabsRef,
      setTabs: h.setTabs,
      tryCreateSnapshot: vi.fn(),
      forceDialog: true,
      recheckConflict: false,
    });

    expect(outcome.status).toBe("saved");
    const updated = h.getTab("tab-1");
    expect(updated.fileType).toBe(".txt");
    expect(updated.file).toEqual(newDescriptor);
  });

  it("changes fileType from .txt to .mdi when Save As targets a .mdi file", async () => {
    const tab = makeTab({
      file: { path: "/p/notes.txt", handle: null, name: "notes.txt" },
      fileType: ".txt",
      content: "本文",
    });
    const h = makeHarness([tab]);
    const newDescriptor: MdiFileDescriptor = {
      path: "/p/novel.mdi",
      handle: null,
      name: "novel.mdi",
    };
    saveMdiFileMock.mockResolvedValue({ descriptor: newDescriptor, content: "本文" });

    const outcome = await executeTabSave({
      tab,
      isProject: false,
      tabsRef: h.tabsRef,
      setTabs: h.setTabs,
      tryCreateSnapshot: vi.fn(),
      forceDialog: true,
      recheckConflict: false,
    });

    expect(outcome.status).toBe("saved");
    const updated = h.getTab("tab-1");
    expect(updated.fileType).toBe(".mdi");
    expect(updated.file).toEqual(newDescriptor);
  });

  it("keeps fileType unchanged for project-mode save (no descriptor update)", async () => {
    const tab = makeTab({ fileType: ".mdi", content: "本文" });
    const h = makeHarness([tab]);

    await executeTabSave({
      tab,
      isProject: true,
      tabsRef: h.tabsRef,
      setTabs: h.setTabs,
      tryCreateSnapshot: vi.fn(),
    });

    // Project mode does not change the file descriptor
    expect(h.getTab("tab-1").fileType).toBe(".mdi");
  });
});
