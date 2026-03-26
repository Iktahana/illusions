"use client";

/**
 * Dockview adapter — bridges the existing useTabManager with dockview layout.
 *
 * Strategy: Keep the existing useTabManager as the source of truth for tab/file
 * state (it handles file I/O, auto-save, persistence, Electron IPC, etc.).
 * This adapter syncs useTabManager's TabState[] to dockview panels.
 *
 * Phase 1: Single group (visual replacement of TabBar with dockview tabs)
 * Phase 2: Multiple groups (split editor support)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { DockviewApi, IDockviewPanel } from "dockview-react";
import type { TabId, TabState } from "@/lib/tab-manager/tab-types";
import { isEditorTab, isTerminalTab, isDiffTab } from "@/lib/tab-manager/tab-types";
import type { UseTabManagerReturn } from "@/lib/tab-manager/types";
import type { EditorPanelParams, TerminalPanelParams, DiffPanelParams, SimplifiedGroupLayout } from "./types";
import { loadDockviewLayout } from "./use-dockview-persistence";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseDockviewAdapterOptions {
  tabManager: UseTabManagerReturn;
  /** Monotonic counter to force editor remount (e.g. after settings change) */
  editorKey: number;
}

export interface UseDockviewAdapterReturn {
  /** Call in DockviewReact onReady to register the API */
  handleDockviewReady: (event: { api: DockviewApi }) => void;
  /** The dockview API ref (null until onReady fires) */
  dockviewApi: DockviewApi | null;
  /** Split the active panel in a direction */
  splitEditor: (direction: "right" | "down") => void;
  /** Close the currently active panel's group if it has no other panels */
  closeGroup: () => void;
  /** Pop out the active panel to a new window (Electron: BrowserWindow, Web: window.open) */
  popoutPanel: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Position a newly added terminal panel in the bottom split.
 * - If another terminal already exists, move into its group ("center").
 * - Otherwise, split below an existing editor panel ("bottom").
 */
function positionTerminalPanel(
  api: DockviewApi,
  newPanel: IDockviewPanel,
  tabs: TabState[],
): void {
  // Look for an existing terminal panel to group with
  for (const panel of api.panels) {
    if (panel.id === newPanel.id) continue;
    const tab = tabs.find((t) => t.id === panel.id);
    if (tab && isTerminalTab(tab)) {
      try {
        newPanel.api.moveTo({
          group: panel.group,
          position: "center",
        });
      } catch {
        // Move failed; panel stays in default group
      }
      return;
    }
  }

  // No terminal group yet — split below the active (or first) editor panel
  const refPanel = api.activePanel ?? api.panels[0];
  if (refPanel && refPanel.id !== newPanel.id) {
    try {
      newPanel.api.moveTo({
        group: refPanel.group,
        position: "bottom",
      });
    } catch {
      // Move failed; panel stays in default group
    }
  }
}

// ---------------------------------------------------------------------------
// Layout restoration helper
// ---------------------------------------------------------------------------

/**
 * Apply a saved simplified layout to the current dockview state.
 * Matches panels to saved groups by file path and uses moveTo() to redistribute.
 */
function applySimplifiedLayout(
  api: DockviewApi,
  layout: SimplifiedGroupLayout,
  tabs: TabState[],
): void {
  // Build filePath → panelId lookup from current tabs
  const panelIdByPath = new Map<string, string>();
  for (const tab of tabs) {
    if (isEditorTab(tab) && tab.file?.path) {
      panelIdByPath.set(tab.file.path, tab.id);
    }
  }

  // Skip if only one group (default layout, nothing to do)
  if (layout.groups.length <= 1) return;

  // All panels start in the first group (default). We need to move panels
  // from groups[1..n] to new split groups.
  // Strategy: for each subsequent saved group, pick a reference panel from
  // the first group, then move the target panels to create new groups.

  for (let i = 1; i < layout.groups.length; i++) {
    const savedGroup = layout.groups[i];
    // In dockview, HORIZONTAL orientation = horizontal split bar = panels stacked top-bottom
    const direction = layout.orientation === "HORIZONTAL" ? "bottom" : "right";

    let firstPanelInGroup: IDockviewPanel | null = null;

    for (const filePath of savedGroup.tabPaths) {
      if (!filePath) continue;
      const panelId = panelIdByPath.get(filePath);
      if (!panelId) continue;
      const panel = api.getPanel(panelId);
      if (!panel) continue;

      if (!firstPanelInGroup) {
        // First panel in this group: split to create a new group
        try {
          // Find a reference panel that's still in the default group
          const refPanel = api.panels.find(
            (p) => p.id !== panelId && p.group !== panel.group,
          ) ?? api.panels[0];
          if (refPanel && refPanel.id !== panelId) {
            panel.api.moveTo({
              group: refPanel.group,
              position: direction,
            });
          }
          firstPanelInGroup = panel;
        } catch {
          // Move failed; skip this group
          break;
        }
      } else {
        // Subsequent panels: move into the same group as the first panel
        try {
          panel.api.moveTo({
            group: firstPanelInGroup.group,
            position: "center",
          });
        } catch {
          // Move failed; panel stays where it is
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useDockviewAdapter({
  tabManager,
  editorKey,
}: UseDockviewAdapterOptions): UseDockviewAdapterReturn {
  const [dockviewApi, setDockviewApi] = useState<DockviewApi | null>(null);
  const apiRef = useRef<DockviewApi | null>(null);

  // Track whether we're syncing to prevent loops
  const isSyncingRef = useRef(false);
  // Track previous tab state for diffing
  const prevTabsRef = useRef<TabState[]>([]);
  const prevActiveTabRef = useRef<TabId>("");

  // Layout restoration state
  const savedLayoutRef = useRef<SimplifiedGroupLayout | null>(null);
  const layoutAppliedRef = useRef(false);
  // Counter incremented when the async layout pre-load completes, so
  // the layout-restoration effect re-evaluates without causing the sync
  // effect to re-run (which would duplicate addPanel calls).
  const [layoutReadyTick, setLayoutReadyTick] = useState(0);

  const { tabs, activeTabId, switchTab, closeTab, newTab } = tabManager;

  // -- onReady callback -----------------------------------------------------

  const handleDockviewReady = useCallback(
    (event: { api: DockviewApi }) => {
      const api = event.api;
      apiRef.current = api;
      setDockviewApi(api);

      // Initialize dockview with current tabs, branching by tabKind
      for (const tab of tabs) {
        if (isEditorTab(tab)) {
          api.addPanel<EditorPanelParams>({
            id: tab.id,
            component: "editor",
            title: tab.file?.name ?? `新規ファイル${tab.fileType}`,
            params: {
              bufferId: tab.id,
              isPreview: tab.isPreview,
              filePath: tab.file?.path ?? "",
              fileType: tab.fileType,
              editorKey,
              activeTabId,
            },
          });
        } else if (isTerminalTab(tab)) {
          api.addPanel<TerminalPanelParams>({
            id: tab.id,
            component: "terminal",
            title: tab.label,
            params: { sessionId: tab.sessionId },
          });
        } else if (isDiffTab(tab)) {
          api.addPanel<DiffPanelParams>({
            id: tab.id,
            component: "diff",
            title: tab.sourceFileName,
            params: { sourceTabId: tab.sourceTabId },
          });
        }
      }

      // Set active panel
      const activePanel = api.getPanel(activeTabId);
      if (activePanel) {
        activePanel.api.setActive();
      }

      // Listen for dockview panel activation → update tab manager
      api.onDidActivePanelChange((e) => {
        if (isSyncingRef.current) return;
        const panelId = e?.id;
        if (panelId && panelId !== tabManager.activeTabId) {
          isSyncingRef.current = true;
          switchTab(panelId);
          isSyncingRef.current = false;
        }
      });

      // Listen for dockview panel close → close tab
      api.onDidRemovePanel((e) => {
        if (isSyncingRef.current) return;
        isSyncingRef.current = true;
        closeTab(e.id);
        isSyncingRef.current = false;
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only run once on mount
    [],
  );

  // -- Pre-load saved layout for restoration --------------------------------

  useEffect(() => {
    let cancelled = false;
    void loadDockviewLayout().then((state) => {
      if (cancelled) return;
      if (state?.simplifiedLayout) {
        savedLayoutRef.current = state.simplifiedLayout;
        setLayoutReadyTick((t) => t + 1);
      }
    });
    return () => { cancelled = true; };
  }, []);

  // -- Pending split tracking -----------------------------------------------

  const pendingSplitRef = useRef<{
    direction: "right" | "down";
    referencePanel: string;
  } | null>(null);

  // -- Sync tab state changes → dockview ------------------------------------
  // dockviewApi is included in deps so this effect re-runs when the API
  // becomes available — prevents a race where tabs are restored (from SQLite)
  // before DockviewReact fires onReady, which would leave panels un-created.

  useEffect(() => {
    const api = apiRef.current;
    if (!api || isSyncingRef.current) return;

    isSyncingRef.current = true;

    const prevTabs = prevTabsRef.current;
    const prevTabIds = new Set(prevTabs.map((t) => t.id));
    const currentTabIds = new Set(tabs.map((t) => t.id));

    // Detect newly added tabs (before updating prevTabsRef)
    const newlyAddedTabs = tabs.filter((t) => !prevTabIds.has(t.id));

    // Add new tabs, branching by tabKind
    for (const tab of tabs) {
      if (prevTabIds.has(tab.id)) continue;
      try {
        if (isEditorTab(tab)) {
          api.addPanel<EditorPanelParams>({
            id: tab.id,
            component: "editor",
            title: tab.file?.name ?? `新規ファイル${tab.fileType}`,
            params: {
              bufferId: tab.id,
              isPreview: tab.isPreview,
              filePath: tab.file?.path ?? "",
              fileType: tab.fileType,
              editorKey,
              activeTabId,
            },
          });
        } else if (isTerminalTab(tab)) {
          // Add terminal panel then move it to the bottom split (like VS Code)
          const termPanel = api.addPanel<TerminalPanelParams>({
            id: tab.id,
            component: "terminal",
            title: tab.label,
            params: { sessionId: tab.sessionId },
          });
          positionTerminalPanel(api, termPanel, tabs);
        } else if (isDiffTab(tab)) {
          api.addPanel<DiffPanelParams>({
            id: tab.id,
            component: "diff",
            title: tab.sourceFileName,
            params: { sourceTabId: tab.sourceTabId },
          });
        }
      } catch {
        // Panel may already exist (e.g. from onReady initialization)
      }
    }

    // Remove closed tabs
    for (const prevTab of prevTabs) {
      if (!currentTabIds.has(prevTab.id)) {
        const panel = api.getPanel(prevTab.id);
        if (panel) {
          try {
            api.removePanel(panel);
          } catch {
            // Panel may have been removed by dockview
          }
        }
      }
    }

    // Update titles for changed tabs, branching by tabKind
    for (const tab of tabs) {
      const panel = api.getPanel(tab.id);
      if (!panel) continue;

      if (isEditorTab(tab)) {
        const title = tab.file?.name ?? `新規ファイル${tab.fileType}`;
        if (panel.title !== title) {
          panel.api.setTitle(title);
        }
        panel.api.updateParameters({
          bufferId: tab.id,
          isPreview: tab.isPreview,
          filePath: tab.file?.path ?? "",
          fileType: tab.fileType,
          editorKey,
          activeTabId,
        });
      } else if (isTerminalTab(tab)) {
        if (panel.title !== tab.label) {
          panel.api.setTitle(tab.label);
        }
        panel.api.updateParameters({ sessionId: tab.sessionId });
      } else if (isDiffTab(tab)) {
        if (panel.title !== tab.sourceFileName) {
          panel.api.setTitle(tab.sourceFileName);
        }
      }
    }

    // Handle pending split: position the newly created tab in the split location
    const pendingSplit = pendingSplitRef.current;
    if (pendingSplit && newlyAddedTabs.length > 0) {
      const targetTab = newlyAddedTabs[newlyAddedTabs.length - 1];
      const newPanel = api.getPanel(targetTab.id);
      const refPanel = api.getPanel(pendingSplit.referencePanel);

      if (newPanel && refPanel) {
        try {
          newPanel.api.moveTo({
            group: refPanel.group,
            position: pendingSplit.direction === "right" ? "right" : "bottom",
          });
        } catch {
          // Position move failed; panel remains in default group
        }
      }
      pendingSplitRef.current = null;
    }

    // Sync active tab
    if (activeTabId !== prevActiveTabRef.current) {
      const activePanel = api.getPanel(activeTabId);
      if (activePanel && !activePanel.api.isActive) {
        activePanel.api.setActive();
      }
    }

    prevTabsRef.current = tabs;
    prevActiveTabRef.current = activeTabId;
    isSyncingRef.current = false;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- dockviewApi triggers re-sync after onReady
  }, [tabs, activeTabId, editorKey, dockviewApi]);

  // -- Restore saved layout (separate effect to avoid sync effect interference) --
  // Using a dedicated effect prevents savedLayout changes from re-triggering
  // the sync effect, which would cause duplicate addPanel calls and break rendering.

  const tabsRef = useRef<TabState[]>(tabs);
  tabsRef.current = tabs;
  const hasTabsForLayout = tabs.length > 0;

  useEffect(() => {
    if (!dockviewApi || !savedLayoutRef.current || layoutAppliedRef.current || !hasTabsForLayout) return;

    layoutAppliedRef.current = true;
    try {
      applySimplifiedLayout(dockviewApi, savedLayoutRef.current, tabsRef.current);
    } catch (err) {
      console.warn("[dockview-adapter] Failed to restore layout:", err);
    }
  }, [dockviewApi, layoutReadyTick, hasTabsForLayout]);

  // -- Split editor ---------------------------------------------------------

  const splitEditor = useCallback(
    (direction: "right" | "down") => {
      const api = apiRef.current;
      if (!api) return;

      const activePanel = api.activePanel;
      if (!activePanel) return;

      const activeTab = tabs.find((t) => t.id === activeTabId);
      if (!activeTab) return;

      // Split is only supported for editor tabs
      if (!isEditorTab(activeTab)) return;

      // Create a new empty tab with the same file type.
      // The new panel will be positioned in the split direction
      // by the sync effect above (via pendingSplitRef).
      newTab(activeTab.fileType);

      pendingSplitRef.current = {
        direction,
        referencePanel: activePanel.id,
      };
    },
    [tabs, activeTabId, newTab],
  );

  // -- Close group ----------------------------------------------------------

  const closeGroup = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    const activePanel = api.activePanel;
    if (!activePanel) return;
    const group = activePanel.group;
    if (group.panels.length <= 1) {
      // Close the panel first, then remove the empty group
      activePanel.api.close();
      if (group.panels.length === 0) {
        api.removeGroup(group);
      }
    }
  }, []);

  // -- Popout panel to new window ------------------------------------------

  const popoutPanel = useCallback(() => {
    const activeTab = tabs.find((t) => t.id === activeTabId);
    if (!activeTab || !isEditorTab(activeTab)) return;

    const electronAPI = window.electronAPI;
    const content = tabManager.content ?? "";
    const fileName = activeTab.file?.name ?? `新規ファイル${activeTab.fileType}`;
    const fileType = activeTab.fileType;

    if (electronAPI?.editor?.popoutPanel) {
      // Electron: pop out to a new BrowserWindow via IPC
      void electronAPI.editor.popoutPanel(activeTab.id, content, fileName, fileType);
    } else {
      // Web fallback: open in a new browser window
      const params = new URLSearchParams({
        "popout-buffer": activeTab.id,
        fileName,
        fileType,
      });
      window.open(`${window.location.origin}?${params.toString()}`, "_blank", "width=900,height=700");
    }
  }, [tabs, activeTabId, tabManager.content]);

  // -- Cross-window buffer sync (Electron IPC, editor tabs only) -----------

  const { content: tabContent, setContent: tabSetContent } = tabManager;

  useEffect(() => {
    const electronAPI = window.electronAPI;
    if (!electronAPI?.editor) return;

    const unsubSync = electronAPI.editor.onBufferSync((data) => {
      // Another window changed a buffer — update if it's our active editor tab
      const activeTab = tabs.find((t) => t.id === activeTabId);
      if (data.bufferId === activeTabId && activeTab && isEditorTab(activeTab)) {
        tabSetContent(data.content);
      }
    });

    const unsubClose = electronAPI.editor.onBufferClose(() => {
      // Another window closed this buffer — no action needed for now
    });

    return () => {
      if (typeof unsubSync === "function") unsubSync();
      if (typeof unsubClose === "function") unsubClose();
    };
  }, [activeTabId, tabs, tabSetContent]);

  // Broadcast content changes to other windows (editor tabs only)
  useEffect(() => {
    const electronAPI = window.electronAPI;
    if (!electronAPI?.editor?.sendBufferSync) return;
    if (!activeTabId) return;

    // Only broadcast for editor tabs
    const activeTab = tabs.find((t) => t.id === activeTabId);
    if (!activeTab || !isEditorTab(activeTab)) return;

    const content = tabContent ?? "";

    // Debounce to avoid flooding IPC on every keystroke
    const timer = setTimeout(() => {
      electronAPI.editor!.sendBufferSync(activeTabId, content);
    }, 300);

    return () => clearTimeout(timer);
  }, [activeTabId, tabs, tabContent]);

  return {
    handleDockviewReady,
    dockviewApi,
    splitEditor,
    closeGroup,
    popoutPanel,
  };
}
