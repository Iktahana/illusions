"use client";

/**
 * Save-As destination de-duplication (#1872, DATA LOSS).
 *
 * "名前を付けて保存" can target a file that is ALREADY open in another tab.
 * Without a guard this produces two editor tabs holding the same
 * `file.path` (or the same underlying file handle on the web). Each tab then
 * keeps an independent, divergent buffer and can silently overwrite the other,
 * and the path-keyed file-watcher self-write suppression makes neither tab see
 * the other's write as an external change.
 *
 * This module owns the *pure* decision logic so it is unit-testable without a
 * mounted React tree: given all tabs, the Save-As source tab, and the resolved
 * destination descriptor, determine whether the destination collides with a
 * different already-open tab, and which tab is the redundant duplicate.
 *
 * The caller (use-file-io.saveAsFile) consumes the decision to consolidate:
 * the source tab (which now holds the just-saved content that is authoritative
 * on disk) is kept, the stale duplicate tab is force-closed, and the user is
 * warned — so the app never lingers in a two-tabs-one-path state.
 */

import { isEditorTab } from "./tab-types";
import type { EditorTabState, TabState } from "./tab-types";
import type { MdiFileDescriptor } from "../project/mdi-file";

/** Outcome of the Save-As duplicate check. */
export interface SaveAsDuplicateResult {
  /**
   * The OTHER editor tab (id !== source) that already holds the destination
   * path/handle, or null when there is no collision.
   */
  duplicateTab: EditorTabState | null;
}

/**
 * Pure, synchronous duplicate detection for path-based destinations
 * (Electron + web project VFS). Returns the first editor tab — other than the
 * Save-As source tab — whose `file.path` equals the resolved destination path.
 *
 * Handle-only (path-less, web FSA) descriptors are handled separately by
 * {@link findDuplicateByHandle}, which must await `isSameEntry()`.
 */
export function findDuplicatePathTab(
  tabs: readonly TabState[],
  destinationPath: string,
  sourceTabId: string,
): EditorTabState | null {
  if (!destinationPath) return null;
  for (const tab of tabs) {
    if (tab.id === sourceTabId) continue;
    if (!isEditorTab(tab)) continue;
    if (tab.file?.path === destinationPath) return tab;
  }
  return null;
}

/**
 * Async duplicate detection for path-less web destinations: compares the saved
 * FileSystemFileHandle against every other editor tab's handle via the
 * `isSameEntry()` API. Two distinct handle objects can point at the same
 * underlying file, so object identity alone is insufficient.
 *
 * Falls back to object identity when `isSameEntry` is unavailable, and treats a
 * thrown `isSameEntry` as "not the same entry" (fail-open to avoid blocking a
 * legitimate save on a flaky API).
 */
export async function findDuplicateByHandle(
  tabs: readonly TabState[],
  destinationHandle: FileSystemFileHandle,
  sourceTabId: string,
): Promise<EditorTabState | null> {
  for (const tab of tabs) {
    if (tab.id === sourceTabId) continue;
    if (!isEditorTab(tab)) continue;
    const handle = tab.file?.handle;
    if (!handle) continue;
    if (handle === destinationHandle) return tab;
    const hasIsSameEntry = typeof (handle as { isSameEntry?: unknown }).isSameEntry === "function";
    if (!hasIsSameEntry) continue;
    try {
      if (await handle.isSameEntry(destinationHandle)) return tab;
    } catch {
      // Treat a failed comparison as "not the same entry".
    }
  }
  return null;
}

/**
 * Resolve the Save-As duplicate for a saved descriptor (path or handle).
 * Picks the path-based check when a path is present, otherwise the
 * handle-based async check.
 */
export async function resolveSaveAsDuplicate(
  tabs: readonly TabState[],
  descriptor: MdiFileDescriptor,
  sourceTabId: string,
): Promise<SaveAsDuplicateResult> {
  if (descriptor.path) {
    return { duplicateTab: findDuplicatePathTab(tabs, descriptor.path, sourceTabId) };
  }
  if (descriptor.handle) {
    return {
      duplicateTab: await findDuplicateByHandle(tabs, descriptor.handle, sourceTabId),
    };
  }
  return { duplicateTab: null };
}

/**
 * Warning shown after Save-As detected the destination was already open in
 * another tab.
 *
 * The previous copy said "1つのタブに統合し" ("merged into one tab"), which is
 * misleading: no content is ever merged. Save-As simply wrote this tab's content
 * to the destination on disk; the other tab held a separate buffer that is now
 * redundant. The copy below describes what actually happens.
 *
 * @param name           Destination file name.
 * @param duplicateDirty When the other tab had its own unsaved edits, the close
 *                       is deferred to the unsaved-changes dialog instead of
 *                       happening silently — so the copy must not claim the tab
 *                       was already closed.
 */
export const saveAsDuplicateWarning = (name: string, duplicateDirty = false): string =>
  duplicateDirty
    ? `「${name}」は既に別のタブで開いており、そのタブには未保存の変更があります。保存先と重複するため、未保存の内容を破棄してよいか確認します。`
    : `「${name}」は既に別のタブで開いていました。保存先と重複するため、もう一方のタブを閉じました（内容はこのタブの保存結果が反映されています）。`;
