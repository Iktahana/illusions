"use client";

import type { MutableRefObject, Dispatch, SetStateAction } from "react";
import { MdiDocument } from "@/packages/milkdown-plugin-japanese-novel/mdi-document";
import type { MdiFileDescriptor } from "../project/mdi-file";
import type { SupportedFileExtension, WorkspaceTab } from "../project/project-types";
import type { TabId, TabState, EditorTabState, TerminalTabState } from "./tab-types";
import type { SaveOutcome } from "./save-executor";
import type { AffectedTab } from "./tab-path-sync";

// ---------------------------------------------------------------------------
// Save-all aggregate result (#1859)
// ---------------------------------------------------------------------------

/**
 * Aggregate result of saving every dirty editor tab (#1859).
 *
 * `allSaved` is true only when EVERY dirty tab returned status "saved". Any
 * non-saved outcome (cancelled / failed / conflicted / locked / skipped) makes
 * it false so the project-switch unsaved warning can block the pending action
 * and keep the dialog open — preventing silent data loss.
 */
export interface SaveAllDirtyResult {
  allSaved: boolean;
  outcomes: SaveOutcome[];
}

// ---------------------------------------------------------------------------
// Public return type (must stay identical to the original useTabManager)
// ---------------------------------------------------------------------------

export interface UseTabManagerReturn {
  // Backward-compatible surface (superset of useMdiFile)
  currentFile: MdiFileDescriptor | null;
  content: string;
  setContent: (content: string) => void;
  isDirty: boolean;
  isSaving: boolean;
  lastSavedTime: number | null;
  lastSaveWasAuto: boolean;
  openFile: () => Promise<void>;
  saveFile: (isAutoSave?: boolean) => Promise<void>;
  /**
   * Save every dirty editor tab and report an aggregate result (#1859).
   * `allSaved` is false unless every dirty tab was written, so callers (the
   * project-switch unsaved warning) can block the pending action on cancel/fail.
   */
  saveAllDirtyTabs: () => Promise<SaveAllDirtyResult>;
  saveAsFile: () => Promise<void>;
  newFile: (fileType?: SupportedFileExtension) => void;
  updateFileName: (newName: string) => void;
  wasAutoRecovered?: boolean;
  onSystemFileOpen?: (handler: (path: string, content: string) => void) => void;
  _loadSystemFile: (path: string, content: string) => void;

  // Tab management
  tabs: TabState[];
  activeTabId: TabId;
  newTab: (fileType?: SupportedFileExtension) => void;
  /**
   * Duplicate a source tab's content into a new INDEPENDENT draft tab (#1874).
   * The clone is detached from the source file (untitled) and born dirty so it
   * cannot silently overwrite the original path. See cloneTabState().
   */
  cloneTab: (source: EditorTabState) => void;
  closeTab: (tabId: TabId) => void;
  switchTab: (tabId: TabId) => void;
  nextTab: () => void;
  prevTab: () => void;
  switchToIndex: (index: number) => void;
  openProjectFile: (vfsPath: string, options?: { preview?: boolean }) => Promise<void>;
  pinTab: (tabId: TabId) => void;
  newTerminalTab: (pendingId?: string) => void;
  /** Update mutable fields on a terminal tab (e.g. status, exitCode after PTY exits). */
  updateTerminalTab: (
    tabId: TabId,
    updates: Partial<
      Pick<
        TerminalTabState,
        "sessionId" | "status" | "exitCode" | "label" | "cwd" | "shell" | "pendingId"
      >
    >,
  ) => void;
  openDiffTab: (
    sourceTabId: TabId,
    sourceFileName: string,
    localContent: string,
    remoteContent: string,
    remoteTimestamp: number,
  ) => void;
  /**
   * Force-close a tab without dirty check.
   * Used by diff tab conflict resolution to close tabs programmatically.
   */
  forceCloseTab: (tabId: TabId) => void;
  /**
   * Update a single editor tab by id.
   * Used by diff tab conflict resolution to update source tab content.
   */
  updateTab: (tabId: TabId, updates: Partial<EditorTabState>) => void;
  /**
   * Set content on any tab by id, correctly recomputing isDirty.
   * Unlike updateTab() (shallow merge that skips dirty recomputation),
   * this helper is safe for background/popout content sync.
   */
  setTabContent: (tabId: TabId, newContent: string) => void;

  // Close-tab unsaved warning flow
  pendingCloseTabId: TabId | null;
  pendingCloseFileName: string;
  handleCloseTabSave: () => Promise<void>;
  handleCloseTabDiscard: () => void;
  handleCloseTabCancel: () => void;

  // Persistence flush (for save-before-close)
  /** Immediately flush pending tab state to storage. */
  flushTabState: () => Promise<void>;

  /**
   * Restore tabs from workspace.json data (already loaded during project open).
   * Returns true if any tabs were restored.
   */
  restoreProjectTabs: (
    savedTabs: { tabs: WorkspaceTab[]; activeIndex: number } | undefined,
    rootPath: string | null,
  ) => Promise<boolean>;

