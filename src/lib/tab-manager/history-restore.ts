/**
 * Decision logic for HistoryPanel → onHistoryRestore (#1845/G3).
 *
 * After a snapshot restore, the target tab must be marked clean or dirty
 * depending on whether the restored content matches what was last saved to
 * disk — a restored snapshot that differs from disk must not be silently
 * treated as clean (the tab dot, close-confirm dialog, and auto-save all key
 * off this). Any pending disk-conflict state is always cleared, since the
 * user just explicitly chose which version to keep.
 *
 * Extracted out of app/page.tsx so this branching logic has direct test
 * coverage instead of only running inside the full page component.
 */

import { sanitizeMdiContent } from "./types";
import { isEditorTab } from "./tab-types";
import type { TabState, FileSyncStatus } from "./tab-types";

export interface HistoryRestoreTabUpdate {
  fileSyncStatus: FileSyncStatus;
  isDirty: boolean;
  conflictDiskContent: null;
}

/**
 * Compute the tab update to apply after restoring `restoredContent` into
 * `targetTab`. Non-editor tabs and a missing target tab both fall back to
 * comparing against an empty "last saved" baseline.
 */
export function computeHistoryRestoreTabUpdate(
  restoredContent: string,
  targetTab: TabState | undefined,
): HistoryRestoreTabUpdate {
  const editorTab = targetTab && isEditorTab(targetTab) ? targetTab : null;
  const lastSaved = editorTab ? (editorTab.lastSavedContent ?? "") : "";
  const fileTypeOpts = editorTab ? { fileType: editorTab.fileType } : undefined;
  const isClean =
    sanitizeMdiContent(restoredContent, fileTypeOpts) ===
    sanitizeMdiContent(lastSaved, fileTypeOpts);

  return {
    fileSyncStatus: isClean ? "clean" : "dirty",
    // #1845: keep isDirty consistent with fileSyncStatus so the tab ● shows,
    // close-confirm fires, and auto-save picks up the restore. Editor remount
    // (incrementEditorKey) sets the value via defaultValueCtx and never fires
    // markdownUpdated, so isDirty would otherwise stay false after a restore.
    isDirty: !isClean,
    conflictDiskContent: null,
  };
}
