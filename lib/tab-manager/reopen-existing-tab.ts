/**
 * Decision logic for re-opening a path that is already open in a tab (#1873).
 *
 * Data-loss bug: previously, both `openFile` (system dialog) and
 * `loadSystemFile` (Finder / OS open-file event) unconditionally overwrote the
 * existing tab's `content` / `lastSavedContent` with the freshly-read disk
 * value and reset `isDirty` to `false`. If the tab had unsaved edits, those
 * edits were silently destroyed with no warning, snapshot, or undo recovery.
 *
 * Correct behaviour (per #1873 期待する結果):
 *   - If the same path is already open, ALWAYS just activate that tab.
 *   - Never implicitly overwrite in-memory content from disk — neither for
 *     dirty tabs (would lose edits) nor for clean tabs (reload-from-disk must
 *     be an explicit user action, not a side effect of "open").
 *
 * An explicit "reload from disk" flow that discards unsaved edits with
 * confirmation + pre-reload snapshot lives elsewhere (file-watch integration);
 * the plain "open the same file again" path must preserve user data.
 */

import type { EditorTabState } from "./tab-types";

/** Outcome of the reopen-existing-tab decision. */
export interface ReopenDecision {
  /** Activate this existing tab (always set when a duplicate is found). */
  activateTabId: string;
  /**
   * Whether the in-memory content may be safely refreshed from disk.
   *
   * Always `false`: re-opening a path never clobbers the buffer. A true
   * disk reload is a separate, explicit, confirmation-gated action.
   */
  reloadFromDisk: false;
}

/**
 * Decide what to do when the user opens a path that is already open.
 *
 * @returns a decision that only ever activates the existing tab. Returns
 *          `null` when there is no existing tab (caller proceeds to create one).
 */
export function decideReopenExistingTab(
  existing: EditorTabState | undefined,
): ReopenDecision | null {
  if (!existing) return null;
  return {
    activateTabId: existing.id,
    reloadFromDisk: false,
  };
}
