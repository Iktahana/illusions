/**
 * Regression tests for the window-activity → auto-save interval wiring
 * (#1466, guarding against a #1445 recurrence).
 *
 * The hook subscribes to the framework-free window-activity service and
 * re-arms its setInterval per the power policy (`getAutoSaveIntervalMs`):
 * 5s foreground, 20s while the window is backgrounded with power-save mode
 * on. These tests drive the REAL hook (createRoot + act, repo pattern,
 * matching file-watch-activity-pause.test.tsx) with fake timers and verify:
 *
 * 1. the interval switches 5s → 20s on blur and back to 5s on focus
 *    (power-save mode on),
 * 2. without power-save mode, blur does NOT throttle (foreground behavior
 *    everywhere),
 * 3. editing during a blur → focus round-trip preserves the tab content —
 *    the hook only saves; it never writes back into the buffer
 *    (no replaceAll-like behavior, the #1445 symptom guard),
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

vi.mock("@/lib/services/notification-manager", () => ({
  notificationManager: {
    warning: vi.fn(),
    info: vi.fn(),
    showMessage: vi.fn(),
  },
}));

// use-auto-save imports the save-executor (only used for non-active dirty
// tabs); mock its VFS-facing dependencies so importing it is side-effect free.
vi.mock("@/lib/services/project-file-service", () => ({
  getProjectFileService: () => ({
    getFileMetadata: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
  }),
}));
vi.mock("@/lib/project/mdi-file", () => ({
  saveMdiFile: vi.fn(),
}));

import { AUTO_SAVE_INTERVAL } from "../types";
import { BACKGROUND_AUTO_SAVE_INTERVAL_MS } from "../../editor-page/power-policy";
import { useAutoSave } from "../use-auto-save";
import { isEditorTab } from "../tab-types";
import type { UseAutoSaveParams } from "../use-auto-save";
import type { Dispatch, SetStateAction } from "react";
import type { EditorTabState, TabId, TabState } from "../tab-types";

// ---------------------------------------------------------------------------
// Harness (pattern shared with file-watch-activity-pause.test.tsx)
// ---------------------------------------------------------------------------

const FILE_PATH = "/project/test.mdi";

function makeTab(overrides: Partial<EditorTabState> = {}): EditorTabState {
  return {
    tabKind: "editor",
    id: "tab-1",
    file: { path: FILE_PATH, handle: null, name: "test.mdi" },
    content: "initial content",
    lastSavedContent: "initial content",
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
  params: UseAutoSaveParams;
  tabsRef: { current: TabState[] };
  saveFile: ReturnType<typeof vi.fn>;
  getTab: (id: TabId) => EditorTabState;
  setTabs: Dispatch<SetStateAction<TabState[]>>;
}

function makeHarness(tab: EditorTabState, powerSaveMode: boolean): Harness {
  const tabsRef = { current: [tab] as TabState[] };
  const setTabs: Dispatch<SetStateAction<TabState[]>> = (updater) => {
    tabsRef.current =
      typeof updater === "function"
        ? (updater as (prev: TabState[]) => TabState[])(tabsRef.current)
        : updater;
  };
  // The active-tab auto-save path: behaves like the real saveFile — marks
  // the tab clean WITHOUT touching its content (saving never edits).
  const saveFile = vi.fn(async () => {
    tabsRef.current = tabsRef.current.map((t) =>
      isEditorTab(t) ? { ...t, isDirty: false, lastSavedContent: t.content } : t,
    );
  });
  return {
    tabsRef,
    setTabs,
    saveFile,
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
      autoSaveEnabled: true,
      powerSaveMode,
      saveFileRef: { current: (_isAutoSave?: boolean) => saveFile() },
      tryCreateSnapshot: vi.fn(async () => undefined),
    },
  };
}

function HookHost({ params }: { params: UseAutoSaveParams }): null {
  useAutoSave(params);
  return null;
}

let root: Root;
let container: HTMLDivElement;

async function mountHook(params: UseAutoSaveParams): Promise<void> {
  await act(async () => {
    root.render(<HookHost params={params} />);
  });
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

function dispatchBlur(): void {
  window.dispatchEvent(new Event("blur"));
}

function dispatchFocus(): void {
  window.dispatchEvent(new Event("focus"));
}

/** Mark the tab dirty again (the saveFile mock cleans it after each save). */
function makeDirty(harness: Harness, content?: string): void {
  harness.tabsRef.current = harness.tabsRef.current.map((t) =>
    isEditorTab(t)
      ? { ...t, content: content ?? t.content, isDirty: true, fileSyncStatus: "dirty" }
      : t,
  );
}

