"use client";

import type { TabManagerCore } from "./types";

// ---------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------

export interface UseAutoSaveParams extends TabManagerCore {
  /** Whether auto-save is enabled. */
  autoSaveEnabled: boolean;
  /** Ref holding the latest saveFile function (for active tab). */
  saveFileRef: React.MutableRefObject<(isAutoSave?: boolean) => Promise<void>>;
  /** Create an auto-snapshot if conditions are met (project mode only). */
  tryAutoSnapshot: (
    sourcePath: string,
    displayName: string,
    savedContent: string,
    forceSnapshot?: boolean,
  ) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Phase 1 shim — auto-save logic removed pending Phase 8 rebuild.
 * See docs/superpowers/plans/2026-05-23-rebuild-save-history-io.md
 *
 * Signature is intentionally preserved so callers in lib/tab-manager/index.ts
 * continue to type-check without modification.
 */
export function useAutoSave(_params: UseAutoSaveParams): void {
  // Phase 1 stub — restored in Phase 8
}
