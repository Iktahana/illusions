"use client";

/**
 * Reusable, pure tab path-sync helpers (#1868, shared with #1870).
 *
 * When a project file is renamed / moved / deleted from the explorer (or
 * inspector), any open editor tab that references the old path keeps a stale
 * `tab.file.path`. The next save (manual or auto) then writes to the old path
 * via the save executor, resurrecting the renamed/deleted file at its previous
 * location and splitting the document in two.
 *
 * These helpers compute the corrected tabs array for each mutation:
 *   - applyTabRename : rewrite the path/name of the renamed file and every tab
 *     under a renamed directory (atomic, byte-preserving — content untouched).
 *   - applyTabDelete : detach the file descriptor (file → null) of every tab
 *     under a deleted path so the save executor / auto-save can no longer
 *     resurrect the old path. Detached tabs become "untitled" dirty tabs whose
 *     content the user can still save elsewhere.
 *
 * All paths here are VFS-relative (e.g. "subdir/file.mdi"), matching both the
 * explorer's `toVFSPath()` output and the project-mode `tab.file.path` value.
 * They are pure functions over a tabs array so they can be unit-tested without
 * React and reused by any caller (explorer mutations, inspector rename, …).
 */

import { isEditorTab } from "./tab-types";
import { inferFileType } from "./types";
import type { EditorTabState, TabState } from "./tab-types";

// ---------------------------------------------------------------------------
// Path matching
// ---------------------------------------------------------------------------

/**
 * Whether `candidate` is exactly `base` or a descendant path of the `base`
 * directory. Used so a folder rename/delete also catches files nested inside.
 *
 * Both arguments must be VFS-relative paths with no leading slash.
 */
export function isPathAtOrUnder(candidate: string, base: string): boolean {
  if (candidate === base) return true;
  return candidate.startsWith(`${base}/`);
}

/**
 * Rewrite a path that lives at or under `oldBase` so it lives at or under
 * `newBase` instead. Returns the rewritten path, or null if `path` is not
 * affected by the rename.
 */
export function rewritePath(path: string, oldBase: string, newBase: string): string | null {
  if (path === oldBase) return newBase;
  if (path.startsWith(`${oldBase}/`)) {
    return `${newBase}${path.slice(oldBase.length)}`;
  }
  return null;
}

/** Extract the base name (last path segment) from a VFS-relative path. */
function baseName(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx >= 0 ? path.slice(idx + 1) : path;
}

// ---------------------------------------------------------------------------
// Rename / move
// ---------------------------------------------------------------------------

export interface ApplyTabRenameResult {
  /** The new tabs array (referentially new only if something changed). */
  tabs: TabState[];
  /** Whether any tab descriptor was updated. */
  changed: boolean;
}

/**
 * Update every editor tab whose file path is at or under `oldPath` so it now
 * references `newPath`, preserving content/dirty state. Handles both single
 * file renames and directory renames/moves (which fan out to nested files).
 *
 * The tab's `fileType` is recomputed from the new name so an extension change
 * (e.g. ".mdi" → ".md") is reflected. Content is never touched.
 */
export function applyTabRename(
  tabs: TabState[],
  oldPath: string,
  newPath: string,
): ApplyTabRenameResult {
  if (oldPath === newPath) return { tabs, changed: false };

  let changed = false;
  const next = tabs.map((tab): TabState => {
    if (!isEditorTab(tab) || !tab.file?.path) return tab;
    const rewritten = rewritePath(tab.file.path, oldPath, newPath);
    if (rewritten === null) return tab;
    changed = true;
    const newName = baseName(rewritten);
    const updated: EditorTabState = {
      ...tab,
      file: { ...tab.file, path: rewritten, name: newName },
      fileType: inferFileType(newName),
    };
    return updated;
  });

  return changed ? { tabs: next, changed } : { tabs, changed: false };
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

/** Information about an open tab affected by a delete, for confirmation UIs. */
export interface AffectedTab {
  id: string;
  /** VFS-relative path of the affected tab. */
  path: string;
  /** Display name. */
  name: string;
  /** Whether the tab has unsaved edits (needs explicit confirmation). */
  isDirty: boolean;
}

/**
 * List the open editor tabs whose file path is at or under `deletedPath`.
 * Callers use this to drive a save/discard/cancel confirmation before the
 * actual VFS deletion, and to know which tabs to detach afterwards.
 */
export function findTabsUnderPath(tabs: TabState[], deletedPath: string): AffectedTab[] {
  const result: AffectedTab[] = [];
  for (const tab of tabs) {
    if (!isEditorTab(tab) || !tab.file?.path) continue;
    if (!isPathAtOrUnder(tab.file.path, deletedPath)) continue;
    result.push({
      id: tab.id,
      path: tab.file.path,
      name: tab.file.name,
      isDirty: tab.isDirty,
    });
  }
  return result;
}

export interface ApplyTabDeleteResult {
  tabs: TabState[];
  changed: boolean;
}

/**
 * Detach the file descriptor of every editor tab at or under `deletedPath`.
 *
 * After detachment `tab.file` is null, so:
 *   - the save executor's project-VFS branch (`isProject && tab.file?.path`)
 *     is skipped — no implicit recreation of the deleted path;
 *   - background auto-save skips the tab (`!tab.file` guard);
 *   - the file watcher for the tab is torn down (path gone).
 *
 * The tab itself stays open as an untitled buffer so the user does not lose
 * unsaved content; it is marked dirty so the content is recognized as unsaved.
 * The associated watcher is removed by the watch-integration effect because the
 * path no longer exists on the tab.
 */
export function applyTabDelete(tabs: TabState[], deletedPath: string): ApplyTabDeleteResult {
  let changed = false;
  const next = tabs.map((tab): TabState => {
    if (!isEditorTab(tab) || !tab.file?.path) return tab;
    if (!isPathAtOrUnder(tab.file.path, deletedPath)) return tab;
    changed = true;
    const detached: EditorTabState = {
      ...tab,
      // Drop path/handle so no save flow can write back to the deleted
      // location. The user must choose a new save target via Save As.
      file: null,
      // The on-disk file is gone; remaining buffer content is now unsaved.
      isDirty: true,
      fileSyncStatus: "dirty",
      conflictDiskContent: null,
      pendingExternalContent: null,
    };
    return detached;
  });

  return changed ? { tabs: next, changed } : { tabs, changed: false };
}
