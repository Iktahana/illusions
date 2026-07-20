"use client";

import { useEffect, useRef } from "react";
import { shouldPauseFileWatchers } from "../editor-page/power-policy";
import { getWindowActivitySnapshot, subscribeWindowActivity } from "../editor-page/window-activity";
import { createFileWatcher } from "../services/file-watcher";
import { notificationManager } from "../services/notification-manager";
import { getProjectFileService } from "../services/project-file-service";
import { isEditorTab } from "./tab-types";
import type { WindowActivityState } from "../editor-page/window-activity";
import type { FileWatcher } from "../services/file-watcher";
import type { TabId, EditorTabState } from "./tab-types";
import type { TabManagerCore } from "./types";
import type { SnapshotType } from "../services/history-policy";

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
  /**
   * G2: Create a history snapshot before applying external disk changes.
   * Called only when the tab is dirty (has unsaved edits) and the user
   * confirms replacing the in-memory content with the disk version.
   *
   * G2: 外部ディスク変更を適用する前に履歴スナップショットを作成する。
   * タブが dirty（未保存の編集あり）でユーザーがディスク内容で上書きを
   * 確認した場合のみ呼び出す。
   */
  tryCreateSnapshot?: (
    type: SnapshotType,
    sourcePath: string,
    displayName: string,
    savedContent: string,
  ) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Cloud sync clients can briefly echo stale contents immediately after a save.
 * During this window, a clean tab must not auto-reload differing disk bytes
 * because that can resurrect content the user just deleted. Quarantine the
 * first mismatch and re-read the file after a short delay; only persistent
 * divergence becomes a conflict.
 */
export const RECENT_SAVE_EXTERNAL_RELOAD_GRACE_MS = 30_000;
export const RECENT_SAVE_RECHECK_DELAY_MS = 2_000;

function isWithinRecentSaveGrace(tab: EditorTabState, now: number = Date.now()): boolean {
  if (!tab.lastSavedTime) return false;
  const elapsed = now - tab.lastSavedTime;
  return elapsed >= 0 && elapsed <= RECENT_SAVE_EXTERNAL_RELOAD_GRACE_MS;
}

interface RecentSaveVerificationOptions {
  filePath: string;
  pendingVerifications: Map<TabId, ReturnType<typeof setTimeout>>;
  readDiskContent: (path: string) => Promise<string>;
}

/**
 * Build the onChanged callback for an editor tab.
 * Implements the state-transition logic described in issue #825.
 *
 * エディタタブの onChanged コールバックを生成する。
 * issue #825 で定義された状態遷移ロジックを実装する。
 *
 * Exported for testing only. Callers should use useFileWatchIntegration.
 */
