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
import type { DockviewApi } from "dockview-react";
import type { TabId, TabState } from "@/lib/tab-manager/tab-types";
import { isEditorTab, isTerminalTab, isDiffTab } from "@/lib/tab-manager/tab-types";
import type { UseTabManagerReturn } from "@/lib/tab-manager/types";
import type { EditorPanelParams, TerminalPanelParams, DiffPanelParams } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseDockviewAdapterOptions {
  tabManager: UseTabManagerReturn;
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
// Hook
// ---------------------------------------------------------------------------

export function useDockviewAdapter({
  tabManager,
}: UseDockviewAdapterOptions): UseDockviewAdapterReturn {
  const [dockviewApi, setDockviewApi] = useState<DockviewApi | null>(null);
  const apiRef = useRef<DockviewApi | null>(null);

  // Track whether we're syncing to prevent loops
  const isSyncingRef = useRef(false);
  // Track previous tab state for diffing
  const prevTabsRef = useRef<TabState[]>([]);
  const prevActiveTabRef = useRef<TabId>("");

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

  // -- Pending split tracking -----------------------------------------------

  const pendingSplitRef = useRef<{
    direction: "right" | "down";
    referencePanel: string;
  } | null>(null);

  // -- Sync tab state changes → dockview ------------------------------------

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
            params: { bufferId: tab.id, isPreview: tab.isPreview },
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
        });
      } else if (isTerminalTab(tab)) {
        if (panel.title !== tab.label) {
          panel.api.setTitle(tab.label);
        }
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
  }, [tabs, activeTabId]);

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