beforeEach(() => {
  // jsdom's document.hasFocus() is unreliable in headless runs; pin the
  // initial activity state to "focused", as in the real app.
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("#1466 — auto-save interval follows the power policy", () => {
  it("switches 5s → 20s on blur (M-4 immediate flush on increase) and back to 5s on focus (power-save mode on)", async () => {
    const harness = makeHarness(makeTab(), true);
    await mountHook(harness.params);

    // Foreground: normal 5s interval fires once.
    await advance(AUTO_SAVE_INTERVAL);
    expect(harness.saveFile).toHaveBeenCalledTimes(1);

    // Background: M-4 flushes immediately on the 5s→20s interval increase,
    // then the 20s timer fires once more at 20s.
    makeDirty(harness);
    await act(async () => {
      dispatchBlur();
    });
    // M-4 immediate flush on blur.
    expect(harness.saveFile).toHaveBeenCalledTimes(2);

    // Tab is now clean; no further tick until 20s.
    await advance(BACKGROUND_AUTO_SAVE_INTERVAL_MS - 1);
    expect(harness.saveFile).toHaveBeenCalledTimes(2);

    // 20s background tick fires.
    makeDirty(harness);
    // Advance the remaining 1ms to hit the 20s mark.
    await advance(1);
    expect(harness.saveFile).toHaveBeenCalledTimes(3);

    // Focus regained: back to the normal 5s interval.
    // (20s→5s is a DECREASE — no immediate flush on focus restore.)
    makeDirty(harness);
    await act(async () => {
      dispatchFocus();
    });
    await advance(AUTO_SAVE_INTERVAL);
    expect(harness.saveFile).toHaveBeenCalledTimes(4);
  });

  it("does not throttle on blur when power-save mode is off", async () => {
    const harness = makeHarness(makeTab(), false);
    await mountHook(harness.params);

    await act(async () => {
      dispatchBlur();
    });
    await advance(AUTO_SAVE_INTERVAL);
    expect(harness.saveFile).toHaveBeenCalledTimes(1);
  });

  it("M-4: flushes immediately on blur (5s→20s interval increase), then waits 20s for the next tick", async () => {
    // Tab starts clean so the initial foreground tick has nothing to save.
    const harness = makeHarness(makeTab({ isDirty: false }), true);
    await mountHook(harness.params);

    // Make dirty, then blur — M-4 must flush once immediately on the
    // 5s→20s interval increase, before installing the 20s timer.
    makeDirty(harness);
    await act(async () => {
      dispatchBlur();
    });
    // Immediate M-4 flush: one save already fired synchronously on blur.
    expect(harness.saveFile).toHaveBeenCalledTimes(1);

    // Tab is now clean (the mock marks it clean). No further save within the
    // next three foreground-equivalent periods.
    await advance(AUTO_SAVE_INTERVAL * 3);
    expect(harness.saveFile).toHaveBeenCalledTimes(1);

    // Make dirty again; the 20s background tick fires exactly once at 20s.
    makeDirty(harness);
    await advance(BACKGROUND_AUTO_SAVE_INTERVAL_MS - AUTO_SAVE_INTERVAL * 3 - 1);
    expect(harness.saveFile).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(harness.saveFile).toHaveBeenCalledTimes(2);
  });
});

describe("#1466 — focus round-trip preserves edits (#1445 symptom guard)", () => {
  it("keeps the edited buffer intact across blur → M-4 flush → background save → focus", async () => {
    const harness = makeHarness(makeTab({ content: "initial content", isDirty: false }), true);
    await mountHook(harness.params);

    // User edits, then the window is backgrounded mid-edit.
    // M-4: blur triggers an immediate flush (5s→20s increase).
    makeDirty(harness, "edited while focused");
    await act(async () => {
      dispatchBlur();
    });
    // M-4 immediate flush on blur.
    expect(harness.saveFile).toHaveBeenCalledTimes(1);

    // Tab is now clean. User continues editing in the background; the 20s
    // background timer then fires.
    makeDirty(harness, "edited while blurred");
    await advance(BACKGROUND_AUTO_SAVE_INTERVAL_MS);
    expect(harness.saveFile).toHaveBeenCalledTimes(2);

    await act(async () => {
      dispatchFocus();
    });
    await advance(AUTO_SAVE_INTERVAL);

    // Content is exactly the user's edit — nothing reloaded or replaced it
    // (the hook saves; it never writes back into the buffer).
    const after = harness.getTab("tab-1");
    expect(after.content).toBe("edited while blurred");
    expect(after.pendingExternalContent ?? null).toBeNull();
  });
});

describe("#1466 — activity subscription lifecycle", () => {
  it("unsubscribes from the window-activity service on unmount (no leak)", async () => {
    const windowRemove = vi.spyOn(window, "removeEventListener");
    const harness = makeHarness(makeTab(), true);
    await mountHook(harness.params);

    await act(async () => {
      root.unmount();
    });

    expect(
      windowRemove.mock.calls.filter(([type]) => String(type) === "blur").length,
    ).toBeGreaterThan(0);
    expect(
      windowRemove.mock.calls.filter(([type]) => String(type) === "focus").length,
    ).toBeGreaterThan(0);
    windowRemove.mockRestore();
  });
});
