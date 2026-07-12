/**
 * Electron メインプロセス向けストレージモジュール。
 * better-sqlite3 を使い、同期かつ高性能にDBアクセスする。
 * IPC ハンドラ経由で組み込む前提。
 */

import * as path from "path";
import { app } from "electron";
import type { StorageSession, AppState, RecentFile, EditorBuffer } from "./storage-types";

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

function normalizeRecentProjectRootPath(rootPath: string): string {
  const normalized = rootPath.replace(/\\/g, "/").replace(/\/+$/, "").normalize("NFC");
  const isWindowsPath = /^[a-zA-Z]:\//.test(normalized) || normalized.startsWith("//");
  return process.platform === "win32" && isWindowsPath ? normalized.toLowerCase() : normalized;
}

/**
 * トランザクション内で fn を実行するヘルパー。
 *
 * BEGIN が失敗した場合はその場でエラーを伝播させ（未開始のトランザクションへ
 * ROLLBACK を発行しない）、fn / COMMIT が失敗した場合のみ ROLLBACK を試みる。
 * ROLLBACK 自体が失敗しても元のエラーをマスクせず、ログに残して再送出する。
 */
export function runInTransaction<T>(db: Pick<DatabaseInstance, "exec">, fn: () => T): T {
  db.exec("BEGIN TRANSACTION");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch (rollbackError) {
      console.error(
        "[ElectronStorageManager] ROLLBACK に失敗しました（元のエラーを優先して再送出します）:",
        rollbackError,
      );
    }
    throw error;
  }
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

    const db = new DatabaseModule(this.dbPath);
    this.db = db;
    db.pragma("journal_mode = WAL");

    // 必要ならテーブルを作成
    db.exec(`
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

      CREATE TABLE IF NOT EXISTS kv_store (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    return db;
  }

  /**
   * セッション状態を一括で保存する
   */
  saveSession(session: StorageSession): void {
    const db = this.ensureInitialized();
    const now = Date.now();

    runInTransaction(db, () => {
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
        insertRecent.run(`recent_${file.path}`, file.path, JSON.stringify(file), now);
      }

      // editorBuffer
      if (session.editorBuffer) {
        const insertBuffer = db.prepare(`
          INSERT OR REPLACE INTO editor_buffer (id, data, updated_at)
          VALUES (?, ?, ?)
        `);
        insertBuffer.run("editor_buffer", JSON.stringify(session.editorBuffer), now);
      } else {
        const deleteBuffer = db.prepare("DELETE FROM editor_buffer");
        deleteBuffer.run();
      }
    });
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
   * 破損 JSON レコードを削除する前に、生データを corrupt_records へ隔離する
   * （Codex F-06）。特に editor_buffer はクラッシュ回復用の未保存下書きであり、
   * 末尾の余分な 1 文字などで JSON.parse が失敗しても本文は復旧可能なことが多い。
   * 復旧の最後の砦を消さないよう、削除と隔離を同一トランザクションで行う。
   *
   * sourceTable は自コード内のリテラル（app_state / recent_files / editor_buffer /
   * recent_projects）のみを渡す前提（外部入力ではないため SQL 連結は安全）。
   */
  private quarantineAndDelete(sourceTable: string, recordId: string, rawData: string): void {
    const db = this.ensureInitialized();
    try {
      db.exec(
        `CREATE TABLE IF NOT EXISTS corrupt_records (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          source_table TEXT NOT NULL,
          record_id TEXT,
          data TEXT NOT NULL,
          quarantined_at INTEGER NOT NULL
        )`,
      );
      runInTransaction(db, () => {
        db.prepare(
          "INSERT INTO corrupt_records (source_table, record_id, data, quarantined_at) VALUES (?, ?, ?, ?)",
        ).run(sourceTable, recordId, rawData, Date.now());
        db.prepare(`DELETE FROM ${sourceTable} WHERE id = ?`).run(recordId);
      });
    } catch (err) {
      console.error(
        `[ElectronStorageManager] 破損レコードの隔離に失敗しました (${sourceTable}/${recordId}):`,
        err,
      );
    }
  }

  /**
   * アプリ状態を読み込む
   */
  loadAppState(): AppState | null {
    const db = this.ensureInitialized();
    const stmt = db.prepare("SELECT data FROM app_state WHERE id = ?");
    const row = stmt.get("app_state") as { data: string } | undefined;
    if (!row) return null;
    try {
      return JSON.parse(row.data) as AppState;
    } catch (err) {
      // Corrupt app_state record: quarantine then delete so every subsequent
      // startup starts clean without destroying the raw data (Codex F-06).
      // app_state が破損している場合は隔離してから削除しセルフヒールする。
      console.warn(
        "[ElectronStorageManager] app_state の JSON が破損しています。隔離してデフォルト状態に戻します。",
        err,
      );
      this.quarantineAndDelete("app_state", "app_state", row.data);
      return null;
    }
  }

  /**
   * 最近使ったファイルへ追加する（最大10件）
   */
  addToRecent(file: RecentFile): void {
    const db = this.ensureInitialized();

    runInTransaction(db, () => {
      // 既存があれば削除
      const deleteStmt = db.prepare("DELETE FROM recent_files WHERE path = ?");
      deleteStmt.run(file.path);

      // 新規追加
      const insertStmt = db.prepare(`
        INSERT INTO recent_files (id, path, data, updated_at)
        VALUES (?, ?, ?, ?)
      `);
      insertStmt.run(`recent_${file.path}`, file.path, JSON.stringify(file), Date.now());

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
    });
  }

  /**
   * 最近使ったファイル一覧を取得する
   */
  getRecentFiles(): RecentFile[] {
    const db = this.ensureInitialized();
    const stmt = db.prepare("SELECT id, data FROM recent_files ORDER BY updated_at DESC LIMIT 10");
    const rows = stmt.all() as { id: string; data: string }[];
    const results: RecentFile[] = [];
    for (const row of rows) {
      try {
        results.push(JSON.parse(row.data) as RecentFile);
      } catch (err) {
        // Corrupt recent_files row: quarantine then remove (Codex F-06).
        // 破損した recent_files 行を隔離してから削除しセルフヒールする。
        console.warn(
          `[ElectronStorageManager] recent_files(id=${row.id}) の JSON が破損しています。隔離して削除します。`,
          err,
        );
        this.quarantineAndDelete("recent_files", row.id, row.data);
      }
    }
    return results;
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
    if (!row) return null;
    try {
      return JSON.parse(row.data) as EditorBuffer;
    } catch (err) {
      // Corrupt editor_buffer = unsaved crash-recovery draft. Quarantine the raw
      // data BEFORE deleting so a recoverable body isn't destroyed (Codex F-06).
      // editor_buffer はクラッシュ回復用の未保存下書き。本文を失わないよう、削除前に
      // 生データを隔離する。
      console.warn(
        "[ElectronStorageManager] editor_buffer の JSON が破損しています。生データを隔離してから削除します。",
        err,
      );
      this.quarantineAndDelete("editor_buffer", "editor_buffer", row.data);
      return null;
    }
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
  addRecentProject(project: { id: string; rootPath: string; name: string }): void {
    const db = this.ensureInitialized();

    runInTransaction(db, () => {
      const targetRoot = normalizeRecentProjectRootPath(project.rootPath);
      const existingRows = db
        .prepare("SELECT id, root_path, data FROM recent_projects")
        .all() as Array<{ id: string; root_path?: string; data?: string }>;
      const deleteByIdStmt = db.prepare("DELETE FROM recent_projects WHERE id = ?");

      for (const row of existingRows) {
        let existingRoot = row.root_path;
        if (!existingRoot && row.data) {
          try {
            const parsed = JSON.parse(row.data) as { rootPath?: unknown };
            existingRoot = typeof parsed.rootPath === "string" ? parsed.rootPath : undefined;
          } catch {
            // Corrupt rows are handled by getRecentProjects(); ignore them here.
          }
        }
        if (existingRoot && normalizeRecentProjectRootPath(existingRoot) === targetRoot) {
          deleteByIdStmt.run(row.id);
        }
      }

      // Remove existing entries for this root path OR this id to prevent PRIMARY KEY collision
      // when a duplicated project directory shares the same projectId with a different path.
      const deleteStmt = db.prepare("DELETE FROM recent_projects WHERE root_path = ? OR id = ?");
      deleteStmt.run(project.rootPath, project.id);

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
        Date.now(),
      );

      // Trim to 10 entries
      const countStmt = db.prepare("SELECT COUNT(*) as count FROM recent_projects");
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
    });
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
      "SELECT id, data FROM recent_projects ORDER BY updated_at DESC LIMIT 10",
    );
    const rows = stmt.all() as { id: string; data: string }[];
    const results: Array<{ id: string; rootPath: string; name: string }> = [];
    for (const row of rows) {
      try {
        results.push(JSON.parse(row.data) as { id: string; rootPath: string; name: string });
      } catch (err) {
        // Corrupt recent_projects row: quarantine then remove (Codex F-06).
        // 破損した recent_projects 行を隔離してから削除しセルフヒールする。
        console.warn(
          `[ElectronStorageManager] recent_projects(id=${row.id}) の JSON が破損しています。隔離して削除します。`,
          err,
        );
        this.quarantineAndDelete("recent_projects", row.id, row.data);
      }
    }
    return results;
  }

  /**
   * 最近使ったプロジェクトから削除する
   */
  removeRecentProject(projectId: string): void {
    const db = this.ensureInitialized();
    const stmt = db.prepare("DELETE FROM recent_projects WHERE id = ?");
    stmt.run(projectId);
  }

  // -------------------------------------------------------------------
  // Generic key-value store
  // -------------------------------------------------------------------

  setItem(key: string, value: string): void {
    const db = this.ensureInitialized();
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO kv_store (key, value, updated_at)
      VALUES (?, ?, ?)
    `);
    stmt.run(key, value, Date.now());
  }

  getItem(key: string): string | null {
    const db = this.ensureInitialized();
    const stmt = db.prepare("SELECT value FROM kv_store WHERE key = ?");
    const row = stmt.get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  removeItem(key: string): void {
    const db = this.ensureInitialized();
    const stmt = db.prepare("DELETE FROM kv_store WHERE key = ?");
    stmt.run(key);
  }

  /**
   * Return every kv_store key that begins with `prefix`.
   * The LIKE special characters (% _ \) in the prefix are escaped so the
   * match is a true literal prefix; the trailing `%` is the wildcard.
   */
  getKeysByPrefix(prefix: string): string[] {
    const db = this.ensureInitialized();
    const escaped = prefix.replace(/[\\%_]/g, (ch) => `\\${ch}`);
    const stmt = db.prepare("SELECT key FROM kv_store WHERE key LIKE ? ESCAPE '\\'");
    const rows = stmt.all(`${escaped}%`) as { key: string }[];
    return rows.map((r) => r.key);
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
      DELETE FROM kv_store;
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
