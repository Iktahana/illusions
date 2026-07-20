/**
 * Regression test for #1567 (S3) — Electron persistence gate in useTabPersistence.
 *
 * The Electron mount-time restore effect became dead code behind an
 * unconditional early return (Phase 4-5 removed electronAPI.vfs), which meant
 * the old `finally { storageInitializedRef.current = true }` never ran. With
 * the gate permanently closed, empty tab states (e.g. user closed all tabs)
 * were never persisted in Electron standalone mode, so stale tabs reappeared
 * on next launch.
 *
 * Fix: the cleaned-up effect opens the persistence gate at the same timing as
 * the old implementation (after the VFS-ready race), without restoring tabs.
 *
 * Tests drive the REAL hook via createRoot + act (repo pattern, no
 * @testing-library/react).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { useTabPersistence } from "../use-tab-persistence";
import { createNewTab } from "../types";
import type { TabState, TabId } from "../tab-types";

const { persistAppStateMock, persistWindowStateMock, fetchWindowStateMock } = vi.hoisted(() => ({
  persistAppStateMock: vi.fn(async () => undefined),
  persistWindowStateMock: vi.fn(async () => undefined),
  fetchWindowStateMock: vi.fn(async () => null),
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
  fetchWindowState: fetchWindowStateMock,
  persistWindowState: persistWindowStateMock,
  persistAppState: persistAppStateMock,
}));

vi.mock("@/lib/project/workspace-persistence", () => ({
  persistWorkspaceJson: vi.fn(async () => undefined),
  toRelativePath: (p: string) => p,
  toAbsolutePath: (p: string) => p,
}));

vi.mock("@/lib/services/project-file-service", () => ({
  getProjectFileService: () => ({ readFile: vi.fn(async () => "") }),
}));

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

interface HarnessProps {
  tabs: TabState[];
  activeTabId: TabId;
  vfsReadyPromise?: Promise<void>;
}

function Harness({ tabs, activeTabId, vfsReadyPromise }: HarnessProps): null {
  const tabsRef = useRef<TabState[]>(tabs);
  tabsRef.current = tabs;
  const activeTabIdRef = useRef<TabId>(activeTabId);
  activeTabIdRef.current = activeTabId;
  const isProjectRef = useRef(false);

  useTabPersistence({
    tabs,
    setTabs: vi.fn(),
    activeTabId,
    setActiveTabId: vi.fn(),
    tabsRef,
    activeTabIdRef,
    isProjectRef,
    isElectron: true,
    skipAutoRestore: false,
    vfsReadyPromise,
    windowKey: null,
  });
  return null;
}

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.useFakeTimers();
  persistAppStateMock.mockClear();
  persistWindowStateMock.mockClear();
  fetchWindowStateMock.mockClear();
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
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("#1567 — Electron standalone persistence gate (storageInitializedRef)", () => {
  it("opens the gate after VFS is ready so an empty tab state CAN be persisted", async () => {
    const tabA = createNewTab("hello");

    // Mount with one tab; VFS becomes ready immediately.
    await act(async () => {
      root.render(
        <Harness tabs={[tabA]} activeTabId={tabA.id} vfsReadyPromise={Promise.resolve()} />,
      );
    });

    // Flush the initial (non-empty) debounced persist.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    persistAppStateMock.mockClear();

    // User closes all tabs → empty state must be persisted now that the gate
    // is open. (Before the fix the gate never opened in Electron standalone
    // mode and the empty state was silently dropped.)
    await act(async () => {
      root.render(<Harness tabs={[]} activeTabId="" vfsReadyPromise={Promise.resolve()} />);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(persistAppStateMock).toHaveBeenCalledWith({
      openTabs: { tabs: [], activeIndex: 0 },
    });
  });

  it("keeps the gate CLOSED while VFS is not ready (mount-time empty state is not persisted)", async () => {
    // Never-resolving VFS promise → gate stays closed until the 5 s timeout.
    const neverReady = new Promise<void>(() => undefined);

    await act(async () => {
      root.render(<Harness tabs={[]} activeTabId="" vfsReadyPromise={neverReady} />);
    });

    // Within the debounce window (and before the 5 s VFS timeout) the empty
    // initial state must NOT overwrite saved tab data.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(persistAppStateMock).not.toHaveBeenCalled();
    expect(persistWindowStateMock).not.toHaveBeenCalled();
  });
});
