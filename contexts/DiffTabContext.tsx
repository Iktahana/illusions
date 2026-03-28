"use client";

/**
 * DiffTabContext — provides diff tab state lookup and conflict resolution actions
 * to dockview panel components that cannot access the tab manager directly.
 *
 * Populated by app/page.tsx; consumed by lib/dockview/dockview-components.tsx.
 */

import { createContext, useContext } from "react";
import type { DiffTabState } from "@/lib/tab-manager/tab-types";

// ---------------------------------------------------------------------------
// Context value
// ---------------------------------------------------------------------------

export interface DiffTabContextValue {
  /** Look up a diff tab by its own tab id */
  getDiffTabById: (tabId: string) => DiffTabState | undefined;
  /** Look up a diff tab by the source (editor) tab id */
  getDiffTabBySourceTabId: (sourceTabId: string) => DiffTabState | undefined;
  /**
   * Accept disk content: update the source editor tab buffer with the remote
   * content and clear its conflict state, then close the diff tab.
   */
  acceptDiskContent: (diffTabId: string) => void;
  /**
   * Keep editor content: clear the conflict state on the source tab
   * (mark it no longer conflicted) and close the diff tab.
   */
  keepEditorContent: (diffTabId: string) => void;
  /** Close only the diff tab, leaving the source tab conflict state intact. */
  closeDiffTab: (diffTabId: string) => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const DiffTabContext = createContext<DiffTabContextValue | null>(null);

export { DiffTabContext };

/**
 * Returns the diff tab context value.
 * Throws if used outside of a DiffTabContext.Provider.
 */
export function useDiffTabContext(): DiffTabContextValue {
  const ctx = useContext(DiffTabContext);
  if (!ctx) {
    throw new Error("useDiffTabContext must be used inside DiffTabContext.Provider");
  }
  return ctx;
}
