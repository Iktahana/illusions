/**
 * Regression tests for #1875 — dirty-tab close-cancel must not lose the editor panel.
 *
 * Root cause: dockview has no panel close-veto. The tab close button calls
 * panel.api.close() → dockview removes the panel → onDidRemovePanel fires →
 * closeTab(id). For a DIRTY editor tab, closeTab keeps the tab (it only opens
 * the unsaved dialog), so the tab survives but its panel is already gone.
 * Cancelling the dialog never recreated the panel → invisible orphaned tab.
 *
 * Fix: record each panel's placement before removal and run a heal pass
 * (driven by a healTick bumped in onDidRemovePanel) that recreates a panel for
 * any editor tab still present in the tab list but missing its panel.
 *
 * Tests drive the REAL hook via createRoot + act (repo pattern) with a fake
 * DockviewApi that models groups, panel placement and onDidRemovePanel.
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

vi.mock("../use-dockview-persistence", () => ({
  loadDockviewLayout: vi.fn().mockResolvedValue(null),
}));

// ---------------------------------------------------------------------------
// Fake DockviewApi with group + placement modelling
// ---------------------------------------------------------------------------

interface FakeGroup {
  id: string;
  panels: FakePanel[];
}

interface FakePanel {
  id: string;
  title: string;
  group: FakeGroup;
  api: {
    isActive: boolean;
    setActive: ReturnType<typeof vi.fn>;
    setTitle: ReturnType<typeof vi.fn>;
    updateParameters: ReturnType<typeof vi.fn>;
    moveTo: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  };
}

interface AddPanelOpts {
  id: string;
  title?: string;
  position?: { referenceGroup?: string; index?: number; direction?: string };
}

interface FakeApiBundle {
  api: DockviewApi;
  panels: Map<string, FakePanel>;
  groups: FakeGroup[];
  addPanel: ReturnType<typeof vi.fn>;
  fireRemovePanel: (id: string) => void;
  setActivePanelId: (id: string | undefined) => void;
  lastAddOptions: AddPanelOpts[];
}

function createFakeApi(): FakeApiBundle {
  const panels = new Map<string, FakePanel>();
  const removeHandlers: Array<(e: { id: string }) => void> = [];
  const defaultGroup: FakeGroup = { id: "group-0", panels: [] };
  const groups: FakeGroup[] = [defaultGroup];
  let activePanelId: string | undefined;
  const lastAddOptions: AddPanelOpts[] = [];

  const addPanel = vi.fn((opts: AddPanelOpts) => {
    if (panels.has(opts.id)) {
      throw new Error(`duplicate addPanel: ${opts.id}`);
    }
    lastAddOptions.push(opts);
    // Resolve target group from position.referenceGroup, else default.
    let group = defaultGroup;
    if (opts.position?.referenceGroup) {
      const found = groups.find((g) => g.id === opts.position!.referenceGroup);
      if (found) group = found;
    }
    const panel: FakePanel = {
      id: opts.id,
      title: opts.title ?? "",
      group,
      api: {
        isActive: false,
        setActive: vi.fn(() => {
          activePanelId = opts.id;
        }),
        setTitle: vi.fn(),
        updateParameters: vi.fn(),
        moveTo: vi.fn(),
        close: vi.fn(),
      },
    };
    const idx = opts.position?.index;
    if (typeof idx === "number" && idx >= 0 && idx <= group.panels.length) {
      group.panels.splice(idx, 0, panel);
    } else {
      group.panels.push(panel);
    }
    panels.set(opts.id, panel);
    return panel;
  });

  const removePanel = vi.fn((p: FakePanel) => {
    panels.delete(p.id);
    p.group.panels = p.group.panels.filter((x) => x.id !== p.id);
  });

  const fake = {
    addPanel,
    getPanel: (id: string) => panels.get(id),
    removePanel,
    get panels() {
      return [...panels.values()];
    },
    get groups() {
      return groups;
    },
    get activePanel() {
      return activePanelId ? panels.get(activePanelId) : undefined;
    },
    width: 800,
    height: 600,
    onDidActivePanelChange: () => ({ dispose: () => undefined }),
    onDidRemovePanel: (h: (e: { id: string }) => void) => {
      removeHandlers.push(h);
      return { dispose: () => undefined };
    },
  };

  return {
    api: fake as unknown as DockviewApi,
    panels,
    groups,
    addPanel,
    lastAddOptions,
    setActivePanelId: (id) => {
      activePanelId = id;
      for (const p of panels.values()) p.api.isActive = p.id === id;
    },
    fireRemovePanel: (id: string) => {
      const panel = panels.get(id);
      if (panel) removePanel(panel);
      for (const h of removeHandlers) h({ id });
    },
  };
}

// ---------------------------------------------------------------------------
// Stateful tab-manager mock that mimics dirty/clean closeTab semantics
// ---------------------------------------------------------------------------

interface MutableTabModel {
  tabs: TabState[];
  activeTabId: string;
  /** Mirrors useTabState.closeTab: dirty editor tab is kept (pending dialog). */
  closeTab: (id: string) => void;
  /** Mirrors forceCloseTab/discard: removes the tab. */
  forceCloseTab: (id: string) => void;
}

