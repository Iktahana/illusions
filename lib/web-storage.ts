"use client";

/**
 * Dexie（IndexedDB）を使った Web ストレージ実装。
 * ブラウザ環境/PWA 向け。
 */

import Dexie, { type Table } from "dexie";
import type {
  IStorageService,
  StorageSession,
  AppState,
  RecentFile,
  EditorBuffer,
} from "./storage-types";

interface StoredAppState {
  id: string;
  data: AppState;
}

interface StoredRecentFile {
  id: string;
  path: string;
  data: RecentFile;
}

interface StoredEditorBuffer {
  id: string;
  data: EditorBuffer;
  fileHandle?: FileSystemFileHandle; // シリアライズ性のため、ハンドルは別フィールドで保持
}

/**
 * Stored project handle for directory-based project persistence.
 * FileSystemDirectoryHandle is stored via Structured Clone Algorithm in IndexedDB.
 * プロジェクトの FileSystemDirectoryHandle を IndexedDB に永続化するための型。
 */
export interface StoredProjectHandle {
  projectId: string;
  rootHandle: FileSystemDirectoryHandle;
  lastAccessedAt: number;
  permissionState: "granted" | "denied" | "prompt";
  /** User-visible project name (from project.json) */
  name?: string;
  /** Root directory name (from FileSystemDirectoryHandle.name) */
  rootDirName?: string;
}

class WebStorageDatabase extends Dexie {
  appState!: Table<StoredAppState, string>;
  recentFiles!: Table<StoredRecentFile, string>;
  editorBuffer!: Table<StoredEditorBuffer, string>;
  projectHandles!: Table<StoredProjectHandle, string>;

  constructor() {
    super("IllusionsStorage");

    // v1: Initial schema
    this.version(1).stores({
      appState: "id",
      recentFiles: "id, path",
      editorBuffer: "id",
    });

    // v2: Add projectHandles table for directory handle persistence
    this.version(2).stores({
      appState: "id",
      recentFiles: "id, path",
      editorBuffer: "id",
      projectHandles: "projectId, lastAccessedAt",
    });
  }
}

/**
 * Shared database instance for use by ProjectManager and other modules.
 * WebStorageProvider 以外のモジュール（ProjectManager 等）からも DB にアクセスするための共有インスタンス。
 */
let sharedDbInstance: WebStorageDatabase | null = null;

/**
 * Get the shared WebStorageDatabase instance.
 * Creates a new instance if one doesn't exist yet.
 */
export function getWebStorageDatabase(): WebStorageDatabase {
  if (!sharedDbInstance) {
    sharedDbInstance = new WebStorageDatabase();
  }
  return sharedDbInstance;
}

export class WebStorageProvider implements IStorageService {
  private db: WebStorageDatabase;
  private initialized = false;

  constructor() {
    this.db = getWebStorageDatabase();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    try {
      // DB 接続確認
      await this.db.open();
      this.initialized = true;
    } catch (error) {
      console.error("WebStorageProvider の初期化に失敗しました:", error);
      throw error;
    }
  }

  async saveSession(session: StorageSession): Promise<void> {
    await this.initialize();

    try {
      // すべてを並列で保存
      await Promise.all([
        this.saveAppState(session.appState),
        this.saveRecentFiles(session.recentFiles),
        session.editorBuffer
          ? this.saveEditorBuffer(session.editorBuffer)
          : this.clearEditorBuffer(),
      ]);
    } catch (error) {
      console.error("セッションの保存に失敗しました:", error);
      throw error;
    }
  }

  async loadSession(): Promise<StorageSession | null> {
    await this.initialize();

    try {
      const [appState, recentFiles, editorBuffer] = await Promise.all([
        this.loadAppState(),
        this.getRecentFiles(),
        this.loadEditorBuffer(),
      ]);

      // 何も保存されていない場合は null
      if (!appState && recentFiles.length === 0 && !editorBuffer) {
        return null;
      }

      return {
        appState: appState || {},
        recentFiles,
        editorBuffer,
      };
    } catch (error) {
      console.error("セッションの読み込みに失敗しました:", error);
      return null;
    }
  }

  async saveAppState(appState: AppState): Promise<void> {
    await this.initialize();

    try {
      await this.db.appState.put({
        id: "app_state",
        data: appState,
      });
    } catch (error) {
      console.error("アプリ状態の保存に失敗しました:", error);
      throw error;
    }
  }

