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
import type { UseTabManagerReturn } from "@/lib/tab-manager/types";
import type { EditorPanelParams } from "./types";

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

      // Initialize dockview with current tabs
      for (const tab of tabs) {
        api.addPanel<EditorPanelParams>({
          id: tab.id,
          component: "editor",
          title: tab.file?.name ?? `新規ファイル${tab.fileType}`,
          params: {
            bufferId: tab.id,
            isPreview: tab.isPreview,
          },
        });
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

  // -- Sync tab state changes → dockview ------------------------------------

  useEffect(() => {
    const api = apiRef.current;
    if (!api || isSyncingRef.current) return;

    isSyncingRef.current = true;

    const prevTabs = prevTabsRef.current;
    const prevTabIds = new Set(prevTabs.map((t) => t.id));
    const currentTabIds = new Set(tabs.map((t) => t.id));

    // Add new tabs
    for (const tab of tabs) {
      if (!prevTabIds.has(tab.id)) {
        try {
          api.addPanel<EditorPanelParams>({
            id: tab.id,
            component: "editor",
            title: tab.file?.name ?? `新規ファイル${tab.fileType}`,
            params: {
              bufferId: tab.id,
              isPreview: tab.isPreview,
            },
          });
        } catch {
          // Panel may already exist (e.g. from onReady initialization)
        }
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

    // Update titles for changed tabs
    for (const tab of tabs) {
      const panel = api.getPanel(tab.id);
      if (panel) {
        const title = tab.file?.name ?? `新規ファイル${tab.fileType}`;
        if (panel.title !== title) {
          panel.api.setTitle(title);
        }
        // Update params if needed
        panel.api.updateParameters({
          bufferId: tab.id,
          isPreview: tab.isPreview,
        });
      }
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

      // Create a new tab with the same content as the active tab
      const activeTab = tabs.find((t) => t.id === activeTabId);
      if (!activeTab) return;

      // Create a new tab in the tab manager
      newTab(activeTab.fileType);

      // The new tab will be synced to dockview in the next effect,
      // but we need to position it. We'll handle this in the sync effect
      // by tracking a pending split direction.
      // For now, store the pending split info.
      pendingSplitRef.current = {
        direction,
        referencePanel: activePanel.id,
      };
    },
    [tabs, activeTabId, newTab],
  );

  const pendingSplitRef = useRef<{
    direction: "right" | "down";
    referencePanel: string;
  } | null>(null);

  // Handle pending splits: when a new tab is added and there's a pending split,
  // move the new panel to the split position
  useEffect(() => {
    const api = apiRef.current;
    const pendingSplit = pendingSplitRef.current;
    if (!api || !pendingSplit) return;

    const prevTabIds = new Set(prevTabsRef.current.map((t) => t.id));
    const newTabs = tabs.filter((t) => !prevTabIds.has(t.id));
    if (newTabs.length === 0) return;

    const newTab = newTabs[newTabs.length - 1];
    const newPanel = api.getPanel(newTab.id);
    const refPanel = api.getPanel(pendingSplit.referencePanel);

    if (newPanel && refPanel) {
      // Move the new panel to create a split
      newPanel.api.moveTo({
        group: refPanel.group,
        position:
          pendingSplit.direction === "right" ? "right" : "bottom",
      });
    }

    pendingSplitRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs]);

  // -- Close group ----------------------------------------------------------

  const closeGroup = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    const activePanel = api.activePanel;
    if (!activePanel) return;
    const group = activePanel.group;
    if (group.panels.length === 0) {
      api.removeGroup(group);
    }
  }, []);

  // -- Popout panel to new window ------------------------------------------

  const popoutPanel = useCallback(() => {
    const activeTab = tabs.find((t) => t.id === activeTabId);
    if (!activeTab) return;

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

  // -- Cross-window buffer sync (Electron IPC) -----------------------------

  useEffect(() => {
    const electronAPI = window.electronAPI;
    if (!electronAPI?.editor) return;

    const unsubSync = electronAPI.editor.onBufferSync((data) => {
      // Another window changed a buffer — if we have a tab with this ID, update content
      const matchingTab = tabs.find((t) => t.id === data.bufferId);
      if (matchingTab && data.content !== tabManager.content) {
        // Update via tab manager's setContent (this will trigger re-render)
        if (data.bufferId === activeTabId) {
          tabManager.setContent(data.content);
        }
      }
    });

    const unsubClose = electronAPI.editor.onBufferClose((_bufferId) => {
      // Another window closed this buffer — no action needed for now,
      // the buffer still exists in this window's tab manager
    });

    return () => {
      if (typeof unsubSync === "function") unsubSync();
      if (typeof unsubClose === "function") unsubClose();
    };
  }, [tabs, activeTabId, tabManager]);

  // Broadcast content changes to other windows
  useEffect(() => {
    const electronAPI = window.electronAPI;
    if (!electronAPI?.editor?.sendBufferSync) return;
    if (!activeTabId || !tabManager.content) return;

    // Debounce to avoid flooding IPC on every keystroke
    const timer = setTimeout(() => {
      electronAPI.editor!.sendBufferSync(activeTabId, tabManager.content);
    }, 300);

    return () => clearTimeout(timer);
  }, [activeTabId, tabManager.content]);

  return {
    handleDockviewReady,
    dockviewApi,
    splitEditor,
    closeGroup,
    popoutPanel,
  };
}
