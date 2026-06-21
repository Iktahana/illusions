"use client";

import type { MutableRefObject, Dispatch, SetStateAction } from "react";
import { MdiDocument } from "@/packages/milkdown-plugin-japanese-novel/mdi-document";
import type { MdiFileDescriptor } from "../project/mdi-file";
import type { SupportedFileExtension, WorkspaceTab } from "../project/project-types";
import type { TabId, TabState, EditorTabState, TerminalTabState } from "./tab-types";

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
  /** Create a new editor tab pre-populated with content and file association from a source tab. */
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
 * @param options.fileType - When ".mdi", standalone `<br />` lines become
 *   `[[blank]]` markers and serializer-escaped bracket macros are recovered.
 *   For all other file types (or when omitted), those steps are skipped.
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
