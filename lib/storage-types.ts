/**
 * ストレージ抽象レイヤの型・インターフェース。
 * Web（IndexedDB）/ Electron（SQLite）を共通のAPIで扱う。
 */

import type { CorrectionModeId, GuidelineId } from "@/lib/linting/correction-config";
import type { Severity } from "@/lib/linting/types";
import type { TabPersistenceState } from "./tab-types";

/**
 * 最近使ったファイルの項目。
 */
export interface RecentFile {
  name: string;
  path: string;
  lastModified: number;
  snippet?: string;
}

/**
 * プロジェクトのメタデータ。
 */
export interface ProjectMetadata {
  id: string;
  name: string;
  type: "local";
  
  // ローカルファイル情報
  localPath?: string;
  fileHandle?: FileSystemFileHandle; // Web only
  
  // プロジェクト統計
  metadata: {
    wordCount: number;
    charCount: number;
    createdAt: number;
    updatedAt: number;
  };
}

/**
 * セッションをまたいで保持したいアプリ状態。
 */
export interface AppState {
  lastOpenedMdiPath?: string;
  hasSeenDemo?: boolean;
  sidebarTab?: "chapters" | "settings" | "style";
  inspectorTab?: "ai" | "corrections" | "stats" | "versions" | "history";

  // エディタ表示設定
  fontScale?: number;
  lineHeight?: number;
  paragraphSpacing?: number;
  textIndent?: number;
  fontFamily?: string;
  charsPerLine?: number;
  autoCharsPerLine?: boolean;
  showParagraphNumbers?: boolean;

  // 品詞着色設定
  posHighlightEnabled?: boolean;
  posHighlightColors?: Record<string, string>;

  // プロジェクト管理
  currentProjectId?: string;
  projects?: ProjectMetadata[];

  // 垂直スクロール設定
  verticalScrollBehavior?: "auto" | "mouse" | "trackpad";
  scrollSensitivity?: number;

  // 自動保存設定
  autoSave?: boolean;

  // コンパクトUIモード
  compactMode?: boolean;

  // リンティング設定
  lintingEnabled?: boolean;
  lintingRuleConfigs?: Record<string, { enabled: boolean; severity: Severity; skipDialogue?: boolean }>;

  // LLM設定
  llmEnabled?: boolean;
  llmModelId?: string;
  llmIdlingStop?: boolean;

  // Character extraction settings
  characterExtractionBatchSize?: number;
  characterExtractionConcurrency?: number;

  // Persisted character data
  characters?: Array<{
    id: string;
    name: string;
    aliases: string[];
    description: string;
    appearance: string;
    personality: string;
    relationships: string;
  }>;

  // 校正モード設定
  correctionMode?: CorrectionModeId;
  correctionGuidelines?: GuidelineId[];

  // 省電力モード
  powerSaveMode?: boolean;
  autoPowerSaveOnBattery?: boolean;
  prePowerSaveState?: {
    lintingEnabled: boolean;
    lintingRuleConfigs: Record<string, { enabled: boolean; severity: Severity }>;
    llmEnabled: boolean;
  } | null;

  // タブの永続化
  openTabs?: TabPersistenceState;
}

/**
 * クラッシュ復旧のための、未保存の下書きバッファ。
 * Web環境では FileSystemFileHandle を保存して自動復元に使う。
 */
export interface EditorBuffer {
  content: string;
  timestamp: number;
  fileHandle?: FileSystemFileHandle; // Webのみ: 前回の編集を継続するためのハンドル
}

/**
 * 永続化するアプリ状態一式。
 */
export interface StorageSession {
  appState: AppState;
  recentFiles: RecentFile[];
  editorBuffer: EditorBuffer | null;
}

/**
 * Recent project entry for project-based storage.
 * Used by Electron (SQLite) to persist recently opened project directories.
 */
export interface RecentProject {
  id: string;
  rootPath: string;
  name: string;
}

/**
 * プラットフォーム差分を吸収するストレージサービスの中核インターフェース。
 * 実装は Web（IndexedDB）/ Electron（SQLite）双方を扱う。
 */
export interface IStorageService {
  /**
   * ストレージサービスを初期化する。
   * ほかの操作の前に必ず呼ぶ。
   */
  initialize(): Promise<void>;

  /**
   * セッション状態をまとめて保存する。
   * appState / recentFiles / editorBuffer を一括で永続化する。
   */
  saveSession(session: StorageSession): Promise<void>;

  /**
   * セッション状態をまとめて読み込む。
   * まだ存在しない場合は null を返す。
   */
  loadSession(): Promise<StorageSession | null>;

  /**
   * アプリ状態を保存する（例: 最後に開いたファイルパス）。
   */
  saveAppState(appState: AppState): Promise<void>;

  /**
   * アプリ状態を読み込む。
   */
  loadAppState(): Promise<AppState | null>;

  /**
   * 最近使ったファイルへ追加する。
   * 既存なら更新して先頭へ移動する。
   * リストは最大10件に保つ。
   */
  addToRecent(file: RecentFile): Promise<void>;

  /**
   * 最近使ったファイル一覧を取得する（最大10件）。
   */
  getRecentFiles(): Promise<RecentFile[]>;

  /**
   * パスを指定して最近使ったファイルから削除する。
   */
  removeFromRecent(path: string): Promise<void>;

  /**
   * 最近使ったファイルを全削除する。
   */
  clearRecent(): Promise<void>;

  /**
   * エディタバッファ（未保存下書き）を保存する。
   */
  saveEditorBuffer(buffer: EditorBuffer): Promise<void>;

  /**
   * エディタバッファを読み込む。
   */
  loadEditorBuffer(): Promise<EditorBuffer | null>;

  /**
   * エディタバッファを削除する。
   */
  clearEditorBuffer(): Promise<void>;

  /**
   * Add a project to the recent projects list.
   * Electron: persists to SQLite. Web: no-op (uses ProjectManager instead).
   */
  addRecentProject(project: RecentProject): Promise<void>;

  /**
   * Get all recent projects.
   * Electron: reads from SQLite. Web: returns empty array (uses ProjectManager instead).
   */
  getRecentProjects(): Promise<RecentProject[]>;

  /**
   * Remove a project from the recent projects list by its ID.
   * Electron: removes from SQLite. Web: no-op (uses ProjectManager instead).
   */
  removeRecentProject(projectId: string): Promise<void>;

  /**
   * すべてのデータを削除する。取り扱い注意。
   */
  clearAll(): Promise<void>;
}

/**
 * Electron環境かどうかを判定する型ガード。
 */
export function isElectronEnvironment(): boolean {
  if (typeof window === "undefined") return false;
  return typeof (window as Window & { electronAPI?: unknown }).electronAPI !== "undefined";
}
