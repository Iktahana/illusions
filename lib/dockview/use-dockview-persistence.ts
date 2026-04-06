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
 * Build a stable, ID-independent key for a tab that survives session restarts.
 * Supports same-file clones via `#N` suffix (e.g. "chapter1.mdi", "chapter1.mdi#1").
 *
 * Key formats:
 *   - First editor tab for a file: file path
 *   - Subsequent clones of same file: "filePath#1", "filePath#2", etc.
 *   - Unsaved editor tab: "unsaved:<tabId>"
 *   - Terminal tab: "terminal:<sessionId>"
 *   - Diff tab: "diff:<sourceTabId>"
 *
 * @param tab - The tab to generate a key for
 * @param occurrences - Mutable map tracking how many times each base path has been seen.
 *   Pass the same map across all tabs in a single serialization pass for correct indexing.
 */
function stableKeyForTab(tab: TabState, occurrences?: Map<string, number>): string | null {
  if (isEditorTab(tab)) {
    const basePath = tab.file?.path ?? `unsaved:${tab.id}`;
    if (occurrences) {
      const count = occurrences.get(basePath) ?? 0;
      occurrences.set(basePath, count + 1);
      return count === 0 ? basePath : `${basePath}#${count}`;
    }
    return basePath;
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
      if (isProjectRef.current && simplified) {
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
