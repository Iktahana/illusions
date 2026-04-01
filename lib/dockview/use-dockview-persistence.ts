"use client";

/**
 * Dockview layout persistence — saves/restores the split-pane layout.
 *
 * Uses the existing StorageService AppState for persistence.
 * Layout is serialized via dockview's toJSON() and stored alongside
 * a simplified layout descriptor for ID-independent restoration.
 */

import { useCallback, useEffect, useRef } from "react";
import type { DockviewApi } from "dockview-react";
import type { DockviewLayoutState, SimplifiedGroupLayout } from "./types";
import type { TabState } from "@/lib/tab-manager/tab-types";
import { isEditorTab, isTerminalTab, isDiffTab } from "@/lib/tab-manager/tab-types";
import { persistAppState } from "@/lib/storage/app-state-manager";
import { getStorageService } from "@/lib/storage/storage-service";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LAYOUT_PERSIST_DEBOUNCE = 2000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a stable, ID-independent key for a tab that survives session restarts.
 *
 * - Editor tab with saved file: the file path (e.g. "/home/user/novel.mdi")
 * - Editor tab without file (unsaved): "unsaved:<tabId>"
 * - Terminal tab: "terminal:<sessionId>"
 * - Diff tab: "diff:<sourceTabId>"
 */
function stableKeyForTab(tab: TabState): string | null {
  if (isEditorTab(tab)) {
    return tab.file?.path ?? `unsaved:${tab.id}`;
  }
  if (isTerminalTab(tab)) {
    return `terminal:${tab.sessionId}`;
  }
  if (isDiffTab(tab)) {
    return `diff:${tab.sourceTabId}`;
  }
  return null;
}

/**
 * Extract a simplified, ID-independent layout from the current dockview state.
 * Uses stable keys so the layout survives tab ID regeneration.
 *
 * Stable key formats:
 *   - Saved editor tab: file path
 *   - Unsaved editor tab: "unsaved:<tabId>"
 *   - Terminal tab: "terminal:<sessionId>"
 *   - Diff tab: "diff:<sourceTabId>"
 */
function extractSimplifiedLayout(
  api: DockviewApi,
  tabs: TabState[],
): SimplifiedGroupLayout | undefined {
  const groups = api.groups;
  if (groups.length <= 1) return undefined; // Single group = default layout, no need to save

  // Build panelId → stable key lookup (covers all tab kinds)
  const pathByPanelId = new Map<string, string | null>();
  for (const tab of tabs) {
    pathByPanelId.set(tab.id, stableKeyForTab(tab));
  }

  // Extract orientation from serialized JSON (the API doesn't expose it directly)
  let orientation: "HORIZONTAL" | "VERTICAL" = "HORIZONTAL";
  try {
    const json = api.toJSON();
    const rawOrientation = String(json.grid.orientation);
    orientation = rawOrientation === "VERTICAL" ? "VERTICAL" : "HORIZONTAL";
  } catch {
    // Fall back to default
  }

  const simplifiedGroups: SimplifiedGroupLayout["groups"] = [];
  const sizes: number[] = [];

  for (const group of groups) {
    const tabPaths = group.panels.map((p) => pathByPanelId.get(p.id) ?? null);
    const activePanel = group.activePanel;
    const activeTabPath = activePanel ? (pathByPanelId.get(activePanel.id) ?? null) : null;
    simplifiedGroups.push({ tabPaths, activeTabPath });
    sizes.push(orientation === "HORIZONTAL" ? group.api.width : group.api.height);
  }

  // Normalize sizes to proportional values
  const totalSize = sizes.reduce((sum, s) => sum + s, 0);
  const normalizedSizes = totalSize > 0 ? sizes.map((s) => s / totalSize) : sizes;

  return {
    groups: simplifiedGroups,
    orientation,
    sizes: normalizedSizes,
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseDockviewPersistenceOptions {
  dockviewApi: DockviewApi | null;
  /** Current tab state for extracting file paths */
  tabs?: TabState[];
  enabled?: boolean;
}

export interface UseDockviewPersistenceReturn {
  /** Immediately flush pending layout state to storage (cancels debounce). */
  flushLayoutState: () => Promise<void>;
}

export function useDockviewPersistence({
  dockviewApi,
  tabs = [],
  enabled = true,
}: UseDockviewPersistenceOptions): UseDockviewPersistenceReturn {
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const apiRef = useRef<DockviewApi | null>(null);
  apiRef.current = dockviewApi;
  const tabsRef = useRef<TabState[]>(tabs);
  tabsRef.current = tabs;

  /** Serialize and persist the current layout immediately. */
  const persistLayoutNow = useCallback(async () => {
    const api = apiRef.current;
    if (!api) return;
    try {
      const layoutJson = api.toJSON();
      const simplified = extractSimplifiedLayout(api, tabsRef.current);
      const layoutState: DockviewLayoutState = {
        dockviewJson: layoutJson,
        buffers: [],
        simplifiedLayout: simplified,
      };
      await persistAppState({ dockviewLayout: layoutState });
    } catch (err) {
      console.warn("[dockview-persistence] Failed to serialize layout:", err);
    }
  }, []);

  /** Flush pending layout state: cancel debounce and persist immediately. */
  const flushLayoutState = useCallback(async () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    await persistLayoutNow();
  }, [persistLayoutNow]);

  // Save layout on changes (debounced)
  useEffect(() => {
    if (!dockviewApi || !enabled) return;

    const disposable = dockviewApi.onDidLayoutChange(() => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        void persistLayoutNow().catch((err) => {
          console.warn("[dockview-persistence] Failed to save layout:", err);
        });
      }, LAYOUT_PERSIST_DEBOUNCE);
    });

    return () => {
      disposable.dispose();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
        // Flush pending layout state immediately on cleanup
        void persistLayoutNow().catch(() => {});
      }
    };
  }, [dockviewApi, enabled, persistLayoutNow]);

  return { flushLayoutState };
}

// ---------------------------------------------------------------------------
// Utility: load saved layout
// ---------------------------------------------------------------------------

/**
 * Load saved dockview layout from AppState.
 * Returns null if no saved layout exists.
 */
export async function loadDockviewLayout(): Promise<DockviewLayoutState | null> {
  try {
    const appState = await getStorageService().loadAppState();
    return appState?.dockviewLayout ?? null;
  } catch {
    return null;
  }
}
