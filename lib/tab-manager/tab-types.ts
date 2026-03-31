import type { MdiFileDescriptor } from "../project/mdi-file";
import type { SupportedFileExtension } from "../project/project-types";

/** Unique identifier for a tab */
export type TabId = string;

/** Discriminant literal for each tab variant */
export type TabKind = "editor" | "terminal" | "diff";

// ---------------------------------------------------------------------------
// Editor tab
// ---------------------------------------------------------------------------

/** Sync status between the in-memory content and the on-disk file */
export type FileSyncStatus = "clean" | "dirty" | "staleOnDisk" | "conflicted";

/** Runtime state of a single editor tab */
export interface EditorTabState {
  tabKind: "editor";
  id: TabId;
  file: MdiFileDescriptor | null;
  content: string;
  lastSavedContent: string;
  isDirty: boolean;
  lastSavedTime: number | null;
  /** Whether the most recent save was an auto-save (used to suppress toast). */
  lastSaveWasAuto: boolean;
  isSaving: boolean;
  isPreview: boolean;
  fileType: SupportedFileExtension;
  fileSyncStatus: FileSyncStatus;
  /** Disk content when status is "conflicted"; null otherwise. */
  conflictDiskContent: string | null;
  /**
   * Content from an external file change awaiting application to the editor.
   * Set by file watcher when disk content changes on a clean tab.
   * Consumed by the editor component to update ProseMirror without remounting.
   *
   * 外部ファイル変更による保留中コンテンツ。
   * クリーンタブでディスク変更が検知された際にセットされる。
   * エディタコンポーネントが再マウントなしで ProseMirror を更新するために使用。
   */
  pendingExternalContent?: string | null;
}

// ---------------------------------------------------------------------------
// Terminal tab
// ---------------------------------------------------------------------------

export type TerminalStatus = "connecting" | "running" | "exited" | "error";
export type TerminalSource = "user" | "agent" | "system";

export interface TerminalTabState {
  tabKind: "terminal";
  id: TabId;
  sessionId: string;
  label: string;
  cwd: string;
  shell: string;
  status: TerminalStatus;
  exitCode: number | null;
  createdAt: number;
  source: TerminalSource;
}

// ---------------------------------------------------------------------------
// Diff tab
// ---------------------------------------------------------------------------

export interface DiffTabState {
  tabKind: "diff";
  id: TabId;
  sourceTabId: TabId;
  sourceFileName: string;
  localContent: string;
  remoteContent: string;
  remoteTimestamp: number;
}

// ---------------------------------------------------------------------------
// Union
// ---------------------------------------------------------------------------

/** Discriminated union of all tab variants */
export type TabState = EditorTabState | TerminalTabState | DiffTabState;

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

/** Returns true if the tab is an editor tab */
export function isEditorTab(tab: TabState): tab is EditorTabState {
  return tab.tabKind === "editor";
}

/** Returns true if the tab is a terminal tab */
export function isTerminalTab(tab: TabState): tab is TerminalTabState {
  return tab.tabKind === "terminal";
}

/** Returns true if the tab is a diff tab */
export function isDiffTab(tab: TabState): tab is DiffTabState {
  return tab.tabKind === "diff";
}

// ---------------------------------------------------------------------------
// Serialized / persisted forms (editor tabs only)
// ---------------------------------------------------------------------------

/** Serialized tab for persistence (file path only, no handles) */
export interface SerializedTab {
  filePath: string | null;
  fileName: string;
  isPreview?: boolean;
  fileType?: SupportedFileExtension;
}

/** Persisted state for open tabs (stored in AppState) */
export interface TabPersistenceState {
  tabs: SerializedTab[];
  activeIndex: number;
}
