/**
 * Electron メインプロセス向けストレージモジュール。
 * better-sqlite3 を使い、同期かつ高性能にDBアクセスする。
 * IPC ハンドラ経由で組み込む前提。
 */

import * as path from "path";
import { app } from "electron";
import type {
  StorageSession,
  AppState,
  RecentFile,
  EditorBuffer,
} from "./storage-types";

// better-sqlite3 用の型定義
interface StatementResult {
  run(...params: unknown[]): void;
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

interface DatabaseInstance {
  prepare(sql: string): StatementResult;
  exec(sql: string): void;
  pragma(pragma: string): void;
  close(): void;
}

interface DatabaseConstructor {
  new (path: string): DatabaseInstance;
}

// optional 依存による問題を避けるための動的 import
let DatabaseModule: DatabaseConstructor | null = null;
try {
  // optional 依存のため動的 require が必要
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  DatabaseModule = require("better-sqlite3") as DatabaseConstructor;
} catch {
  // 環境によっては better-sqlite3 が存在しない
}

export class ElectronStorageManager {
  private db: DatabaseInstance | null = null;
  private dbPath: string;

  constructor() {
    this.dbPath = path.join(app.getPath("userData"), "illusions-storage.db");
  }

  /**
   * DB を初期化し、必要ならテーブルを作成する
   */
  private ensureInitialized(): DatabaseInstance {
    if (this.db) return this.db;

    if (!DatabaseModule) {
      throw new Error("better-sqlite3 モジュールが利用できません");
    }

    this.db = new DatabaseModule(this.dbPath);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this.db!.pragma("journal_mode = WAL");

    // 必要ならテーブルを作成
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this.db!.exec(`
      CREATE TABLE IF NOT EXISTS app_state (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS recent_files (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL UNIQUE,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS editor_buffer (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS recent_projects (
        id TEXT PRIMARY KEY,
        root_path TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.db!;
  }

  /**
   * セッション状態を一括で保存する
   */
  saveSession(session: StorageSession): void {
    const db = this.ensureInitialized();
    const now = Date.now();

    try {
      db.exec("BEGIN TRANSACTION");

      // appState
      const saveAppState = db.prepare(`
        INSERT OR REPLACE INTO app_state (id, data, updated_at)
        VALUES (?, ?, ?)
      `);
      saveAppState.run("app_state", JSON.stringify(session.appState), now);

      // recentFiles
      const deleteRecent = db.prepare("DELETE FROM recent_files");
      deleteRecent.run();

      const insertRecent = db.prepare(`
        INSERT INTO recent_files (id, path, data, updated_at)
        VALUES (?, ?, ?, ?)
      `);
      for (const file of session.recentFiles) {
        insertRecent.run(
          `recent_${file.path}`,
          file.path,
          JSON.stringify(file),
          now
        );
      }

      // editorBuffer
      if (session.editorBuffer) {
        const insertBuffer = db.prepare(`
          INSERT OR REPLACE INTO editor_buffer (id, data, updated_at)
          VALUES (?, ?, ?)
        `);
        insertBuffer.run(
          "editor_buffer",
          JSON.stringify(session.editorBuffer),
          now
        );
      } else {
        const deleteBuffer = db.prepare("DELETE FROM editor_buffer");
        deleteBuffer.run();
      }

      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  /**
   * セッション状態を一括で読み込む
   */
  loadSession(): StorageSession | null {
    this.ensureInitialized();

    try {
      const appState = this.loadAppState();
      const recentFiles = this.getRecentFiles();
      const editorBuffer = this.loadEditorBuffer();

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

  /**
   * アプリ状態を保存する
   */
  saveAppState(appState: AppState): void {
    const db = this.ensureInitialized();
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO app_state (id, data, updated_at)
      VALUES (?, ?, ?)
    `);
    stmt.run("app_state", JSON.stringify(appState), Date.now());
  }

  /**
   * アプリ状態を読み込む
   */
  loadAppState(): AppState | null {
    const db = this.ensureInitialized();
    const stmt = db.prepare("SELECT data FROM app_state WHERE id = ?");
    const row = stmt.get("app_state") as { data: string } | undefined;
    return row ? JSON.parse(row.data) : null;
  }

