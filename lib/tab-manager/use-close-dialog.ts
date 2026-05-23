"use client";

import { useCallback } from "react";
import type { TabId, EditorTabState } from "./tab-types";
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
  updateTab: (tabId: TabId, updates: Partial<EditorTabState>) => void;
  /** Force-close a tab without dirty check. */
  forceCloseTab: (tabId: TabId) => void;
  /**
   * Attempt to create a history snapshot after saving (project mode only).
   * Phase 2 shim: not used until Phase 8 re-introduces save + snapshot.
   */
  tryAutoSnapshot: (
    sourcePath: string,
    displayName: string,
    savedContent: string,
    forceSnapshot?: boolean,
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
 * Phase 2 shim: save path is a no-op (just discards). Re-implemented in Phase 8.
 * Signature is preserved so callers in lib/tab-manager/index.ts continue to
 * type-check without modification.
 */
export function useCloseDialog(params: UseCloseDialogParams): UseCloseDialogReturn {
  const { pendingCloseTabId, setPendingCloseTabId, forceCloseTab } = params;

  // Phase 2 stub: save logic removed. Treat "save & close" as plain "discard & close".
  // The dialog should eventually be simplified to a single button in Phase 8.
  const handleCloseTabSave = useCallback(async () => {
    if (pendingCloseTabId) {
      forceCloseTab(pendingCloseTabId);
      setPendingCloseTabId(null);
    }
  }, [pendingCloseTabId, forceCloseTab, setPendingCloseTabId]);

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
