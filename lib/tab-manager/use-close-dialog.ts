"use client";

import { useCallback } from "react";
import { saveMdiFile } from "../mdi-file";
import { getVFS } from "../vfs";
import { suppressFileWatch } from "../file-watcher";
import type { TabId, TabState } from "../tab-types";
import { sanitizeMdiContent, getErrorMessage } from "./types";
import type { TabManagerCore } from "./types";

// ---------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------

export interface UseCloseDialogParams extends TabManagerCore {
  /** The tab id pending close (or null). */
  pendingCloseTabId: TabId | null;
  /** Clear the pending close tab id. */
  setPendingCloseTabId: React.Dispatch<React.SetStateAction<TabId | null>>;
  /** Update a single tab by id. */
  updateTab: (tabId: TabId, updates: Partial<TabState>) => void;
  /** Force-close a tab without dirty check. */
  forceCloseTab: (tabId: TabId) => void;
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
 */
export function useCloseDialog(params: UseCloseDialogParams): UseCloseDialogReturn {
  const {
    tabsRef,
    isProjectRef,
    pendingCloseTabId,
    setPendingCloseTabId,
    updateTab,
    forceCloseTab,
  } = params;

  const handleCloseTabSave = useCallback(async () => {
    if (!pendingCloseTabId) return;
    const tab = tabsRef.current.find((t) => t.id === pendingCloseTabId);
    if (!tab) return;

    try {
      const sanitized = sanitizeMdiContent(tab.content);

      if (isProjectRef.current && tab.file?.path) {
        const vfs = getVFS();
        suppressFileWatch(tab.file.path);
        await vfs.writeFile(tab.file.path, sanitized);
      } else {
        const result = await saveMdiFile({
          descriptor: tab.file,
          content: sanitized,
          fileType: tab.fileType,
        });
        if (!result) {
          // User cancelled save dialog → keep tab open
          setPendingCloseTabId(null);
          return;
        }
        updateTab(pendingCloseTabId, {
          file: result.descriptor,
          lastSavedContent: sanitized,
          isDirty: false,
        });
      }
    } catch (error) {
      console.error("保存に失敗しました:", error);
      const message = getErrorMessage(error);
      window.alert(`保存に失敗しました: ${message}`);
      return;
    }

    forceCloseTab(pendingCloseTabId);
    setPendingCloseTabId(null);
  }, [pendingCloseTabId, updateTab, forceCloseTab, tabsRef, isProjectRef, setPendingCloseTabId]);

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
