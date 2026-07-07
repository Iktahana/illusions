/**
 * Regression tests for #1567 (S3) — useDockviewAdapter React lifecycle fixes.
 *
 * Findings covered:
 *   1. handleDockviewReady was a useCallback([]) that captured the FIRST
 *      render's tabs/activeTabId. If tabs were restored (async, from storage)
 *      before DockviewReact fired onReady, the stale closure initialized
 *      dockview from the outdated tab list, and the sync effect then re-added
 *      every panel — duplicate addPanel errors silently swallowed by an empty
 *      catch. Fixed with latest-state refs + recording prevTabsRef in onReady.
 *   2. onDidActivePanelChange compared the incoming panel id against the stale
 *      first-render activeTabId forever, causing spurious switchTab calls.
 *   3. setActive() was called without an isActive guard. dockview setActive()
 *      is NOT idempotent — it detaches/reattaches the panel DOM and resets
 *      scroll (#1457) — so redundant calls must be skipped.
 *
 * Tests drive the REAL hook via createRoot + act (repo pattern, no
 * @testing-library/react) with a minimal fake DockviewApi.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { createNewTab } from "@/lib/tab-manager/types";
import { useDockviewAdapter } from "../use-dockview-adapter";
import type { DockviewApi } from "dockview-react";
import type { UseTabManagerReturn } from "@/lib/tab-manager/types";
import type { TabState } from "@/lib/tab-manager/tab-types";
import type { UseDockviewAdapterReturn } from "../use-dockview-adapter";

// Layout pre-load hits storage — stub it out.
vi.mock("../use-dockview-persistence", () => ({
  loadDockviewLayout: vi.fn().mockResolvedValue(null),
}));

// ---------------------------------------------------------------------------
// Fake DockviewApi
// ---------------------------------------------------------------------------

interface FakePanel {
  id: string;
  title: string;
  group: { panels: FakePanel[] };
  api: {
    isActive: boolean;
    setActive: ReturnType<typeof vi.fn>;
    setTitle: ReturnType<typeof vi.fn>;
    updateParameters: ReturnType<typeof vi.fn>;
    moveTo: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  };
}

interface FakeApiBundle {
  api: DockviewApi;
  panels: Map<string, FakePanel>;
  addPanel: ReturnType<typeof vi.fn>;
  fireActivePanelChange: (e: { panel: { id: string } | undefined } | undefined) => void;
  /** Panel ids that should report isActive=true immediately after addPanel. */
  markActiveOnAdd: Set<string>;
}

