/**
 * Project and standalone mode type definitions.
 * Defines the two editing modes: project-based (directory) and single-file (standalone).
 *
 * プロジェクトモードとスタンドアロンモードの型定義。
 * ディレクトリベースのプロジェクト管理と、単一ファイル編集の2つのモードを定義する。
 */

/** Supported file extensions for documents */
export type SupportedFileExtension = ".mdi" | ".md" | ".txt";

/**
 * Editor settings shared between project and standalone modes.
 * エディタの表示・動作設定。
 */
export interface EditorSettings {
  fontScale: number;
  lineHeight: number;
  paragraphSpacing: number;
  textIndent: number;
  fontFamily: string;
  charsPerLine: number;
  showParagraphNumbers: boolean;
  mdiExtensionsEnabled: boolean;
  posHighlightEnabled: boolean;
  posHighlightColors: Record<string, string>;
}

/**
 * Project metadata stored in .illusions/project.json.
 * プロジェクトルートの .illusions/project.json に保存される設定。
 */
export interface ProjectConfig {
  version: "1.0.0";
  projectId: string;
  name: string;
  mainFile: string;
  mainFileExtension: SupportedFileExtension;
  createdAt: number;
  lastModified: number;
  author?: string;
  description?: string;
  tags?: string[];
  editorSettings: EditorSettings;
}

/**
 * Workspace state stored in .illusions/workspace.json.
 * エディタのカーソル位置やパネル状態など、作業状態を保持する。
 */
export interface WorkspaceState {
  editorState: {
    cursorPosition: number;
    scrollTop: number;
    selectionStart?: number;
    selectionEnd?: number;
  };
  lastOpenedAt: number;
  viewState: {
    activeView: "chapters" | "settings" | "style";
    inspectorTab: "ai" | "corrections" | "stats" | "history";
    isLeftPanelCollapsed: boolean;
    isRightPanelCollapsed: boolean;
  };
}

/**
 * Project mode: directory-based management with FileSystemDirectoryHandle.
 * プロジェクトモード: ディレクトリ単位で原稿を管理する。
 */
export interface ProjectMode {
  type: "project";
  projectId: string;
  name: string;
  rootHandle: FileSystemDirectoryHandle;
  mainFileHandle: FileSystemFileHandle;
  metadata: ProjectConfig;
  workspaceState: WorkspaceState;
  /** Absolute path to the project root directory (Electron only) */
  rootPath?: string;
}

/**
 * Standalone mode: single file editing with FileSystemFileHandle.
 * スタンドアロンモード: 単一ファイルを直接編集する。
 */
export interface StandaloneMode {
  type: "standalone";
  fileHandle: FileSystemFileHandle | null;
  fileName: string;
  fileExtension: SupportedFileExtension;
  editorSettings: EditorSettings;
}

/** Current editor mode (null when no file/project is open) */
export type EditorMode = ProjectMode | StandaloneMode | null;

/**
 * A single ignored correction entry.
 * 無視された校正指摘の1件分。
 */
export interface IgnoredCorrection {
  /** Lint rule ID (e.g. "homophone-detection") */
  ruleId: string;
  /** The original text that was flagged */
  text: string;
  /** Optional paragraph text hash — when present, only that specific occurrence is ignored */
  context?: string;
  /** Timestamp when the ignore was added */
  addedAt: number;
}

/**
 * File format for .illusions/ignored-corrections.json
 * 無視リストのファイルフォーマット。
 */
export interface IgnoredCorrectionsFile {
  version: "1.0.0";
  ignoredCorrections: IgnoredCorrection[];
}

/**
 * A single user dictionary entry.
 * ユーザー辞書の1件分。
 */
export interface UserDictionaryEntry {
  /** Unique identifier */
  id: string;
  /** Headword (見出し語) */
  word: string;
  /** Reading in kana (読み方) */
  reading?: string;
  /** Part of speech (品詞) — matches PosType values */
  partOfSpeech?: string;
  /** Definition (意味) — optional */
  definition?: string;
  /** Usage examples (用例) */
  examples?: string;
  /** Notes (メモ) */
  notes?: string;
}

/**
 * File format for .illusions/user-dictionary.json
 * ユーザー辞書のファイルフォーマット。
 */
export interface UserDictionaryFile {
  version: "1.0.0";
  entries: UserDictionaryEntry[];
}

/** Type guard for project mode */
export function isProjectMode(mode: EditorMode): mode is ProjectMode {
  return mode?.type === "project";
}

/** Type guard for standalone mode */
export function isStandaloneMode(mode: EditorMode): mode is StandaloneMode {
  return mode?.type === "standalone";
}

/**
 * Returns default editor settings based on file extension.
 * MDI files have MDI extensions enabled by default.
 */
export function getDefaultEditorSettings(
  extension: SupportedFileExtension
): EditorSettings {
  return {
    fontScale: 1.0,
    lineHeight: 1.8,
    paragraphSpacing: 1.0,
    textIndent: 1.0,
    fontFamily: "serif",
    charsPerLine: 40,
    showParagraphNumbers: false,
    mdiExtensionsEnabled: extension === ".mdi",
    posHighlightEnabled: false,
    posHighlightColors: {},
  };
}

/**
 * Returns default workspace state with sensible initial values.
 * デフォルトのワークスペース状態を返す。
 */
export function getDefaultWorkspaceState(): WorkspaceState {
  return {
    editorState: {
      cursorPosition: 0,
      scrollTop: 0,
    },
    lastOpenedAt: Date.now(),
    viewState: {
      activeView: "chapters",
      inspectorTab: "stats",
      isLeftPanelCollapsed: false,
      isRightPanelCollapsed: false,
    },
  };
}