  async loadAppState(): Promise<AppState | null> {
    await this.initialize();

    try {
      const stored = await this.db.appState.get("app_state");
      return stored?.data ?? null;
    } catch (error) {
      console.error("アプリ状態の読み込みに失敗しました:", error);
      return null;
    }
  }

  async addToRecent(file: RecentFile): Promise<void> {
    await this.initialize();

    try {
      // 既存があれば削除
      await this.db.recentFiles.delete(`recent_${file.path}`);

      // 新規追加
      await this.db.recentFiles.put({
        id: `recent_${file.path}`,
        path: file.path,
        data: file,
      });

      // 全件取得して 10 件に丸める
      const allFiles = await this.db.recentFiles.toArray();
      if (allFiles.length > 10) {
        // 新しい順に並べ、古いものを削除
        const sorted = allFiles.sort(
          (a, b) => b.data.lastModified - a.data.lastModified
        );
        const toDelete = sorted.slice(10);
        await this.db.recentFiles.bulkDelete(toDelete.map((f) => f.id));
      }
    } catch (error) {
      console.error("最近使ったファイルへの追加に失敗しました:", error);
      throw error;
    }
  }

  private async saveRecentFiles(files: RecentFile[]): Promise<void> {
    await this.initialize();

    try {
      // 既存の一覧をクリア
      await this.db.recentFiles.clear();

      // 追加
      const records = files.map((file) => ({
        id: `recent_${file.path}`,
        path: file.path,
        data: file,
      }));

      await this.db.recentFiles.bulkPut(records);
    } catch (error) {
      console.error("最近使ったファイルの保存に失敗しました:", error);
      throw error;
    }
  }

  async getRecentFiles(): Promise<RecentFile[]> {
    await this.initialize();

    try {
      const allFiles = await this.db.recentFiles.toArray();
      return allFiles
        .sort((a, b) => b.data.lastModified - a.data.lastModified)
        .slice(0, 10)
        .map((f) => f.data);
    } catch (error) {
      console.error("最近使ったファイルの取得に失敗しました:", error);
      return [];
    }
  }

  async removeFromRecent(path: string): Promise<void> {
    await this.initialize();

    try {
      await this.db.recentFiles.delete(`recent_${path}`);
    } catch (error) {
      console.error("最近使ったファイルからの削除に失敗しました:", error);
      throw error;
    }
  }

  async clearRecent(): Promise<void> {
    await this.initialize();

    try {
      await this.db.recentFiles.clear();
    } catch (error) {
      console.error("最近使ったファイルの全削除に失敗しました:", error);
      throw error;
    }
  }

  async saveEditorBuffer(buffer: EditorBuffer): Promise<void> {
    await this.initialize();

    try {
      await this.db.editorBuffer.put({
        id: "editor_buffer",
        data: buffer,
        fileHandle: buffer.fileHandle,
      });
    } catch (error) {
      console.error("エディタバッファの保存に失敗しました:", error);
      throw error;
    }
  }

  async loadEditorBuffer(): Promise<EditorBuffer | null> {
    await this.initialize();

    try {
      const stored = await this.db.editorBuffer.get("editor_buffer");
      if (!stored?.data) return null;
      
      // fileHandle があれば復元する
      if (stored.fileHandle) {
        stored.data.fileHandle = stored.fileHandle;
      }
      
      return stored.data;
    } catch (error) {
      console.error("エディタバッファの読み込みに失敗しました:", error);
      return null;
    }
  }

  async clearEditorBuffer(): Promise<void> {
    await this.initialize();

    try {
      await this.db.editorBuffer.delete("editor_buffer");
    } catch (error) {
      console.error("エディタバッファの削除に失敗しました:", error);
      throw error;
    }
  }

  async clearAll(): Promise<void> {
    await this.initialize();

    try {
      await Promise.all([
        this.db.appState.clear(),
        this.db.recentFiles.clear(),
        this.db.editorBuffer.clear(),
        this.db.projectHandles.clear(),
      ]);
    } catch (error) {
      console.error("ストレージの全削除に失敗しました:", error);
      throw error;
    }
  }
}

export default WebStorageProvider;