function createFakeApi(): FakeApiBundle {
  const panels = new Map<string, FakePanel>();
  const activeChangeHandlers: Array<
    (e: { panel: { id: string } | undefined } | undefined) => void
  > = [];
  const markActiveOnAdd = new Set<string>();

  const addPanel = vi.fn((opts: { id: string; title?: string }) => {
    if (panels.has(opts.id)) {
      throw new Error(`duplicate addPanel: ${opts.id}`);
    }
    const panel: FakePanel = {
      id: opts.id,
      title: opts.title ?? "",
      group: { panels: [] },
      api: {
        isActive: markActiveOnAdd.has(opts.id),
        setActive: vi.fn(),
        setTitle: vi.fn(),
        updateParameters: vi.fn(),
        moveTo: vi.fn(),
        close: vi.fn(),
      },
    };
    panels.set(opts.id, panel);
    return panel;
  });

  const fake = {
    addPanel,
    getPanel: (id: string) => panels.get(id),
    removePanel: vi.fn((p: FakePanel) => panels.delete(p.id)),
    get panels() {
      return [...panels.values()];
    },
    get groups() {
      return [];
    },
    get activePanel() {
      return undefined;
    },
    width: 800,
    height: 600,
    onDidActivePanelChange: (h: (e: { panel: { id: string } | undefined } | undefined) => void) => {
      activeChangeHandlers.push(h);
      return { dispose: () => undefined };
    },
    onDidRemovePanel: () => ({ dispose: () => undefined }),
  };

  return {
    api: fake as unknown as DockviewApi,
    panels,
    addPanel,
    fireActivePanelChange: (e) => {
      for (const h of activeChangeHandlers) h(e);
    },
    markActiveOnAdd,
  };
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

function makeTabManager(
  tabs: TabState[],
  activeTabId: string,
  shared: { switchTab: ReturnType<typeof vi.fn>; closeTab: ReturnType<typeof vi.fn> },
): UseTabManagerReturn {
  return {
    tabs,
    activeTabId,
    switchTab: shared.switchTab,
    closeTab: shared.closeTab,
    cloneTab: vi.fn(),
    updateTab: vi.fn(),
    content: "",
    setContent: vi.fn(),
  } as unknown as UseTabManagerReturn;
}

const resultRef: { current: UseDockviewAdapterReturn | null } = { current: null };

function Harness({ tabManager }: { tabManager: UseTabManagerReturn }): null {
  const result = useDockviewAdapter({
    tabManager,
    editorKey: 0,
    searchOpenTrigger: 0,
    windowKey: null,
    projectLayout: null,
  });
  // Publish the hook result after render (render-phase external writes are
  // rejected by the react-compiler lint rule).
  useEffect(() => {
    resultRef.current = result;
  });
  return null;
}

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  resultRef.current = null;
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

describe("#1567 — useDockviewAdapter stale-state fixes", () => {
  it("onReady initializes from the LATEST tabs, not the first-render snapshot", async () => {
    const tabA = createNewTab("a");
    const tabB = createNewTab("b");
    const shared = { switchTab: vi.fn(), closeTab: vi.fn() };
    const fake = createFakeApi();

    // First render: only tabA exists.
    await act(async () => {
      root.render(<Harness tabManager={makeTabManager([tabA], tabA.id, shared)} />);
    });
    // Tabs restored asynchronously BEFORE dockview fires onReady.
    await act(async () => {
      root.render(<Harness tabManager={makeTabManager([tabA, tabB], tabB.id, shared)} />);
    });

    await act(async () => {
      resultRef.current!.handleDockviewReady({ api: fake.api });
    });

    // Both tabs must become panels (stale closure created only tabA's panel).
    expect(fake.panels.has(tabA.id)).toBe(true);
    expect(fake.panels.has(tabB.id)).toBe(true);
    // The LATEST active tab (tabB) is activated, not the stale tabA.
    expect(fake.panels.get(tabB.id)!.api.setActive).toHaveBeenCalledTimes(1);
    expect(fake.panels.get(tabA.id)!.api.setActive).not.toHaveBeenCalled();
  });

  it("sync effect does NOT re-add panels already created by onReady (no swallowed duplicate addPanel)", async () => {
    const tabA = createNewTab("a");
    const tabB = createNewTab("b");
    const shared = { switchTab: vi.fn(), closeTab: vi.fn() };
    const fake = createFakeApi();

    await act(async () => {
      root.render(<Harness tabManager={makeTabManager([tabA, tabB], tabA.id, shared)} />);
    });
    await act(async () => {
      resultRef.current!.handleDockviewReady({ api: fake.api });
    });
    // Force another render with the same tabs — sync effect re-runs.
    await act(async () => {
      root.render(<Harness tabManager={makeTabManager([tabA, tabB], tabA.id, shared)} />);
    });

    // Exactly one addPanel per tab; the old code attempted 2 more (duplicates)
    // and hid the errors in an empty catch.
    expect(fake.addPanel).toHaveBeenCalledTimes(2);
  });

  it("onDidActivePanelChange compares against the LIVE activeTabId (no stale switchTab)", async () => {
    const tabA = createNewTab("a");
    const tabB = createNewTab("b");
    const shared = { switchTab: vi.fn(), closeTab: vi.fn() };
    const fake = createFakeApi();

    await act(async () => {
      root.render(<Harness tabManager={makeTabManager([tabA, tabB], tabA.id, shared)} />);
    });
    await act(async () => {
      resultRef.current!.handleDockviewReady({ api: fake.api });
    });
    // Active tab changes to tabB through the tab manager (new render).
    await act(async () => {
      root.render(<Harness tabManager={makeTabManager([tabA, tabB], tabB.id, shared)} />);
    });

    // dockview reports tabB active — already the live activeTabId → no switch.
    fake.fireActivePanelChange({ panel: { id: tabB.id } });
    expect(shared.switchTab).not.toHaveBeenCalled();

    // dockview reports tabA active — differs from live activeTabId → switch.
    fake.fireActivePanelChange({ panel: { id: tabA.id } });
    expect(shared.switchTab).toHaveBeenCalledTimes(1);
    expect(shared.switchTab).toHaveBeenCalledWith(tabA.id);
  });

  it("onReady skips setActive() when the panel is already active (#1457 non-idempotent pitfall)", async () => {
    const tabA = createNewTab("a");
    const shared = { switchTab: vi.fn(), closeTab: vi.fn() };
    const fake = createFakeApi();
    fake.markActiveOnAdd.add(tabA.id);

    await act(async () => {
      root.render(<Harness tabManager={makeTabManager([tabA], tabA.id, shared)} />);
    });
    await act(async () => {
      resultRef.current!.handleDockviewReady({ api: fake.api });
    });

    expect(fake.panels.get(tabA.id)!.api.setActive).not.toHaveBeenCalled();
  });
});