function makeTabManager(model: MutableTabModel): UseTabManagerReturn {
  return {
    tabs: model.tabs,
    activeTabId: model.activeTabId,
    switchTab: vi.fn(),
    closeTab: model.closeTab,
    cloneTab: vi.fn(),
    updateTab: vi.fn(),
    setTabContent: vi.fn(),
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

describe("#1875 — dirty-tab close-cancel keeps the editor panel", () => {
  it("recreates the panel for a dirty editor tab that survives closeTab (cancel flow)", async () => {
    const tabA = { ...createNewTab("a"), isDirty: true };
    const fake = createFakeApi();

    // dirty closeTab keeps the tab — exactly like useTabState.closeTab.
    const model: MutableTabModel = {
      tabs: [tabA],
      activeTabId: tabA.id,
      closeTab: vi.fn(), // dirty → no-op on the tab list (dialog opens)
      forceCloseTab: vi.fn(),
    };

    await act(async () => {
      root.render(<Harness tabManager={makeTabManager(model)} />);
    });
    await act(async () => {
      resultRef.current!.handleDockviewReady({ api: fake.api });
    });

    expect(fake.panels.has(tabA.id)).toBe(true);
    fake.setActivePanelId(tabA.id);

    // User clicks close on the dirty tab → dockview removes the panel and fires
    // onDidRemovePanel. closeTab keeps the tab (dialog). The heal effect must
    // recreate the panel.
    await act(async () => {
      fake.fireRemovePanel(tabA.id);
    });

    expect(fake.panels.has(tabA.id)).toBe(true);
  });

  it("does NOT recreate a panel when the tab was genuinely removed (discard / clean close)", async () => {
    const tabA = { ...createNewTab("a"), isDirty: true };
    const tabB = createNewTab("b");
    const fake = createFakeApi();

    const model: MutableTabModel = {
      tabs: [tabA, tabB],
      activeTabId: tabA.id,
      closeTab: vi.fn(),
      forceCloseTab: vi.fn(),
    };

    await act(async () => {
      root.render(<Harness tabManager={makeTabManager(model)} />);
    });
    await act(async () => {
      resultRef.current!.handleDockviewReady({ api: fake.api });
    });

    // Simulate discard: the tab is removed from the list, THEN the panel is
    // removed. After removal the heal pass sees the tab is gone → no re-add.
    model.tabs = [tabB];
    await act(async () => {
      root.render(<Harness tabManager={makeTabManager(model)} />);
    });
    await act(async () => {
      fake.fireRemovePanel(tabA.id);
    });

    expect(fake.panels.has(tabA.id)).toBe(false);
    expect(fake.panels.has(tabB.id)).toBe(true);
  });

  it("restores the recreated panel into its original group and tab index", async () => {
    const tabA = createNewTab("a");
    const tabB = { ...createNewTab("b"), isDirty: true };
    const fake = createFakeApi();

    const model: MutableTabModel = {
      tabs: [tabA, tabB],
      activeTabId: tabB.id,
      closeTab: vi.fn(),
      forceCloseTab: vi.fn(),
    };

    await act(async () => {
      root.render(<Harness tabManager={makeTabManager(model)} />);
    });
    await act(async () => {
      resultRef.current!.handleDockviewReady({ api: fake.api });
    });

    // Both panels live in group-0; tabB at index 1.
    const group0 = fake.groups[0];
    expect(group0.panels.map((p) => p.id)).toEqual([tabA.id, tabB.id]);
    fake.setActivePanelId(tabB.id);

    fake.lastAddOptions.length = 0;
    await act(async () => {
      fake.fireRemovePanel(tabB.id);
    });

    // Heal re-added tabB into the same group at the same index, and re-activated
    // it (it was the active panel on removal).
    const healAdd = fake.lastAddOptions.find((o) => o.id === tabB.id);
    expect(healAdd?.position?.referenceGroup).toBe("group-0");
    expect(healAdd?.position?.index).toBe(1);
    expect(group0.panels.map((p) => p.id)).toEqual([tabA.id, tabB.id]);
    expect(fake.panels.get(tabB.id)!.api.setActive).toHaveBeenCalled();
  });
});
