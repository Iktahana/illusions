"use client";

/**
 * Unified save executor for editor tabs (#1432).
 *
 * Every save flow (manual save, Save As, background auto-save, close-tab
 * save, window-quit save) previously re-implemented the same pipeline:
 * content sanitize → project-VFS vs standalone branching → file-watcher
 * self-write suppression → tab-state update → file-reference persistence →
 * history snapshot. This module owns that pipeline once; the calling hooks
 * (use-file-io / use-auto-save / use-close-dialog /
 * use-electron-menu-bindings) only orchestrate flow-specific concerns
 * (guards, notifications, retry/abort decisions).
 *
 * The executor also owns save-lock acquisition (#1579): every flow goes
 * through the same per-target lock, and targets without a path (web
 * File System Access handles, untitled tabs) get a stable non-path key so
 * they are serialized too.
 */

import { saveMdiFile } from "../project/mdi-file";
import { getProjectFileService } from "../services/project-file-service";
import { suppressFileWatch } from "../services/file-watcher";
import { acquireSaveLock, releaseSaveLock } from "./save-lock";
import { isEditorTab } from "./tab-types";
import { sanitizeMdiContent } from "./types";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { MdiFileDescriptor } from "../project/mdi-file";
import type { SnapshotType } from "../services/history-policy";
import type { EditorTabState, TabState } from "./tab-types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Signature of the snapshot creator provided by use-file-io. */
export type TryCreateSnapshotFn = (
  type: SnapshotType,
  sourcePath: string,
  displayName: string,
  savedContent: string,
) => Promise<void>;

/** Result of a save attempt. Callers map these to flow-specific behavior. */
export type SaveOutcome =
  /** Write completed. `persistFailed` is true if file-reference persistence failed. */
  | {
      status: "saved";
      descriptor: MdiFileDescriptor | null;
      savedContent: string;
      persistFailed: boolean;
    }
  /** User cancelled the Save As dialog. */
  | { status: "cancelled" }
  /** Another save for the same target is already in flight. */
  | { status: "locked" }
  /** The tab has an unresolved external conflict; nothing was written. */
  | { status: "conflicted" }
  /** The tab no longer exists; nothing was written. */
  | { status: "skipped" }
  /** The write (or dialog) threw. Caller decides how to notify. */
  | { status: "failed"; error: unknown };

export interface ExecuteTabSaveParams {
  /** Snapshot of the tab to save (content captured at call time). */
  tab: EditorTabState;
  /** Whether project mode (VFS write path) is active. */
  isProject: boolean;
  /** Live tabs ref, used for the pre-write conflict re-check (#1562 b). */
  tabsRef: MutableRefObject<TabState[]>;
  /** React state setter for tabs. */
  setTabs: Dispatch<SetStateAction<TabState[]>>;
  /** Snapshot creator (use-file-io.tryCreateSnapshot). */
  tryCreateSnapshot: TryCreateSnapshotFn;
  /** Snapshot type for this flow. Omit to skip snapshot creation entirely. */
  snapshotType?: SnapshotType;
  /**
   * Snapshot source-path handling when the saved descriptor has no path:
   * - "skip" (default): no snapshot (manual save / Save As / auto-save flows)
   * - "name": fall back to the descriptor name (pre-close flows)
   */
  snapshotPathFallback?: "name" | "skip";
  /** Strip path/handle so the save dialog is always shown (Save As). */
  forceDialog?: boolean;
  /**
   * Update tab state (lastSavedContent / isDirty / fileSyncStatus /
   * lastSavedTime / isSaving) after the save. Default true. The window-quit
   * flow passes false for already-titled tabs to match its pre-refactor
   * behavior (the window is about to close).
   */
  updateTabState?: boolean;
  /** Mark lastSaveWasAuto on the saved tab. Default false. */
  isAutoSave?: boolean;
  /** Also bump project.json lastModified after a VFS write. Default false. */
  updateProjectMetadata?: boolean;
  /**
   * Re-check the latest fileSyncStatus right before writing and abort if the
   * tab became conflicted (#1562 b). Default true. Save As passes false: it
   * writes to a *new* target, so a conflict on the original file is moot.
   */
  recheckConflict?: boolean;
  /**
   * Persist the file reference (last-opened path / web file handle) after a
   * successful standalone save. Only the use-file-io flows provide this.
   */
  persistFileReference?: (descriptor: MdiFileDescriptor, content: string) => Promise<boolean>;
  /** Guard for setState/snapshot after unmount (background auto-save). */
  isMounted?: () => boolean;
}

