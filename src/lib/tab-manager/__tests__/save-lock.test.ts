/**
 * Tests for fix #1562: concurrent-save guards in the auto-save flow.
 *
 * (a) Unified per-path save lock — the active-tab save (use-file-io) and the
 *     background auto-save (use-auto-save) previously used independent guards
 *     (isSavingRef / savingTabIdsRef) that could not see each other, allowing
 *     two concurrent writes to the same path. Both paths now share the
 *     synchronous per-path lock in save-lock.ts.
 *
 * (b) conflicted-transition TOCTOU — tabsRef is only reassigned from React
 *     state on the next render, so the auto-save interval could read a stale
 *     non-conflicted snapshot right after the file watcher flagged a conflict
 *     and overwrite the external change. buildOnChanged now eagerly mirrors
 *     the conflicted transition into tabsRef before React re-renders.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { acquireSaveLock, releaseSaveLock, isSaveLocked, clearSaveLocks } from "../save-lock";
import {
  buildOnChanged,
  RECENT_SAVE_EXTERNAL_RELOAD_GRACE_MS,
  RECENT_SAVE_RECHECK_DELAY_MS,
} from "../use-file-watch-integration";
import { isEditorTab } from "../tab-types";
import type { Dispatch, SetStateAction } from "react";
import type { EditorTabState, TabState } from "../tab-types";
import type { UseFileWatchIntegrationParams } from "../use-file-watch-integration";

type SetTabs = Dispatch<SetStateAction<TabState[]>>;
type OpenDiffTab = UseFileWatchIntegrationParams["openDiffTab"];

// Mock notificationManager so its actions are captured rather than rendered
vi.mock("../../services/notification-manager", () => ({
  notificationManager: {
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    showMessage: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEditorTab(overrides: Partial<EditorTabState> = {}): EditorTabState {
  return {
    tabKind: "editor",
    id: "tab-1",
    file: { path: "/p/main.mdi", handle: null, name: "main.mdi" },
    content: "in-memory edited content",
    lastSavedContent: "original disk content",
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

// ---------------------------------------------------------------------------
// (a) Per-path save lock
// ---------------------------------------------------------------------------

describe("save-lock: unified per-path guard (#1562 a)", () => {
  beforeEach(() => {
    clearSaveLocks();
  });

  it("acquires a free lock and reports it as held", () => {
    expect(acquireSaveLock("/p/a.mdi")).toBe(true);
    expect(isSaveLocked("/p/a.mdi")).toBe(true);
  });

  it("rejects a second acquire for the same path while held", () => {
    // Simulates: background auto-save in flight, then the active-tab
    // saveFile (or the next interval) tries to write the same path.
    expect(acquireSaveLock("/p/a.mdi")).toBe(true);
    expect(acquireSaveLock("/p/a.mdi")).toBe(false);
  });

  it("allows re-acquire after release", () => {
    expect(acquireSaveLock("/p/a.mdi")).toBe(true);
    releaseSaveLock("/p/a.mdi");
    expect(isSaveLocked("/p/a.mdi")).toBe(false);
    expect(acquireSaveLock("/p/a.mdi")).toBe(true);
  });

  it("locks are independent per path", () => {
    expect(acquireSaveLock("/p/a.mdi")).toBe(true);
    expect(acquireSaveLock("/p/b.mdi")).toBe(true);
    releaseSaveLock("/p/a.mdi");
    expect(isSaveLocked("/p/a.mdi")).toBe(false);
    expect(isSaveLocked("/p/b.mdi")).toBe(true);
  });

  it("releasing an unheld path is a no-op", () => {
    expect(() => releaseSaveLock("/p/never-acquired.mdi")).not.toThrow();
    expect(isSaveLocked("/p/never-acquired.mdi")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// (b) conflicted-transition TOCTOU: eager tabsRef mirror
// ---------------------------------------------------------------------------

describe("buildOnChanged: eagerly mirrors conflicted into tabsRef (#1562 b)", () => {
  let setTabs: SetTabs;
  let openDiffTab: OpenDiffTab;
  let tabsRef: { current: TabState[] };

  beforeEach(() => {
    vi.clearAllMocks();
    setTabs = vi.fn<SetTabs>();
    openDiffTab = vi.fn<OpenDiffTab>();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("dirty tab: tabsRef shows conflicted before React re-renders", () => {
    const tab = makeEditorTab({ fileSyncStatus: "dirty", isDirty: true });
    tabsRef = { current: [tab] };
    const onChanged = buildOnChanged(tab.id, setTabs, tabsRef, openDiffTab);

    // External change arrives on a dirty tab. setTabs is only queued (mock
    // does not apply the updater), simulating the window before the next
    // render commits — tabsRef must already reflect the conflict so the
    // auto-save interval guard skips the tab.
    onChanged("external disk content", 2_000_000);

    const latest = tabsRef.current.find((t) => t.id === tab.id);
    expect(latest && isEditorTab(latest)).toBe(true);
    if (latest && isEditorTab(latest)) {
      expect(latest.fileSyncStatus).toBe("conflicted");
      expect(latest.conflictDiskContent).toBe("external disk content");
    }
  });

  it("auto-save guard skips the tab right after the watcher fires (TOCTOU scenario)", () => {
    const tab = makeEditorTab({ fileSyncStatus: "dirty", isDirty: true });
    tabsRef = { current: [tab] };
    const onChanged = buildOnChanged(tab.id, setTabs, tabsRef, openDiffTab);

    onChanged("external disk content", 2_000_000);

    // Mirrors the guard in useAutoSave: it reads the tabsRef snapshot.
    const snapshot = tabsRef.current.find((t) => t.id === tab.id);
    const shouldAutoSave =
      snapshot !== undefined &&
      isEditorTab(snapshot) &&
      snapshot.fileSyncStatus !== "conflicted" &&
      snapshot.isDirty &&
      snapshot.file !== null &&
      !snapshot.isSaving;

    expect(shouldAutoSave).toBe(false);
  });

  it("does not touch other tabs in tabsRef", () => {
    const tab = makeEditorTab({ id: "tab-1", fileSyncStatus: "dirty" });
    const other = makeEditorTab({
      id: "tab-2",
      file: { path: "/p/other.mdi", handle: null, name: "other.mdi" },
      fileSyncStatus: "dirty",
    });
    tabsRef = { current: [tab, other] };
    const onChanged = buildOnChanged(tab.id, setTabs, tabsRef, openDiffTab);

    onChanged("external disk content", 2_000_000);

    const untouched = tabsRef.current.find((t) => t.id === "tab-2");
    if (untouched && isEditorTab(untouched)) {
      expect(untouched.fileSyncStatus).toBe("dirty");
      expect(untouched.conflictDiskContent).toBeNull();
    }
  });

  it("clean tab: auto-reload path leaves tabsRef status untouched (no false conflict)", () => {
    const tab = makeEditorTab({
      fileSyncStatus: "clean",
      isDirty: false,
      content: "original disk content",
    });
    tabsRef = { current: [tab] };
    const onChanged = buildOnChanged(tab.id, setTabs, tabsRef, openDiffTab);

    onChanged("external disk content", 2_000_000);

    const latest = tabsRef.current.find((t) => t.id === tab.id);
    if (latest && isEditorTab(latest)) {
      expect(latest.fileSyncStatus).toBe("clean");
    }
  });

  it("clean tab: recent stale disk echo is quarantined while the file is re-read", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(2_000_000);

    const tab = makeEditorTab({
      fileSyncStatus: "clean",
      isDirty: false,
      content: "saved after delete",
      lastSavedContent: "saved after delete",
      lastSavedTime: Date.now() - Math.floor(RECENT_SAVE_EXTERNAL_RELOAD_GRACE_MS / 2),
    });
    tabsRef = { current: [tab] };
    const pendingVerifications = new Map<string, ReturnType<typeof setTimeout>>();
    const readDiskContent = vi.fn(async () => "saved after delete");
    const onChanged = buildOnChanged(tab.id, setTabs, tabsRef, openDiffTab, undefined, undefined, {
      filePath: "/p/main.mdi",
      pendingVerifications,
      readDiskContent,
    });

    onChanged("stale cloud copy before delete", 2_000_000);

    const latest = tabsRef.current.find((t) => t.id === tab.id);
    expect(latest && isEditorTab(latest)).toBe(true);
    if (latest && isEditorTab(latest)) {
      expect(latest.content).toBe("saved after delete");
      expect(latest.lastSavedContent).toBe("saved after delete");
      expect(latest.pendingExternalContent ?? null).toBeNull();
      expect(latest.fileSyncStatus).toBe("clean");
      expect(latest.conflictDiskContent).toBeNull();
    }
    expect(setTabs).not.toHaveBeenCalled();
    expect(pendingVerifications.size).toBe(1);

    await vi.advanceTimersByTimeAsync(RECENT_SAVE_RECHECK_DELAY_MS);

    expect(readDiskContent).toHaveBeenCalledWith("/p/main.mdi");
    const afterRecheck = tabsRef.current.find((t) => t.id === tab.id);
    expect(afterRecheck && isEditorTab(afterRecheck)).toBe(true);
    if (afterRecheck && isEditorTab(afterRecheck)) {
      expect(afterRecheck.content).toBe("saved after delete");
      expect(afterRecheck.fileSyncStatus).toBe("clean");
      expect(afterRecheck.conflictDiskContent).toBeNull();
      expect(afterRecheck.pendingExternalContent ?? null).toBeNull();
    }
  });

  it("clean tab: recent disk mismatch becomes a conflict only when the re-read still differs", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(2_000_000);

    const tab = makeEditorTab({
      fileSyncStatus: "clean",
      isDirty: false,
      content: "saved after delete",
      lastSavedContent: "saved after delete",
      lastSavedTime: Date.now() - Math.floor(RECENT_SAVE_EXTERNAL_RELOAD_GRACE_MS / 2),
    });
    tabsRef = { current: [tab] };
    const pendingVerifications = new Map<string, ReturnType<typeof setTimeout>>();
    const readDiskContent = vi.fn(async () => "stale cloud copy before delete");
    const onChanged = buildOnChanged(tab.id, setTabs, tabsRef, openDiffTab, undefined, undefined, {
      filePath: "/p/main.mdi",
      pendingVerifications,
      readDiskContent,
    });

    onChanged("stale cloud copy before delete", 2_000_000);

    let latest = tabsRef.current.find((t) => t.id === tab.id);
    expect(latest && isEditorTab(latest)).toBe(true);
    if (latest && isEditorTab(latest)) {
      expect(latest.content).toBe("saved after delete");
      expect(latest.pendingExternalContent ?? null).toBeNull();
      expect(latest.fileSyncStatus).toBe("clean");
      expect(latest.conflictDiskContent).toBeNull();
    }

    await vi.advanceTimersByTimeAsync(RECENT_SAVE_RECHECK_DELAY_MS);

    latest = tabsRef.current.find((t) => t.id === tab.id);
    expect(latest && isEditorTab(latest)).toBe(true);
    if (latest && isEditorTab(latest)) {
      expect(latest.content).toBe("saved after delete");
      expect(latest.lastSavedContent).toBe("saved after delete");
      expect(latest.pendingExternalContent ?? null).toBeNull();
      expect(latest.fileSyncStatus).toBe("conflicted");
      expect(latest.conflictDiskContent).toBe("stale cloud copy before delete");
    }
  });
});
