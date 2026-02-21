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
 * Known HTML tag names that may be injected by the editor (ProseMirror/Milkdown)
 * and should be stripped when saving to .mdi format.
 *
 * Only properly paired tags (e.g. `<div>...</div>`) and void elements
 * (e.g. `<img>`, `<hr>`) are removed. Orphaned non-void tags like a bare
 * `<B>` are left intact so that arbitrary angle-bracket content
 * (e.g. math expressions `A<B>C`) is not silently destroyed.
 */
const PAIRED_HTML_TAGS = [
  "a",
  "abbr",
  "article",
  "aside",
  "b",
  "blockquote",
  "body",
  "caption",
  "cite",
  "code",
  "colgroup",
  "dd",
  "del",
  "details",
  "dfn",
  "div",
  "dl",
  "dt",
  "em",
  "figcaption",
  "figure",
  "footer",
  "h[1-6]",
  "head",
  "header",
  "html",
  "i",
  "iframe",
  "ins",
  "kbd",
  "label",
  "li",
  "main",
  "mark",
  "nav",
  "noscript",
  "ol",
  "p",
  "picture",
  "pre",
  "q",
  "rp",
  "rt",
  "ruby",
  "s",
  "samp",
  "script",
  "section",
  "select",
  "small",
  "span",
  "strong",
  "style",
  "sub",
  "summary",
  "sup",
  "table",
  "tbody",
  "td",
  "template",
  "textarea",
  "tfoot",
  "th",
  "thead",
  "time",
  "title",
  "tr",
  "u",
  "ul",
  "var",
  "video",
] as const;

/**
 * Void HTML elements that are self-closing and cannot have content.
 * These are safe to strip even when not paired, since tag names like
 * `img`, `hr`, `wbr` etc. are unambiguous and won't collide with
 * user-authored angle-bracket content.
 */
const VOID_HTML_TAGS = [
  "area",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
] as const;

/** Regex matching void HTML elements (opening or self-closing form). */
const VOID_TAG_PATTERN = new RegExp(
  `<(${VOID_HTML_TAGS.join("|")})(\\s[^>]*)?\\/?>`,
  "gi",
);

/**
 * Sanitize MDI content before saving.
 * Strips known HTML tags that should not appear in .mdi files,
 * while preserving arbitrary angle-bracket content (e.g. `A<B>C`).
 */
export function sanitizeMdiContent(content: string): string {
  let result = content;
  // Step 1: Convert <br> tags to newlines
  result = result.replace(/<br\s*\/?>/gi, "\n");
  // Step 2: Remove properly paired known HTML tags, keeping inner content.
  // Only matched pairs (e.g. <div>...</div>) are stripped; an orphaned
  // `<B>` without a closing `</B>` is left untouched.
  result = result.replace(
    new RegExp(
      `<(${PAIRED_HTML_TAGS.join("|")})(\\s[^>]*)?>([\\s\\S]*?)<\\/\\1>`,
      "gi",
    ),
    "$3",
  );
  // Step 3: Remove void HTML elements (img, hr, etc.) which are always
  // self-closing and cannot be confused with user content.
  result = result.replace(VOID_TAG_PATTERN, "");
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
