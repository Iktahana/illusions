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
import { stableKeyForTab } from "./stable-key";
import {
  persistAppState,
  persistWindowState,
  fetchWindowState,
} from "@/lib/storage/app-state-manager";
import { getStorageService } from "@/lib/storage/storage-service";
import { persistWorkspaceJson, toRelativePath } from "@/lib/project/workspace-persistence";
import type { WorkspaceDockviewLayout } from "@/lib/project/project-types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LAYOUT_PERSIST_DEBOUNCE = 2000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract a simplified, ID-independent layout from the current dockview state.
 * Uses stable keys so the layout survives tab ID regeneration.
 * Same-file clones are disambiguated with `#N` suffix.
 */
function extractSimplifiedLayout(
  api: DockviewApi,
  tabs: TabState[],
): SimplifiedGroupLayout | undefined {
  const groups = api.groups;
  if (groups.length <= 1) return undefined; // Single group = default layout, no need to save

  // Build panelId → stable key lookup (covers all tab kinds)
  // Use occurrence tracking for same-file clone disambiguation
  const occurrences = new Map<string, number>();
  const pathByPanelId = new Map<string, string | null>();
  for (const tab of tabs) {
    pathByPanelId.set(tab.id, stableKeyForTab(tab, occurrences));
  }

  // Determine orientation from ACTUAL group geometry rather than the private
  // toJSON().grid.orientation field, whose value proved ambiguous across
  // dockview versions (#1527). For a side-by-side (left-right) split each group
  // is narrower than the container but full-height; for a stacked (top-bottom)
  // split each group is full-width but shorter. Compare how much width vs height
  // the first group gives up relative to the container.
  let orientation: "HORIZONTAL" | "VERTICAL" = "HORIZONTAL";
  if (groups.length >= 2) {
    const containerW = api.width;
    const containerH = api.height;
    const g0 = groups[0].api;
    const widthGiveUp = containerW - g0.width;
    const heightGiveUp = containerH - g0.height;
    orientation = widthGiveUp >= heightGiveUp ? "HORIZONTAL" : "VERTICAL";
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
  /**
   * Stable key identifying this window's project context (e.g. project root path).
   * When provided, layout is stored per-window so multiple windows with different
   * projects do not overwrite each other's dockview state.
   *
   * このウィンドウのプロジェクトコンテキストを識別する安定したキー（例: プロジェクトルートパス）。
   * 指定時はウィンドウごとにレイアウト状態を保存し、異なるプロジェクトの複数ウィンドウが
   * 互いの状態を上書きしないようにする。
   */
  windowKey?: string | null;
  /** Whether the app is currently in project mode. */
  isProject?: boolean;
}

export interface UseDockviewPersistenceReturn {
  /** Immediately flush pending layout state to storage (cancels debounce). */
  flushLayoutState: () => Promise<void>;
}

export function useDockviewPersistence({
  dockviewApi,
  tabs = [],
  enabled = true,
  windowKey,
  isProject = false,
}: UseDockviewPersistenceOptions): UseDockviewPersistenceReturn {
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const apiRef = useRef<DockviewApi | null>(null);
  apiRef.current = dockviewApi;
  const tabsRef = useRef<TabState[]>(tabs);
  tabsRef.current = tabs;
  const windowKeyRef = useRef(windowKey ?? null);
  windowKeyRef.current = windowKey ?? null;
  const isProjectRef = useRef(isProject);
  isProjectRef.current = isProject;

  /** Serialize and persist the current layout immediately. */
  const persistLayoutNow = useCallback(async () => {
    const api = apiRef.current;
    if (!api) return;
    try {
      const simplified = extractSimplifiedLayout(api, tabsRef.current);

      // --- Project mode: write to workspace.json ---
      if (isProjectRef.current) {
        if (!simplified) {
          // Single group = default layout. Clear any previously persisted multi-group
          // layout so that a stale split (with ghost clone keys like "file.mdi#1") is
          // not re-applied on the next session restore.
          // シングルグループに戻った際は、古い分割レイアウトを明示的に消去する。
          await persistWorkspaceJson({ dockviewLayout: undefined });
          return;
        }
        const rootPath = windowKeyRef.current;
        // Convert absolute paths → relative for workspace.json storage.
        // Filter out terminal/diff keys (ephemeral, not restored).
        const workspaceLayout: WorkspaceDockviewLayout = {
          groups: simplified.groups.map((g) => ({
            tabPaths: g.tabPaths.map((p) => {
              if (!p || p.startsWith("terminal:") || p.startsWith("diff:")) return null;
              return toRelativePath(p, rootPath) ?? p;
            }),
            activeTabPath: g.activeTabPath
              ? (toRelativePath(g.activeTabPath, rootPath) ?? g.activeTabPath)
              : null,
          })),
          orientation: simplified.orientation,
          sizes: simplified.sizes,
        };
        await persistWorkspaceJson({ dockviewLayout: workspaceLayout });
        return;
      }

      // --- Standalone mode: write to SQLite ---
      const layoutJson = api.toJSON();
      const layoutState: DockviewLayoutState = {
        dockviewJson: layoutJson,
        buffers: [],
        simplifiedLayout: simplified,
      };
      const key = windowKeyRef.current;
      if (key) {
        await persistWindowState(key, { dockviewLayout: layoutState });
      } else {
        await persistAppState({ dockviewLayout: layoutState });
      }
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
 * Load saved dockview layout for the given window key (or global AppState as fallback).
 * Returns null if no saved layout exists.
 *
 * @param windowKey - Stable key for the current window. When provided, the per-window
 *   store is checked first; falls back to global AppState for migration.
 */
export async function loadDockviewLayout(
  windowKey?: string | null,
): Promise<DockviewLayoutState | null> {
  try {
    if (windowKey) {
      const windowState = await fetchWindowState(windowKey);
      if (windowState?.dockviewLayout) return windowState.dockviewLayout;
    }
    const appState = await getStorageService().loadAppState();
    return appState?.dockviewLayout ?? null;
  } catch {
    return null;
  }
}
