"use client";

import { useCallback } from "react";
import { notificationManager } from "../services/notification-manager";
import { executeTabSave } from "./save-executor";
import { isEditorTab } from "./tab-types";
import { getErrorMessage } from "./types";
import type { SnapshotType } from "../services/history-policy";
import type { TabId } from "./tab-types";
import type { TabManagerCore } from "./types";

// ---------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------

export interface UseCloseDialogParams extends TabManagerCore {
  /** The tab id pending close (or null). */
  pendingCloseTabId: TabId | null;
  /** Clear the pending close tab id. */
  setPendingCloseTabId: React.Dispatch<React.SetStateAction<TabId | null>>;
  /** Force-close a tab without dirty check. */
  forceCloseTab: (tabId: TabId) => void;
  /**
   * Create a history snapshot with the given type (project mode only).
   * B1 fix: caller supplies correct SnapshotType.
   */
  tryCreateSnapshot: (
    type: SnapshotType,
    sourcePath: string,
    displayName: string,
    savedContent: string,
  ) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface UseCloseDialogReturn {
  /** Save and then close the pending tab. */
  handleCloseTabSave: () => Promise<void>;
  /** Discard changes and close the pending tab. */
  handleCloseTabDiscard: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Handles the save/discard actions for the close-with-unsaved-changes dialog.
 *
 * Orchestration only: the actual save pipeline lives in the shared executor
 * (save-executor.ts, #1432). This hook decides whether the tab may close
 * afterwards — the tab is closed only when the save fully succeeded.
 */
export function useCloseDialog(params: UseCloseDialogParams): UseCloseDialogReturn {
  const {
    tabsRef,
    setTabs,
    isProjectRef,
    pendingCloseTabId,
    setPendingCloseTabId,
    forceCloseTab,
    tryCreateSnapshot,
  } = params;

  const handleCloseTabSave = useCallback(async () => {
    if (!pendingCloseTabId) return;
    const rawTab = tabsRef.current.find((t) => t.id === pendingCloseTabId);
    if (!rawTab) return;
    // pendingCloseTabId is only set for editor tabs (see closeTab guard in useTabState)
    if (!isEditorTab(rawTab)) return;
    const tab = rawTab;

    // Block save if the file has an unresolved conflict.
    // The in-editor content may be stale compared to the newer disk version,
    // so writing it would silently discard the disk changes.
    if (tab.fileSyncStatus === "conflicted") {
      notificationManager.error("競合状態のため保存できません。まず競合を解決してください。");
      setPendingCloseTabId(null);
      return;
    }

    const outcome = await executeTabSave({
      tab,
      isProject: isProjectRef.current,
      tabsRef,
      setTabs,
      tryCreateSnapshot,
      // B1 fix: tab close → "pre-close" snapshot type
      snapshotType: "pre-close",
      // Pre-close snapshots fall back to the file name when no path exists
      snapshotPathFallback: "name",
    });

    if (outcome.status === "failed") {
      console.error("保存に失敗しました:", outcome.error);
      notificationManager.error(`保存に失敗しました: ${getErrorMessage(outcome.error)}`);
      setPendingCloseTabId(null);
      return;
    }
    if (outcome.status !== "saved") {
      // "cancelled" (user cancelled save dialog), "locked", "conflicted",
      // "skipped" — the content was not written, so keep the tab open
      // instead of discarding the edits.
      setPendingCloseTabId(null);
      return;
    }

    forceCloseTab(pendingCloseTabId);
    setPendingCloseTabId(null);
  }, [
    pendingCloseTabId,
    forceCloseTab,
    tabsRef,
    setTabs,
    isProjectRef,
    setPendingCloseTabId,
    tryCreateSnapshot,
  ]);

  const handleCloseTabDiscard = useCallback(() => {
    if (pendingCloseTabId) {
      forceCloseTab(pendingCloseTabId);
      setPendingCloseTabId(null);
    }
  }, [pendingCloseTabId, forceCloseTab, setPendingCloseTabId]);

  return {
    handleCloseTabSave,
    handleCloseTabDiscard,
  };
}
