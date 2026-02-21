"use client";

import type { MutableRefObject, Dispatch, SetStateAction } from "react";
import type { MdiFileDescriptor } from "../mdi-file";
import type { SupportedFileExtension } from "../project-types";
import type { TabId, TabState } from "../tab-types";
import { getRandomillusionstory } from "../illusion-stories";

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
  closeTab: (tabId: TabId) => void;
  switchTab: (tabId: TabId) => void;
  nextTab: () => void;
  prevTab: () => void;
  switchToIndex: (index: number) => void;
  openProjectFile: (vfsPath: string, options?: { preview?: boolean }) => Promise<void>;
  pinTab: (tabId: TabId) => void;

  // Close-tab unsaved warning flow
  pendingCloseTabId: TabId | null;
  pendingCloseFileName: string;
  handleCloseTabSave: () => Promise<void>;
  handleCloseTabDiscard: () => void;
  handleCloseTabCancel: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const AUTO_SAVE_INTERVAL = 5000;
export const TAB_PERSIST_DEBOUNCE = 1000;
export const DEMO_FILE_NAME = "鏡地獄.mdi";

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
  if (fileName.endsWith(".md")) return ".md";
  if (fileName.endsWith(".txt")) return ".txt";
  return ".mdi";
}

/**
 * Sanitize MDI content before saving.
 * Converts/removes HTML tags that should not appear in .mdi files.
 */
export function sanitizeMdiContent(content: string): string {
  let result = content;
  result = result.replace(/<br\s*\/?>/gi, "\n");
  result = result.replace(/<(\w+)[^>]*>(.*?)<\/\1>/gi, "$2");
  result = result.replace(/<\/?[a-zA-Z][a-zA-Z0-9]*\b[^>]*\/?>/g, "");
  return result;
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
    message =
      "ファイル名またはパスが無効です。使用できない文字が含まれている可能性があります。";
  } else if (errorCode === "ENAMETOOLONG") {
    message = "ファイル名またはパスが長すぎます。";
  }
  return message;
}

export function createNewTab(content?: string, fileType: SupportedFileExtension = ".mdi"): TabState {
  const c = content ?? (fileType === ".mdi" ? getRandomillusionstory() : "");
  return {
    id: generateTabId(),
    file: null,
    content: c,
    lastSavedContent: c,
    isDirty: false,
    lastSavedTime: null,
    isSaving: false,
    isPreview: false,
    fileType,
  };
}

export async function loadDemoContent(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  try {
    const paths = ["demo/鏡地獄.mdi", "/demo/鏡地獄.mdi", "./demo/鏡地獄.mdi"];
    for (const p of paths) {
      try {
        const url = new URL(p, window.location.href);
        const response = await fetch(url.toString());
        if (response.ok) {
          return await response.text();
        }
      } catch {
        continue;
      }
    }
    return null;
  } catch {
    return null;
  }
}
