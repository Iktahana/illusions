/**
 * Electron Storage Module for Main Process.
 * Uses better-sqlite3 for synchronous, high-performance database access.
 * Must be integrated into electron/main.ts via IPC handlers.
 */

import * as path from "path";
import { app } from "electron";
import type {
  StorageSession,
  AppState,
  RecentFile,
  EditorBuffer,
} from "./storage-types";

// Type definition for better-sqlite3
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

// Dynamic import to avoid issues with optional dependency
let DatabaseModule: DatabaseConstructor | null = null;
try {
  // Dynamic require is necessary for optional electron dependency
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  DatabaseModule = require("better-sqlite3") as DatabaseConstructor;
} catch {
  // better-sqlite3 may not be available in all environments
}

export class ElectronStorageManager {
  private db: DatabaseInstance | null = null;
  private dbPath: string;

  constructor() {
    this.dbPath = path.join(app.getPath("userData"), "illusions-storage.db");
  }

  /**
   * Initialize the database and create tables if they don't exist.
   */
  private ensureInitialized(): DatabaseInstance {
    if (this.db) return this.db;

    if (!DatabaseModule) {
      throw new Error("better-sqlite3 module is not available");
    }

    this.db = new DatabaseModule(this.dbPath);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this.db!.pragma("journal_mode = WAL");

    // Create tables if they don't exist
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
    `);

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.db!;
  }

  /**
   * Save the complete session state.
   */
  saveSession(session: StorageSession): void {
    const db = this.ensureInitialized();
    const now = Date.now();

    try {
      db.exec("BEGIN TRANSACTION");

      // Save app state
      const saveAppState = db.prepare(`
        INSERT OR REPLACE INTO app_state (id, data, updated_at)
        VALUES (?, ?, ?)
      `);
      saveAppState.run("app_state", JSON.stringify(session.appState), now);

      // Clear and save recent files
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

      // Save editor buffer
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
   * Load the complete session state.
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
      console.error("Failed to load session:", error);
      return null;
    }
  }

  /**
   * Save the application state.
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
   * Load the application state.
   */
  loadAppState(): AppState | null {
    const db = this.ensureInitialized();
    const stmt = db.prepare("SELECT data FROM app_state WHERE id = ?");
    const row = stmt.get("app_state") as { data: string } | undefined;
    return row ? JSON.parse(row.data) : null;
  }

  /**
   * Add a file to recent files (max 10).
   */
  addToRecent(file: RecentFile): void {
    const db = this.ensureInitialized();

    try {
      db.exec("BEGIN TRANSACTION");

      // Remove if already exists
      const deleteStmt = db.prepare("DELETE FROM recent_files WHERE path = ?");
      deleteStmt.run(file.path);

      // Insert new entry
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

      // Trim to 10 most recent
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
   * Get all recent files.
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
   * Remove a file from recent files.
   */
  removeFromRecent(filePath: string): void {
    const db = this.ensureInitialized();
    const stmt = db.prepare("DELETE FROM recent_files WHERE path = ?");
    stmt.run(filePath);
  }

  /**
   * Clear all recent files.
   */
  clearRecent(): void {
    const db = this.ensureInitialized();
    const stmt = db.prepare("DELETE FROM recent_files");
    stmt.run();
  }

  /**
   * Save editor buffer.
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
   * Load editor buffer.
   */
  loadEditorBuffer(): EditorBuffer | null {
    const db = this.ensureInitialized();
    const stmt = db.prepare("SELECT data FROM editor_buffer WHERE id = ?");
    const row = stmt.get("editor_buffer") as { data: string } | undefined;
    return row ? JSON.parse(row.data) : null;
  }

  /**
   * Clear editor buffer.
   */
  clearEditorBuffer(): void {
    const db = this.ensureInitialized();
    const stmt = db.prepare("DELETE FROM editor_buffer");
    stmt.run();
  }

  /**
   * Clear all data.
   */
  clearAll(): void {
    const db = this.ensureInitialized();
    db.exec(`
      DELETE FROM app_state;
      DELETE FROM recent_files;
      DELETE FROM editor_buffer;
    `);
  }

  /**
   * Close the database connection.
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

export default ElectronStorageManager;
