"use client";

import { useEffect, useRef } from "react";
import { getAutoSaveIntervalMs } from "../editor-page/power-policy";
import { getWindowActivitySnapshot, subscribeWindowActivity } from "../editor-page/window-activity";
import { notificationManager } from "../services/notification-manager";
import { executeTabSave } from "./save-executor";
import { isEditorTab } from "./tab-types";
import type { WindowActivityState } from "../editor-page/window-activity";
import type { SnapshotType } from "../services/history-policy";
import type { TabManagerCore } from "./types";

// ---------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------

export interface UseAutoSaveParams extends TabManagerCore {
  /** Whether auto-save is enabled. */
  autoSaveEnabled: boolean;
  /**
   * Power-save mode (user setting / battery auto-enable). When true and the
   * window is backgrounded, the auto-save interval is throttled to 20s by
   * the power policy (#1466). Foreground behavior is unchanged.
   *
   * 省電力モード。有効かつバックグラウンド時のみ自動保存間隔を 20 秒に
   * 間引く（#1466）。フォアグラウンドの挙動は変わらない。
   */
  powerSaveMode?: boolean;
  /** Ref holding the latest saveFile function (for active tab). */
  saveFileRef: React.MutableRefObject<(isAutoSave?: boolean) => Promise<void>>;
  /**
   * Create a history snapshot with the given type (project mode only).
   * B1 fix: caller supplies the correct SnapshotType.
   */
  tryCreateSnapshot: (
    type: SnapshotType,
    sourcePath: string,
    displayName: string,
    savedContent: string,
  ) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Manages the auto-save timer that periodically saves all dirty tabs
 * that have associated file descriptors.
 *
 * Orchestration only: the actual save pipeline (lock, sanitize, VFS vs
 * standalone write, watch suppression, tab-state update, snapshot) lives in
 * the shared executor (save-executor.ts, #1432).
 *
 * Power-aware throttling (#1466): the timer interval follows the power
 * policy (`getAutoSaveIntervalMs`) — 5s in the foreground, 20s while the
 * window is backgrounded with power-save mode on. Activity transitions
 * re-arm the interval via a direct subscription to the framework-free
 * window-activity service, so focus switches never re-render React
 * (#1427 lesson / #1445 guard).
 *
 * 電源対応スロットリング（#1466）：自動保存間隔は power policy に従う
 * （フォアグラウンド 5 秒 / 省電力モード有効かつバックグラウンド 20 秒）。
 * activity 変化時はタイマーを張り直す。React state を介さないため
 * フォーカス切替で再レンダーは発生しない（#1445 ガード）。
 */
export function useAutoSave(params: UseAutoSaveParams): void {
  const {
    setTabs,
    tabsRef,
    activeTabIdRef,
    isProjectRef,
    autoSaveEnabled,
    powerSaveMode = false,
    saveFileRef,
    tryCreateSnapshot,
  } = params;

  const autoSaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  useEffect(() => {
    if (!autoSaveEnabled) {
      if (autoSaveTimerRef.current) {
        clearInterval(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      return;
    }

    const runAutoSave = (): void => {
      const currentTabs = tabsRef.current;
      for (const tab of currentTabs) {
        // Skip non-editor tabs (terminal, diff) and conflicted editor tabs
        if (!isEditorTab(tab)) continue;
        if (tab.fileSyncStatus === "conflicted") continue;
        if (!tab.isDirty || !tab.file || tab.isSaving) continue;

        // Active tab: use the normal saveFile path (isAutoSave=true → "auto" snapshot)
        if (tab.id === activeTabIdRef.current) {
          void saveFileRef.current(true);
          continue;
        }

        // Background tabs need a real save target: never show a dialog from
        // a background auto-save.
        if (!tab.file.path && !tab.file.handle) continue;

        // Non-active dirty tabs: save via the shared executor. The executor
        // acquires the unified per-target lock synchronously (#1562 a /
        // #1579) and re-checks the conflicted transition right before
        // writing (#1562 b).
        void (async () => {
          const outcome = await executeTabSave({
            tab,
            isProject: isProjectRef.current,
            tabsRef,
            setTabs,
            tryCreateSnapshot,
            // B1 fix: auto-save interval → "auto" snapshot type
            snapshotType: "auto",
            isAutoSave: true,
            isMounted: () => mountedRef.current,
          });
          if (outcome.status === "failed") {
            console.error(`自動保存に失敗しました (${tab.file?.name}):`, outcome.error);
            notificationManager.warning(
              `自動保存に失敗しました: ${tab.file?.name ?? "不明なファイル"}`,
            );
          }
        })();
      }
    };

    /**
     * (Re-)arm the timer for the interval the power policy decides for the
     * given activity state. No-op when the interval is unchanged so repeated
     * notifications never reset the countdown unnecessarily.
     */
    let currentIntervalMs: number | null = null;
    const arm = (activity: WindowActivityState): void => {
      const intervalMs = getAutoSaveIntervalMs(activity, { powerSaveMode });
      if (intervalMs === currentIntervalMs) return;
      currentIntervalMs = intervalMs;
      if (autoSaveTimerRef.current) {
        clearInterval(autoSaveTimerRef.current);
      }
      autoSaveTimerRef.current = setInterval(runAutoSave, intervalMs);
    };

    // Subscribe directly to the framework-free signal source — no React
    // state, so focus switches never re-render the page (#1427 lesson).
    arm(getWindowActivitySnapshot());
    const unsubscribe = subscribeWindowActivity(arm);

    return () => {
      unsubscribe();
      if (autoSaveTimerRef.current) {
        clearInterval(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [
    autoSaveEnabled,
    powerSaveMode,
    setTabs,
    tabsRef,
    activeTabIdRef,
    isProjectRef,
    saveFileRef,
    tryCreateSnapshot,
  ]);
}
