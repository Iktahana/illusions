"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { createFileWatcher, suppressFileWatch } from "../services/file-watcher";
import { getVFS } from "../vfs";

import type { FileWatcher } from "../services/file-watcher";
import type { TabId, TabState } from "./tab-types";
import type { TabManagerCore } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** State representing an external file change conflict. */
export interface FileConflictState {
  /** Tab whose file was changed externally */
  tabId: TabId;
  /** Display name of the file */
  fileName: string;
  /** Actual disk modification timestamp (epoch ms) from the filesystem */
  diskTimestamp: number;
  /** Content currently on disk */
  remoteContent: string;
  /** Content currently in the editor */
  localContent: string;
}

// ---------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------

export interface UseFileWatchIntegrationParams extends TabManagerCore {
  /** Update a single tab by ID. */
  updateTab: (tabId: TabId, updates: Partial<TabState>) => void;
}

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface UseFileWatchIntegrationReturn {
  /** Current file conflict state, or null if no conflict. */
  fileConflict: FileConflictState | null;
  /** Resolve the conflict by keeping local or remote content. */
  resolveConflict: (resolution: "local" | "remote") => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Integrates the file watcher with the tab manager.
 * Monitors open project files for external changes and surfaces conflicts.
 *
 * プロジェクトファイルの外部変更を監視し、競合を検出するフック。
 */
export function useFileWatchIntegration(
  params: UseFileWatchIntegrationParams,
): UseFileWatchIntegrationReturn {
  const {
    tabs,
    setTabs,
    activeTabId,
    tabsRef,
    activeTabIdRef,
    isProjectRef,
    updateTab,
  } = params;

  const [fileConflict, setFileConflict] = useState<FileConflictState | null>(null);
  const watchersRef = useRef<Map<string, FileWatcher>>(new Map());

  // --- Conflict resolution ------------------------------------------------

  const resolveConflict = useCallback(
    (resolution: "local" | "remote") => {
      if (!fileConflict) return;

      const { tabId, remoteContent } = fileConflict;

      if (resolution === "remote") {
        // Accept disk content
        updateTab(tabId, {
          content: remoteContent,
          lastSavedContent: remoteContent,
          isDirty: false,
        });
      } else {
        // Keep local content — mark as dirty so user knows it differs from disk
        const tab = tabsRef.current.find((t) => t.id === tabId);
        if (tab) {
          updateTab(tabId, {
            lastSavedContent: remoteContent,
            isDirty: tab.content !== remoteContent,
          });
        }
      }

      setFileConflict(null);
    },
    [fileConflict, updateTab, tabsRef],
  );

  // --- Watcher lifecycle --------------------------------------------------

  useEffect(() => {
    if (!isProjectRef.current) return;

    const vfs = getVFS();
    if (!vfs.isRootOpen()) return;

    const currentWatchers = watchersRef.current;

    // Collect paths that currently need watching (open tabs with file paths)
    const neededPaths = new Set<string>();
    for (const tab of tabs) {
      if (tab.file?.path) {
        neededPaths.add(tab.file.path);
      }
    }

    // Stop watchers for tabs that are no longer open
    for (const [path, watcher] of currentWatchers) {
      if (!neededPaths.has(path)) {
        watcher.stop();
        currentWatchers.delete(path);
      }
    }

    // Start watchers for newly opened tabs
    for (const tab of tabs) {
      const path = tab.file?.path;
      if (!path || currentWatchers.has(path)) continue;

      const tabId = tab.id;
      const fileName = tab.file?.name ?? "不明";

      const watcher = createFileWatcher({
        path,
        onChanged: (content: string, lastModified: number) => {
          // Find the tab matching this path at the time of the callback
          const currentTab = tabsRef.current.find((t) => t.file?.path === path);
          if (!currentTab) return;

          // If content matches what the editor has, just update baseline silently
          if (currentTab.content === content) {
            updateTab(currentTab.id, {
              lastSavedContent: content,
              isDirty: false,
            });
            return;
          }

          // External change conflicts with local edits — surface the conflict
          // using the actual disk timestamp from the filesystem
          setFileConflict({
            tabId: currentTab.id,
            fileName: currentTab.file?.name ?? fileName,
            diskTimestamp: lastModified,
            remoteContent: content,
            localContent: currentTab.content,
          });
        },
      });

      watcher.start();
      currentWatchers.set(path, watcher);
    }

    return () => {
      // Cleanup all watchers on unmount
      for (const [, watcher] of currentWatchers) {
        watcher.stop();
      }
      currentWatchers.clear();
    };
  }, [tabs, tabsRef, isProjectRef, updateTab]);

  return {
    fileConflict,
    resolveConflict,
  };
}