// ---------------------------------------------------------------------------
// Lock key
// ---------------------------------------------------------------------------

/** Stable identity keys for path-less file handles (web FSA saves, #1579). */
const handleLockKeys = new WeakMap<object, string>();
let handleLockKeyCounter = 0;

/**
 * Compute the save-lock key for a tab.
 *
 * - Path-based files lock on the raw path (shared across tabs/flows).
 * - Path-less handle-based files (web) lock on the handle identity, so two
 *   tabs holding the same handle still serialize (#1579).
 * - Untitled tabs (and Save As, which targets a new file) lock on the tab id.
 */
/**
 * Known limitation (#1579 / Codex review): the null-path lock is keyed by
 * FileSystemFileHandle OBJECT identity. If the platform hands the app two
 * distinct handle objects for the same underlying file (e.g. the same file
 * picked twice in the web picker), their saves do not serialize against each
 * other. Detecting that case requires the async isSameEntry() API, which a
 * synchronous lock acquisition cannot await — and two tabs editing the same
 * file is already a last-writer-wins conflict scenario that locking cannot
 * resolve. Pre-#1579 these saves had no lock at all, so this is strictly an
 * improvement.
 */
export function getSaveLockKey(tab: EditorTabState, options?: { forceDialog?: boolean }): string {
  if (!options?.forceDialog) {
    if (tab.file?.path) return tab.file.path;
    if (tab.file?.handle) {
      let key = handleLockKeys.get(tab.file.handle);
      if (!key) {
        key = `handle:${++handleLockKeyCounter}`;
        handleLockKeys.set(tab.file.handle, key);
      }
      return key;
    }
  }
  return `tab:${tab.id}`;
}

// ---------------------------------------------------------------------------
// Executor
// ---------------------------------------------------------------------------

/**
 * Execute a save for a single editor tab.
 *
 * Owns the shared pipeline: lock acquisition, conflict re-check, sanitize,
 * project-VFS vs standalone branching, self-watch suppression, tab-state
 * update, file-reference persistence, and snapshot creation.
 *
 * Never throws and never shows notifications — flow-specific UI (error
 * toasts, abort decisions) stays in the calling hooks.
 */
