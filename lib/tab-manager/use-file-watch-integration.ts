"use client";

import { useEffect, useRef } from "react";
import { createFileWatcher } from "../services/file-watcher";
import { notificationManager } from "../services/notification-manager";
import { isEditorTab } from "./tab-types";
import type { FileWatcher } from "../services/file-watcher";
import type { TabId, TabState, EditorTabState, DiffTabState } from "./tab-types";
import type { TabManagerCore } from "./types";

// ---------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------

export interface UseFileWatchIntegrationParams extends TabManagerCore {
  /**
   * Callback to open a diff tab for conflict visualization.
   * Called when the user clicks "差分を表示".
   * Placeholder for Phase 4 implementation.
   *
   * 差分タブを開くコールバック（コンフリクト可視化）。
   * ユーザーが「差分を表示」をクリックした際に呼ばれる。
   * Phase 4 実装のプレースホルダー。
   */
  openDiffTab: (
    sourceTabId: TabId,
    sourceFileName: string,
    localContent: string,
    remoteContent: string,
    remoteTimestamp: number,
  ) => void;
  /**
   * Callback to trigger an editor remount (increment editorKey).
   * Called after applying external content so the Milkdown instance
   * re-initializes with the updated content.
   *
   * エディタの再マウントをトリガーするコールバック（editorKey をインクリメント）。
   * 外部コンテンツ適用後に呼び出し、Milkdown インスタンスを再初期化する。
   */
  onEditorRemountNeeded?: () => void;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build the onChanged callback for an editor tab.
 * Implements the state-transition logic described in issue #825.
 *
 * エディタタブの onChanged コールバックを生成する。
 * issue #825 で定義された状態遷移ロジックを実装する。
 */
function buildOnChanged(
  tabId: TabId,
  setTabs: TabManagerCore["setTabs"],
  tabsRef: TabManagerCore["tabsRef"],
  openDiffTab: UseFileWatchIntegrationParams["openDiffTab"],
  onEditorRemountNeeded?: () => void,
): (diskContent: string, lastModified: number) => void {
  return (diskContent: string, lastModified: number) => {
    const currentTabs = tabsRef.current;
    const tab = currentTabs.find((t) => t.id === tabId);
    if (!tab || !isEditorTab(tab)) return;

    const fileName = tab.file?.name ?? "ファイル";

    if (tab.fileSyncStatus === "clean") {
      // Clean tab: auto-reload with disk content
      setTabs((prev) =>
        prev.map((t) => {
          if (t.id !== tabId || !isEditorTab(t)) return t;
          return {
            ...t,
            content: diskContent,
            lastSavedContent: diskContent,
            isDirty: false,
            fileSyncStatus: "clean",
            conflictDiskContent: null,
          } satisfies EditorTabState;
        }),
      );
      onEditorRemountNeeded?.();
      notificationManager.info(`「${fileName}」が更新されました`, 3000);
    } else if (tab.fileSyncStatus === "dirty") {
      // Dirty tab: do NOT touch buffer; enter conflicted state
      const localContent = tab.content;

      setTabs((prev) =>
        prev.map((t) => {
          if (t.id !== tabId || !isEditorTab(t)) return t;
          return {
            ...t,
            fileSyncStatus: "conflicted",
            conflictDiskContent: diskContent,
          } satisfies EditorTabState;
        }),
      );

      // Show persistent notification with conflict resolution actions
      notificationManager.showMessage(`「${fileName}」が外部で変更されました`, {
        type: "warning",
        duration: 0, // Persistent until dismissed or action taken
        actions: [
          {
            label: "差分を表示",
            onClick: () => {
              openDiffTab(tabId, fileName, localContent, diskContent, lastModified);
              // Do not clear conflict state; user must explicitly resolve
            },
          },
          {
            label: "ディスクの内容を採用",
            onClick: () => {
              setTabs((prev) =>
                prev.map((t) => {
                  if (t.id !== tabId || !isEditorTab(t)) return t;
                  return {
                    ...t,
                    content: diskContent,
                    lastSavedContent: diskContent,
                    isDirty: false,
                    fileSyncStatus: "clean",
                    conflictDiskContent: null,
                  } satisfies EditorTabState;
                }),
              );
              onEditorRemountNeeded?.();
            },
          },
          {
            label: "エディタの内容を保持",
            onClick: () => {
              setTabs((prev) =>
                prev.map((t) => {
                  if (t.id !== tabId || !isEditorTab(t)) return t;
                  return {
                    ...t,
                    fileSyncStatus: "dirty",
                    conflictDiskContent: null,
                  } satisfies EditorTabState;
                }),
              );
            },
          },
        ],
      });
    }
    // If already "conflicted", ignore further disk changes (user must resolve first)
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Manages file system watchers for all open editor tabs.
 * Detects external file modifications and applies state-transition logic:
 *   - Clean tab  → auto-reload with toast
 *   - Dirty tab  → enter conflicted state with persistent notification
 *
 * 全エディタタブのファイルシステムウォッチャーを管理する。
 * 外部ファイル変更を検出し、状態遷移ロジックを適用する:
 *   - clean タブ → 自動リロード + トースト通知
 *   - dirty タブ → コンフリクト状態に遷移 + 永続通知
 *
 * Active-tab watchers run continuously; background-tab watchers are paused
 * to reduce CPU usage. Watchers are stopped when a tab closes.
 *
 * アクティブタブのウォッチャーは継続稼働し、バックグラウンドタブは
 * CPU 節約のため一時停止する。タブを閉じるとウォッチャーも停止する。
 */
export function useFileWatchIntegration(params: UseFileWatchIntegrationParams): void {
  const { tabs, setTabs, activeTabId, tabsRef, isElectron, openDiffTab, onEditorRemountNeeded } =
    params;

  /**
   * Map from tabId to its FileWatcher instance.
   * Persists across renders without causing re-renders.
   *
   * tabId からウォッチャーインスタンスへのマップ。
   * 再レンダリングを引き起こさずにレンダー間で保持する。
   */
  const watchersRef = useRef<Map<TabId, FileWatcher>>(new Map());

  /**
   * Map from tabId to the file path that the current watcher was created for.
   * Used to detect path changes after Save As operations.
   *
   * tabId から現在のウォッチャーが生成された file path へのマップ。
   * Save As 後の path 変更を検出するために使用する。
   */
  const watcherPathsRef = useRef<Map<TabId, string>>(new Map());

  // ---------------------------------------------------------------------------
  // Sync watchers when tabs change
  // ---------------------------------------------------------------------------

  useEffect(() => {
    // File watching only makes sense in Electron (project mode with real paths)
    if (!isElectron) return;

    const watchers = watchersRef.current;
    const currentTabIds = new Set(tabs.map((t) => t.id));

    const watcherPaths = watcherPathsRef.current;

    // Stop and remove watchers for tabs that no longer exist
    for (const [tabId, watcher] of watchers) {
      if (!currentTabIds.has(tabId)) {
        watcher.stop();
        watchers.delete(tabId);
        watcherPaths.delete(tabId);
      }
    }

    // Create or update watchers for editor tabs with real file paths
    for (const tab of tabs) {
      if (!isEditorTab(tab)) continue;
      const filePath = tab.file?.path;
      if (!filePath) continue;

      const isActiveTab = tab.id === activeTabId;
      const existing = watchers.get(tab.id);

      // If the file path changed (e.g. after Save As), stop the old watcher
      // so it no longer monitors the previous path.
      // path が変わった場合（Save As 後など）は古いウォッチャーを停止して再生成する。
      if (existing && watcherPaths.get(tab.id) !== filePath) {
        existing.stop();
        watchers.delete(tab.id);
        watcherPaths.delete(tab.id);
      }

      if (!watchers.has(tab.id)) {
        // Create a new watcher for this tab
        const onChanged = buildOnChanged(
          tab.id,
          setTabs,
          tabsRef,
          openDiffTab,
          onEditorRemountNeeded,
        );
        const watcher = createFileWatcher({ path: filePath, onChanged });

        if (isActiveTab) {
          watcher.start();
        }
        // Background tabs are not started yet (started when becoming active)
        watchers.set(tab.id, watcher);
        watcherPaths.set(tab.id, filePath);
      }
    }
  }, [tabs, activeTabId, isElectron, setTabs, tabsRef, openDiffTab, onEditorRemountNeeded]);

  // ---------------------------------------------------------------------------
  // Pause/resume watchers based on active tab
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!isElectron) return;

    const watchers = watchersRef.current;
    for (const [tabId, watcher] of watchers) {
      const tab = tabsRef.current.find((t) => t.id === tabId);
      if (!tab || !isEditorTab(tab) || !tab.file?.path) continue;

      if (tabId === activeTabId) {
        // Resume active tab watcher
        if (!watcher.isActive) {
          watcher.start();
        }
      } else {
        // Pause background tab watchers to save CPU
        if (watcher.isActive) {
          watcher.stop();
        }
      }
    }
  }, [activeTabId, isElectron, tabsRef]);

  // ---------------------------------------------------------------------------
  // Cleanup all watchers on unmount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    return () => {
      for (const watcher of watchersRef.current.values()) {
        watcher.stop();
      }
      watchersRef.current.clear();
      watcherPathsRef.current.clear();
    };
  }, []);
}