  /**
   * 最近使ったファイルへ追加する（最大10件）
   */
  addToRecent(file: RecentFile): void {
    const db = this.ensureInitialized();

    try {
      db.exec("BEGIN TRANSACTION");

      // 既存があれば削除
      const deleteStmt = db.prepare("DELETE FROM recent_files WHERE path = ?");
      deleteStmt.run(file.path);

      // 新規追加
      const insertStmt = db.prepare(`
        INSERT INTO recent_files (id, path, data, updated_at)
        VALUES (?, ?, ?, ?)
      `);
      insertStmt.run(
        `recent_${file.path}`,
        file.path,
        JSON.stringify(file),
        Date.now()
      );

      // 10件に丸める
      const countStmt = db.prepare("SELECT COUNT(*) as count FROM recent_files");
      const countResult = countStmt.get() as { count: number };

      if (countResult.count > 10) {
        const trimStmt = db.prepare(`
          DELETE FROM recent_files WHERE id IN (
            SELECT id FROM recent_files
            ORDER BY updated_at ASC
            LIMIT ?
          )
        `);
        trimStmt.run(countResult.count - 10);
      }

      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  /**
   * 最近使ったファイル一覧を取得する
   */
  getRecentFiles(): RecentFile[] {
    const db = this.ensureInitialized();
    const stmt = db.prepare(
      "SELECT data FROM recent_files ORDER BY updated_at DESC LIMIT 10"
    );
    const rows = stmt.all() as { data: string }[];
    return rows.map((row) => JSON.parse(row.data));
  }

  /**
   * 最近使ったファイルから削除する
   */
  removeFromRecent(filePath: string): void {
    const db = this.ensureInitialized();
    const stmt = db.prepare("DELETE FROM recent_files WHERE path = ?");
    stmt.run(filePath);
  }

  /**
   * 最近使ったファイルを全削除する
   */
  clearRecent(): void {
    const db = this.ensureInitialized();
    const stmt = db.prepare("DELETE FROM recent_files");
    stmt.run();
  }

  /**
   * エディタバッファを保存する
   */
  saveEditorBuffer(buffer: EditorBuffer): void {
    const db = this.ensureInitialized();
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO editor_buffer (id, data, updated_at)
      VALUES (?, ?, ?)
    `);
    stmt.run("editor_buffer", JSON.stringify(buffer), Date.now());
  }

  /**
   * エディタバッファを読み込む
   */
  loadEditorBuffer(): EditorBuffer | null {
    const db = this.ensureInitialized();
    const stmt = db.prepare("SELECT data FROM editor_buffer WHERE id = ?");
    const row = stmt.get("editor_buffer") as { data: string } | undefined;
    return row ? JSON.parse(row.data) : null;
  }

  /**
   * エディタバッファを削除する
   */
  clearEditorBuffer(): void {
    const db = this.ensureInitialized();
    const stmt = db.prepare("DELETE FROM editor_buffer");
    stmt.run();
  }

  /**
   * 最近使ったプロジェクトへ追加する（最大10件）
   */
  addRecentProject(project: {
    id: string;
    rootPath: string;
    name: string;
  }): void {
    const db = this.ensureInitialized();

    try {
      db.exec("BEGIN TRANSACTION");

      // Remove existing entry for this root path
      const deleteStmt = db.prepare(
        "DELETE FROM recent_projects WHERE root_path = ?"
      );
      deleteStmt.run(project.rootPath);

      // Insert new entry
      const insertStmt = db.prepare(`
        INSERT INTO recent_projects (id, root_path, name, data, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      insertStmt.run(
        project.id,
        project.rootPath,
        project.name,
        JSON.stringify(project),
        Date.now()
      );

      // Trim to 10 entries
      const countStmt = db.prepare(
        "SELECT COUNT(*) as count FROM recent_projects"
      );
      const countResult = countStmt.get() as { count: number };

      if (countResult.count > 10) {
        const trimStmt = db.prepare(`
          DELETE FROM recent_projects WHERE id IN (
            SELECT id FROM recent_projects
            ORDER BY updated_at ASC
            LIMIT ?
          )
        `);
        trimStmt.run(countResult.count - 10);
      }

      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  /**
   * 最近使ったプロジェクト一覧を取得する
   */
  getRecentProjects(): Array<{
    id: string;
    rootPath: string;
    name: string;
  }> {
    const db = this.ensureInitialized();
    const stmt = db.prepare(
      "SELECT data FROM recent_projects ORDER BY updated_at DESC LIMIT 10"
    );
    const rows = stmt.all() as { data: string }[];
    return rows.map((row) => JSON.parse(row.data));
  }

  /**
   * 最近使ったプロジェクトから削除する
   */
  removeRecentProject(projectId: string): void {
    const db = this.ensureInitialized();
    const stmt = db.prepare("DELETE FROM recent_projects WHERE id = ?");
    stmt.run(projectId);
  }

  /**
   * すべてのデータを削除する
   */
  clearAll(): void {
    const db = this.ensureInitialized();
    db.exec(`
      DELETE FROM app_state;
      DELETE FROM recent_files;
      DELETE FROM editor_buffer;
      DELETE FROM recent_projects;
    `);
  }

  /**
   * DB 接続を閉じる
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

export default ElectronStorageManager;