export function buildOnChanged(
  tabId: TabId,
  setTabs: TabManagerCore["setTabs"],
  tabsRef: TabManagerCore["tabsRef"],
  openDiffTab: UseFileWatchIntegrationParams["openDiffTab"],
  onEditorRemountNeeded?: () => void,
  tryCreateSnapshot?: UseFileWatchIntegrationParams["tryCreateSnapshot"],
  recentSaveVerification?: RecentSaveVerificationOptions,
): (diskContent: string, lastModified: number) => void {
  return (diskContent: string, lastModified: number) => {
    const currentTabs = tabsRef.current;
    const tab = currentTabs.find((t) => t.id === tabId);
    if (!tab || !isEditorTab(tab)) return;

    const fileName = tab.file?.name ?? "ファイル";

    const clearPendingRecentSaveVerification = (): void => {
      const pending = recentSaveVerification?.pendingVerifications.get(tabId);
      if (!pending) return;
      clearTimeout(pending);
      recentSaveVerification?.pendingVerifications.delete(tabId);
    };

    // Self-write echo guard (#1448 Codex review): a save performed while the
    // watchers were paused can outlive the time-boxed suppressFileWatch entry
    // (~poll interval + 3s). When the watcher resumes and reports a "change"
    // whose content is exactly what we last saved, it is our own write
    // echoing back — never a real external change. Reloading it would reset
    // the cursor (clean tab) or raise a phantom conflict (dirty tab).
    if (diskContent === tab.lastSavedContent) {
      clearPendingRecentSaveVerification();
      return;
    }

    const enterConflictedState = (
      localContent: string,
      conflictDiskContent: string,
      conflictLastModified: number,
    ): void => {
      clearPendingRecentSaveVerification();

      // Fix #1562 (b): eagerly mirror the conflicted transition into tabsRef.
      // tabsRef is only reassigned from React state on the next render, so
      // the synchronous save guards (auto-save interval / saveFile) would
      // otherwise read a stale non-conflicted snapshot and overwrite the
      // external change on disk before the setTabs update below commits.
      tabsRef.current = tabsRef.current.map((t) => {
        if (t.id !== tabId || !isEditorTab(t)) return t;
        return {
          ...t,
          isDirty: true,
          fileSyncStatus: "conflicted",
          conflictDiskContent,
        } satisfies EditorTabState;
      });

      setTabs((prev) =>
        prev.map((t) => {
          if (t.id !== tabId || !isEditorTab(t)) return t;
          return {
            ...t,
            isDirty: true,
            fileSyncStatus: "conflicted",
            conflictDiskContent,
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
              openDiffTab(tabId, fileName, localContent, conflictDiskContent, conflictLastModified);
              // Do not clear conflict state; user must explicitly resolve
            },
          },
          {
            label: "ディスクの内容を採用",
            onClick: () => {
              // G2: snapshot the current in-memory content before overwriting
              // with the external disk version (pre-external-reload).
              // Only snapshot when the tab is dirty (has edits worth preserving).
              // G2: 外部ディスク内容で上書きする前に、メモリ上の現在の
              // 内容を pre-external-reload スナップショットとして記録する。
              const currentTab = tabsRef.current.find((t) => t.id === tabId);
              if (currentTab && isEditorTab(currentTab) && currentTab.isDirty) {
                const filePath = currentTab.file?.path ?? "";
                const displayName = currentTab.file?.name ?? fileName;
                void tryCreateSnapshot?.(
                  "pre-external-reload",
                  filePath,
                  displayName,
                  currentTab.content,
                );
              }

              setTabs((prev) =>
                prev.map((t) => {
                  if (t.id !== tabId || !isEditorTab(t)) return t;
                  return {
                    ...t,
                    content: conflictDiskContent,
                    lastSavedContent: conflictDiskContent,
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
                    isDirty: true,
                    fileSyncStatus: "dirty",
                    conflictDiskContent: null,
                  } satisfies EditorTabState;
                }),
              );
            },
          },
        ],
      });
    };

    const applyCleanExternalReload = (newDiskContent: string): void => {
      clearPendingRecentSaveVerification();

      // Clean tab: auto-reload with disk content via pendingExternalContent
      // (preserves scroll position instead of remounting the editor)
      setTabs((prev) =>
        prev.map((t) => {
          if (t.id !== tabId || !isEditorTab(t)) return t;
          return {
            ...t,
            content: newDiskContent,
            lastSavedContent: newDiskContent,
            isDirty: false,
            fileSyncStatus: "clean",
            conflictDiskContent: null,
            pendingExternalContent: newDiskContent,
          } satisfies EditorTabState;
        }),
      );
      notificationManager.info(`「${fileName}」が更新されました`, 3000);
    };

    const scheduleRecentSaveVerification = (): void => {
      if (!recentSaveVerification) {
        enterConflictedState(tab.content, diskContent, lastModified);
        return;
      }

      clearPendingRecentSaveVerification();

      const { filePath, pendingVerifications, readDiskContent } = recentSaveVerification;
      const timer = setTimeout(() => {
        pendingVerifications.delete(tabId);
        void (async () => {
          let confirmedDiskContent = diskContent;

          try {
            confirmedDiskContent = await readDiskContent(filePath);
          } catch (error) {
            console.warn("Failed to re-read file after recent-save watcher mismatch:", error);
          }

          const latest = tabsRef.current.find((t) => t.id === tabId);
          if (!latest || !isEditorTab(latest)) return;
          if (latest.file?.path !== filePath) return;
          if (latest.fileSyncStatus === "conflicted") return;

          // The cloud client settled back to the bytes we saved. Treat the first
          // watcher event as transient sync noise and keep the UI quiet.
          if (confirmedDiskContent === latest.lastSavedContent) {
            return;
          }

          if (latest.fileSyncStatus === "clean" || latest.fileSyncStatus === "dirty") {
            enterConflictedState(latest.content, confirmedDiskContent, lastModified);
          }
        })();
      }, RECENT_SAVE_RECHECK_DELAY_MS);

      pendingVerifications.set(tabId, timer);
    };

    if (tab.fileSyncStatus === "clean") {
      if (isWithinRecentSaveGrace(tab)) {
        scheduleRecentSaveVerification();
        return;
      }

      applyCleanExternalReload(diskContent);
    } else if (tab.fileSyncStatus === "dirty") {
      // Dirty tab: do NOT touch buffer; enter conflicted state
      enterConflictedState(tab.content, diskContent, lastModified);
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
 *
 * Additionally, ALL watchers pause while the window itself is in the
 * background (blurred or hidden), per the power policy decision
 * `shouldPauseFileWatchers` (#1448, restoring the PR #1427 CPU-saving
 * requirement). On resume the FileWatcher's own mtime / content-hash
 * catch-up runs, so the external-change flow fires only when the disk
 * genuinely changed — a focus round-trip with no disk change never
 * reloads or notifies (#1445 guard). Self-saves made while paused are
 * ignored via the save-executor's suppressFileWatch content-hash match.
 *
 * さらに、ウィンドウ自体がバックグラウンド（blur / 非表示）の間は
 * power policy の判断（shouldPauseFileWatchers）に従い全ウォッチャーを
 * 停止する（#1448）。再開時は watcher 側の mtime / content-hash 照合に
 * より、ディスクが実際に変化した場合のみ外部変更フローが走る（#1445
 * ガード）。停止中の自己保存は suppressFileWatch の content-hash 照合で
 * 外部変更と誤検知されない。
 */
export function useFileWatchIntegration(params: UseFileWatchIntegrationParams): void {
  const {
    tabs,
    setTabs,
    activeTabId,
    activeTabIdRef,
    tabsRef,
    isElectron,
    openDiffTab,
    onEditorRemountNeeded,
    tryCreateSnapshot,
  } = params;

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
  const pendingRecentSaveVerificationsRef = useRef<Map<TabId, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  /**
   * Whether watchers are currently paused by the window-activity policy
   * (window blurred or document hidden). Consulted by the tab-driven
   * effects below so they never start a watcher while the window is in
   * the background.
   *
   * window activity ポリシーによりウォッチャーが停止中かどうか。
   * 以下のタブ駆動の effect が、バックグラウンド中にウォッチャーを
   * 起動しないよう参照する。
   */
  const activityPausedRef = useRef(false);

  // ---------------------------------------------------------------------------
  // Sync watchers when tabs change
  // ---------------------------------------------------------------------------

  useEffect(() => {
    // File watching only makes sense in Electron (project mode with real paths)
    if (!isElectron) return;

    const watchers = watchersRef.current;
    const currentTabIds = new Set(tabs.map((t) => t.id));

    const watcherPaths = watcherPathsRef.current;

    // Tabs that still have a watchable file path this render.
    const pathfulTabIds = new Set(
      tabs.filter((t) => isEditorTab(t) && t.file?.path).map((t) => t.id),
    );

    // Stop and remove watchers for tabs that no longer exist OR that lost their
    // file path (#1868: a deleted open file is detached to an untitled tab —
    // its watcher must stop so it cannot keep observing the now-deleted path).
    for (const [tabId, watcher] of watchers) {
      if (!currentTabIds.has(tabId) || !pathfulTabIds.has(tabId)) {
        watcher.stop();
        watchers.delete(tabId);
        watcherPaths.delete(tabId);
        const pending = pendingRecentSaveVerificationsRef.current.get(tabId);
        if (pending) {
          clearTimeout(pending);
          pendingRecentSaveVerificationsRef.current.delete(tabId);
        }
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
        const pending = pendingRecentSaveVerificationsRef.current.get(tab.id);
        if (pending) {
          clearTimeout(pending);
          pendingRecentSaveVerificationsRef.current.delete(tab.id);
        }
      }

      if (!watchers.has(tab.id)) {
        // Create a new watcher for this tab
        const onChanged = buildOnChanged(
          tab.id,
          setTabs,
          tabsRef,
          openDiffTab,
          onEditorRemountNeeded,
          tryCreateSnapshot,
          {
            filePath,
            pendingVerifications: pendingRecentSaveVerificationsRef.current,
            readDiskContent: (path) => getProjectFileService().readFile(path),
          },
        );
        const watcher = createFileWatcher({ path: filePath, onChanged });

        if (isActiveTab && !activityPausedRef.current) {
          watcher.start();
        }
        // Background tabs are not started yet (started when becoming active)
        watchers.set(tab.id, watcher);
        watcherPaths.set(tab.id, filePath);
      }
    }
  }, [
    tabs,
    activeTabId,
    isElectron,
    setTabs,
    tabsRef,
    openDiffTab,
    onEditorRemountNeeded,
    tryCreateSnapshot,
  ]);

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
        // Resume active tab watcher (unless the window is in the background)
        if (!watcher.isActive && !activityPausedRef.current) {
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
  // Pause/resume watchers based on window activity (#1448)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!isElectron) return;

    /**
     * Apply the power-policy decision for the given activity state.
     * Pausing stops every watcher; resuming starts only the active tab's
     * watcher (background tabs stay paused, matching the tab policy
     * above). FileWatcher.start() performs the mtime / content-hash
     * catch-up, so resuming never fires the external-change flow unless
     * the disk content actually changed while paused.
     */
    const applyActivity = (activity: WindowActivityState): void => {
      const paused = shouldPauseFileWatchers(activity);
      if (paused === activityPausedRef.current) return;
      activityPausedRef.current = paused;

      const watchers = watchersRef.current;
      if (paused) {
        for (const watcher of watchers.values()) {
          if (watcher.isActive) {
            watcher.stop();
          }
        }
      } else {
        const activeWatcher = watchers.get(activeTabIdRef.current);
        if (activeWatcher && !activeWatcher.isActive) {
          activeWatcher.start();
        }
      }
    };

    // Subscribe directly to the framework-free signal source — no React
    // state, so focus switches never re-render the page (#1427 lesson).
    applyActivity(getWindowActivitySnapshot());
    const unsubscribe = subscribeWindowActivity(applyActivity);

    return () => {
      unsubscribe();
      activityPausedRef.current = false;
    };
  }, [isElectron, activeTabIdRef]);

  // ---------------------------------------------------------------------------
  // Cleanup all watchers on unmount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const watchers = watchersRef.current;
    const watcherPaths = watcherPathsRef.current;
    const pendingRecentSaveVerifications = pendingRecentSaveVerificationsRef.current;

    return () => {
      for (const watcher of watchers.values()) {
        watcher.stop();
      }
      watchers.clear();
      watcherPaths.clear();
      for (const pending of pendingRecentSaveVerifications.values()) {
        clearTimeout(pending);
      }
      pendingRecentSaveVerifications.clear();
    };
  }, []);
}