export async function executeTabSave(params: ExecuteTabSaveParams): Promise<SaveOutcome> {
  const {
    tab,
    isProject,
    tabsRef,
    setTabs,
    tryCreateSnapshot,
    snapshotType,
    snapshotPathFallback = "skip",
    forceDialog = false,
    updateTabState = true,
    isAutoSave = false,
    updateProjectMetadata = false,
    recheckConflict = true,
    persistFileReference,
    isMounted = () => true,
  } = params;

  // #1579: every flow acquires the unified lock, including path-less targets.
  // Acquired synchronously (no await before this point) so interval loops and
  // re-entrant calls can never start two writes for the same target.
  const lockKey = getSaveLockKey(tab, { forceDialog });
  if (!acquireSaveLock(lockKey)) return { status: "locked" };

  /** Toggle isSaving on the tab (only when this flow owns tab state). */
  const setIsSaving = (saving: boolean): void => {
    if (!updateTabState || !isMounted()) return;
    setTabs((prev) =>
      prev.map((t) => (t.id === tab.id && isEditorTab(t) ? { ...t, isSaving: saving } : t)),
    );
  };

  try {
    // Fix #1562 (b): re-check the latest sync status right before writing —
    // a file watcher may have flagged a conflict after the caller captured
    // its tab snapshot (buildOnChanged mirrors the conflicted transition
    // into tabsRef synchronously).
    if (recheckConflict) {
      const latest = tabsRef.current.find((t) => t.id === tab.id);
      if (!latest) return { status: "skipped" };
      if (!isEditorTab(latest) || latest.fileSyncStatus === "conflicted") {
        return { status: "conflicted" };
      }
    }

    setIsSaving(true);

    const sanitized = sanitizeMdiContent(tab.content, { fileType: tab.fileType });

    /**
     * Apply the post-save tab state. Uses a functional updater comparing
     * against the *latest* tab content at completion time, not at save-start
     * time: edits made while an async dialog/write was in flight must not be
     * silently marked as saved.
     */
    const applySavedTabState = (descriptor: MdiFileDescriptor | null): void => {
      if (!updateTabState || !isMounted()) return;
      setTabs((prev) =>
        prev.map((t) => {
          if (t.id !== tab.id || !isEditorTab(t)) return t;
          const newIsDirty = sanitizeMdiContent(t.content, { fileType: t.fileType }) !== sanitized;
          return {
            ...t,
            ...(descriptor ? { file: descriptor } : null),
            lastSavedContent: sanitized,
            isDirty: newIsDirty,
            lastSavedTime: Date.now(),
            lastSaveWasAuto: isAutoSave,
            isSaving: false,
            fileSyncStatus: newIsDirty ? "dirty" : "clean",
            conflictDiskContent: null,
          };
        }),
      );
    };

    // --- Project mode: direct VFS write with self-watch suppression --------
    if (!forceDialog && isProject && tab.file?.path) {
      const vfs = getProjectFileService();
      suppressFileWatch(tab.file.path, sanitized);
      await vfs.writeFile(tab.file.path, sanitized);

      if (updateProjectMetadata) {
        // Update project.json lastModified so workspace metadata stays in
        // sync. Mirrors ProjectService.saveProject() for the full save path.
        try {
          const projectJsonPath = ".illusions/project.json";
          const projectJsonText = await vfs.readFile(projectJsonPath);
          const projectJson = JSON.parse(projectJsonText) as Record<string, unknown>;
          projectJson["lastModified"] = Date.now();
          await vfs.writeFile(projectJsonPath, JSON.stringify(projectJson, null, 2));
        } catch {
          // Non-fatal: project.json update failure should not block the save
          console.warn("project.json の lastModified 更新に失敗しました");
        }
      }

      applySavedTabState(null);
      if (snapshotType && isMounted()) {
        await tryCreateSnapshot(snapshotType, tab.file.path, tab.file.name, sanitized);
      }
      return {
        status: "saved",
        descriptor: tab.file,
        savedContent: sanitized,
        persistFailed: false,
      };
    }

    // --- Standalone: saveMdiFile (shows Save As dialog when no target) -----
    const descriptor: MdiFileDescriptor | null = forceDialog
      ? tab.file
        ? { path: null, handle: null, name: tab.file.name }
        : null
      : tab.file;

    const result = await saveMdiFile({ descriptor, content: sanitized, fileType: tab.fileType });
    if (!result) {
      // User cancelled the save dialog
      setIsSaving(false);
      return { status: "cancelled" };
    }

    applySavedTabState(result.descriptor);

    let persistFailed = false;
    if (persistFileReference && isMounted()) {
      persistFailed = !(await persistFileReference(result.descriptor, sanitized));
    }

    if (snapshotType && isMounted()) {
      const sourcePath =
        result.descriptor.path ?? (snapshotPathFallback === "name" ? result.descriptor.name : null);
      if (sourcePath !== null) {
        await tryCreateSnapshot(snapshotType, sourcePath, result.descriptor.name, sanitized);
      }
    }

    return {
      status: "saved",
      descriptor: result.descriptor,
      savedContent: sanitized,
      persistFailed,
    };
  } catch (error) {
    setIsSaving(false);
    return { status: "failed", error };
  } finally {
    releaseSaveLock(lockKey);
  }
}
