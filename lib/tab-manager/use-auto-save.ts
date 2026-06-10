"use client";

import { useEffect, useRef } from "react";
import { notificationManager } from "../services/notification-manager";
import { executeTabSave } from "./save-executor";
import { isEditorTab } from "./tab-types";
import { AUTO_SAVE_INTERVAL } from "./types";
import type { SnapshotType } from "../services/history-policy";
import type { TabManagerCore } from "./types";

// ---------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------

export interface UseAutoSaveParams extends TabManagerCore {
  /** Whether auto-save is enabled. */
  autoSaveEnabled: boolean;
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
 */
export function useAutoSave(params: UseAutoSaveParams): void {
  const {
    setTabs,
    tabsRef,
    activeTabIdRef,
    isProjectRef,
    autoSaveEnabled,
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

    autoSaveTimerRef.current = setInterval(() => {
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
    }, AUTO_SAVE_INTERVAL);

    return () => {
      if (autoSaveTimerRef.current) {
        clearInterval(autoSaveTimerRef.current);
      }
    };
  }, [
    autoSaveEnabled,
    setTabs,
    tabsRef,
    activeTabIdRef,
    isProjectRef,
    saveFileRef,
    tryCreateSnapshot,
  ]);
}