  // Explorer file-system mutation sync (#1868, shared with #1870)
  /**
   * Notify the tab manager that a project file/folder was renamed or moved
   * (paths VFS-relative). Atomically rewrites the path/name/fileType of the
   * affected tab and every tab nested under a renamed directory so the next
   * save targets the new path instead of resurrecting the old one.
   */
  notifyFileRenamed: (oldPath: string, newPath: string) => void;
  /**
   * List the open editor tabs at or under the given VFS-relative path. The
   * explorer uses this to confirm dirty tabs before a delete.
   */
  findTabsAffectedByDelete: (deletedPath: string) => AffectedTab[];
  /**
   * Notify the tab manager that a project file/folder was deleted (VFS-relative
   * path). Detaches the descriptor of every affected tab so no save flow can
   * recreate the deleted path; the tab survives as an untitled dirty buffer.
   */
  notifyFileDeleted: (deletedPath: string) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const AUTO_SAVE_INTERVAL = 5000;
export const TAB_PERSIST_DEBOUNCE = 1000;

// ---------------------------------------------------------------------------
// Shared refs / setters passed between sub-hooks
// ---------------------------------------------------------------------------

/** Shared state and setters consumed by sub-hooks. */
export interface TabManagerCore {
  /** The live tabs array (React state). */
  tabs: TabState[];
  /** React state setter for tabs. */
  setTabs: Dispatch<SetStateAction<TabState[]>>;
  /** Active tab id (React state). */
  activeTabId: TabId;
  /** React state setter for active tab id. */
  setActiveTabId: Dispatch<SetStateAction<TabId>>;
  /** Ref that always holds the latest tabs array. */
  tabsRef: MutableRefObject<TabState[]>;
  /** Ref that always holds the latest activeTabId. */
  activeTabIdRef: MutableRefObject<TabId>;
  /** Ref tracking whether the project mode is active. */
  isProjectRef: MutableRefObject<boolean>;
  /** Whether running in Electron renderer process. */
  isElectron: boolean;
}

// ---------------------------------------------------------------------------
// Helpers (pure functions, no hooks)
// ---------------------------------------------------------------------------

let nextTabCounter = 0;

export function generateTabId(): TabId {
  return `tab-${++nextTabCounter}-${Date.now()}`;
}

export function inferFileType(fileName: string): SupportedFileExtension {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".md")) return ".md";
  if (lower.endsWith(".txt")) return ".txt";
  return ".mdi";
}

/**
 * Sanitize MDI content before saving.
 * Strips known HTML tags that should not appear in .mdi files,
 * while preserving arbitrary angle-bracket content (e.g. `A<B>C`).
 *
 * Thin wrapper over the single MDI entry API (issue #1449): the actual
 * normalization (bracket-macro escape recovery, `<br />` → `[[blank]]`,
 * HTML tag stripping) lives in
 * `@/packages/milkdown-plugin-japanese-novel/mdi-document`.
 *
 * @param options.fileType - Serializer-escaped bracket macros (`\[\[blank]]` →
 *   `[[blank]]`) are recovered for ".mdi", ".md", and ".txt" (byte-preservation,
 *   issue #1916). Standalone `<br />` → `[[blank]]` conversion applies to ".mdi"
 *   only. For omitted fileType both steps are skipped.
 */
export function sanitizeMdiContent(
  content: string,
  options?: { fileType?: SupportedFileExtension },
): string {
  return MdiDocument.fromEditorOutput(content, options).toRawText();
}

export function getErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "不明なエラー";
  let message = error.message;
  const errorCode = (error as NodeJS.ErrnoException).code;
  if (errorCode === "EACCES" || errorCode === "EPERM") {
    message =
      "ファイルへのアクセス権限がありません。ファイルが他のプログラムで開かれていないか、または書き込み権限があるかを確認してください。";
  } else if (errorCode === "ENOSPC") {
    message = "ディスクの空き容量が不足しています。";
  } else if (errorCode === "ENOENT") {
    message = "保存先のフォルダが見つかりません。";
  } else if (errorCode === "EINVAL") {
    message = "ファイル名またはパスが無効です。使用できない文字が含まれている可能性があります。";
  } else if (errorCode === "ENAMETOOLONG") {
    message = "ファイル名またはパスが長すぎます。";
  }
  return message;
}

export function createNewTab(
  content?: string,
  fileType: SupportedFileExtension = ".mdi",
): EditorTabState {
  const c = content ?? "";
  return {
    tabKind: "editor",
    id: generateTabId(),
    file: null,
    content: c,
    lastSavedContent: c,
    isDirty: false,
    lastSavedTime: null,
    lastSaveWasAuto: false,
    isSaving: false,
    isPreview: false,
    fileType,
    fileSyncStatus: "clean",
    conflictDiskContent: null,
  };
}

/**
 * Produce a TRUE independent draft clone of an editor tab (issue #1874).
 *
 * Historically cloneTab copied `source.file` so the new tab shared the same
 * file path. That made editor split create two tabs pointing at the SAME file
 * but holding independent buffers, so each pane could silently overwrite the
 * other's edits on save (P0 data loss). It also reported the clone as clean
 * even when the source buffer was dirty.
 *
 * The interim fix detaches the file descriptor (`file = null`) so the clone is
 * an untitled draft that CANNOT save to the original path, and marks it dirty
 * so the unsaved draft is never silently lost. This trades the "second view of
 * the same document" UX for a "duplicate as draft" UX, eliminating the
 * data-loss path. A full single-buffer multi-view refactor is a follow-up.
 *
 * `lastSavedContent` is set to the empty string (the descriptor-less baseline)
 * so the clone is correctly reported dirty as long as it holds any content.
 */
export function cloneTabState(source: EditorTabState): EditorTabState {
  const draft = createNewTab(source.content, source.fileType);
  // Detach from the source document: an untitled draft with no save target.
  draft.file = null;
  // Born dirty so the unsaved draft is never silently discarded.
  draft.isDirty = true;
  draft.lastSavedContent = "";
  return draft;
}
