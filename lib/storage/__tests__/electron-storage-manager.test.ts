/**
 * Unit tests for runInTransaction and ElectronStorageManager (electron-storage-manager.ts).
 *
 * Regression tests for:
 * - QA finding #1567 (S3): unconditional ROLLBACK masked the original error on BEGIN failure.
 * - Issue #1844 (K-4-2): unguarded JSON.parse in load* methods threw on corrupt DB rows;
 *   corrupt records must be deleted so the failure self-heals on next startup.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

import { runInTransaction, ElectronStorageManager } from "@/lib/storage/electron-storage-manager";

// electron は実行環境に存在しないためモックする（app.getPath は constructor 専用）
vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => "/tmp/illusions-test") },
}));

// -----------------------------------------------------------------------
// Fake better-sqlite3 for ElectronStorageManager unit tests
// -----------------------------------------------------------------------

/**
 * In-memory key → value store used by the fake DB to simulate app_state,
 * editor_buffer, recent_files, and recent_projects tables.
 * Each map entry corresponds to one row by primary key.
 */
type FakeRow = { id?: string; path?: string; data: string; updated_at?: number };
type TableName = "app_state" | "editor_buffer" | "recent_files" | "recent_projects";

function createFakeBetterSqlite3(tables: Partial<Record<TableName, FakeRow[]>> = {}) {
  // Mutable in-memory store (table → rows)
  const store: Record<string, FakeRow[]> = {
    app_state: tables.app_state ?? [],
    editor_buffer: tables.editor_buffer ?? [],
    recent_files: tables.recent_files ?? [],
    recent_projects: tables.recent_projects ?? [],
    kv_store: [],
  };

  /**
   * Returns a minimal Statement-like object for the given SQL.
   * Only the patterns actually exercised by ElectronStorageManager are implemented.
   */
  const prepare = vi.fn((sql: string) => {
    return {
      run: vi.fn((..._args: unknown[]) => {}),
      get: vi.fn((...args: unknown[]): unknown => {
        if (/SELECT data FROM app_state/.test(sql)) {
          return store.app_state[0] ?? undefined;
        }
        if (/SELECT data FROM editor_buffer/.test(sql)) {
          return store.editor_buffer[0] ?? undefined;
        }
        if (/DELETE FROM app_state/.test(sql)) {
          store.app_state = [];
          return undefined;
        }
        if (/DELETE FROM editor_buffer/.test(sql)) {
          store.editor_buffer = [];
          return undefined;
        }
        return undefined;
      }),
      all: vi.fn((..._args: unknown[]): unknown[] => {
        if (/SELECT.*FROM recent_files/.test(sql)) {
          return store.recent_files;
        }
        if (/SELECT.*FROM recent_projects/.test(sql)) {
          return store.recent_projects;
        }
        return [];
      }),
    };
  });

  // Intercept DELETE statements issued via prepare(...).run(id)
  // by delegating back into the store inside the run() of each prepared stmt.
  // We rebuild prepare so run() has access to sql via closure.
  const prepareReal = (sql: string) => {
    const stmt = {
      run: vi.fn((...args: unknown[]): void => {
        if (/DELETE FROM app_state/.test(sql)) {
          store.app_state = [];
        } else if (/DELETE FROM editor_buffer/.test(sql)) {
          store.editor_buffer = [];
        } else if (/DELETE FROM recent_files WHERE id/.test(sql)) {
          const id = args[0] as string;
          store.recent_files = store.recent_files.filter((r) => r.id !== id);
        } else if (/DELETE FROM recent_projects WHERE id/.test(sql)) {
          const id = args[0] as string;
          store.recent_projects = store.recent_projects.filter((r) => r.id !== id);
        }
      }),
      get: vi.fn((..._args: unknown[]): unknown => {
        if (/SELECT data FROM app_state/.test(sql)) {
          return store.app_state[0] ?? undefined;
        }
        if (/SELECT data FROM editor_buffer/.test(sql)) {
          return store.editor_buffer[0] ?? undefined;
        }
        return undefined;
      }),
      all: vi.fn((..._args: unknown[]): unknown[] => {
        if (/SELECT.*FROM recent_files/.test(sql)) {
          return store.recent_files;
        }
        if (/SELECT.*FROM recent_projects/.test(sql)) {
          return store.recent_projects;
        }
        return [];
      }),
    };
    return stmt;
  };

  const fakeDb = {
    store,
    prepare: vi.fn((sql: string) => prepareReal(sql)),
    exec: vi.fn((_sql: string): void => {}),
    pragma: vi.fn((_s: string): void => {}),
    close: vi.fn((): void => {}),
  };

  return fakeDb;
}

/**
 * Create an ElectronStorageManager whose internal DB is replaced with fakeDb
 * immediately after construction, bypassing the real better-sqlite3 require.
 */
function createManagerWithFakeDb(fakeDb: ReturnType<typeof createFakeBetterSqlite3>) {
  // Mock better-sqlite3 so ensureInitialized() gets fakeDb on first call
  vi.doMock("better-sqlite3", () => {
    const Ctor = vi.fn(() => fakeDb);
    return { default: Ctor };
  });
  const manager = new ElectronStorageManager();
  // Bypass ensureInitialized by injecting the fakeDb directly
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (manager as any).db = fakeDb;
  return manager;
}

// -----------------------------------------------------------------------
// runInTransaction helpers
// -----------------------------------------------------------------------

/** exec 呼び出しを記録し、指定 SQL でエラーを投げるフェイク DB を作る */
function createFakeDb(failOn: Partial<Record<string, Error>> = {}) {
  const calls: string[] = [];
  return {
    calls,
    exec(sql: string): void {
      calls.push(sql);
      const error = failOn[sql];
      if (error) throw error;
    },
  };
}

describe("runInTransaction", () => {
  it("BEGIN → fn → COMMIT の順で実行し結果を返す", () => {
    const db = createFakeDb();
    const fn = vi.fn(() => "result");

    const result = runInTransaction(db, fn);

    expect(result).toBe("result");
    expect(db.calls).toEqual(["BEGIN TRANSACTION", "COMMIT"]);
    expect(fn).toHaveBeenCalledOnce();
  });

  it("fn が失敗したら ROLLBACK して元のエラーを再送出する", () => {
    const db = createFakeDb();
    const original = new Error("insert failed");

    expect(() =>
      runInTransaction(db, () => {
        throw original;
      }),
    ).toThrow(original);
    expect(db.calls).toEqual(["BEGIN TRANSACTION", "ROLLBACK"]);
  });

  it("BEGIN が失敗したら ROLLBACK を発行せずに BEGIN のエラーを伝播する", () => {
    const beginError = new Error("database is locked");
    const db = createFakeDb({ "BEGIN TRANSACTION": beginError });
    const fn = vi.fn();

    expect(() => runInTransaction(db, fn)).toThrow(beginError);
    expect(fn).not.toHaveBeenCalled();
    // 未開始のトランザクションへ ROLLBACK を発行しない
    expect(db.calls).toEqual(["BEGIN TRANSACTION"]);
  });

  it("ROLLBACK も失敗した場合、ROLLBACK のエラーではなく元のエラーを再送出する", () => {
    const original = new Error("constraint violation");
    const rollbackError = new Error("cannot rollback - no transaction is active");
    const db = createFakeDb({ ROLLBACK: rollbackError });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      expect(() =>
        runInTransaction(db, () => {
          throw original;
        }),
      ).toThrow(original);
      expect(db.calls).toEqual(["BEGIN TRANSACTION", "ROLLBACK"]);
      // ROLLBACK の失敗はログに残す
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("ROLLBACK"), rollbackError);
    } finally {
      consoleSpy.mockRestore();
    }
  });
});

// -----------------------------------------------------------------------
// ElectronStorageManager — corrupt JSON self-healing (Issue #1844 / K-4-2)
// -----------------------------------------------------------------------

describe("ElectronStorageManager — corrupt JSON recovery", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ---- loadAppState ----

  describe("loadAppState", () => {
    it("returns null and deletes the corrupt app_state row", () => {
      const fakeDb = createFakeBetterSqlite3({
        app_state: [{ id: "app_state", data: "NOT_VALID_JSON{{{", updated_at: 1 }],
      });
      const manager = createManagerWithFakeDb(fakeDb);
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const result = manager.loadAppState();

      expect(result).toBeNull();
      // The corrupt record must have been removed
      expect(fakeDb.store.app_state).toHaveLength(0);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("app_state"),
        expect.any(SyntaxError),
      );

      warnSpy.mockRestore();
    });

    it("returns null when no app_state row exists (no throw)", () => {
      const fakeDb = createFakeBetterSqlite3({ app_state: [] });
      const manager = createManagerWithFakeDb(fakeDb);

      expect(() => manager.loadAppState()).not.toThrow();
      expect(manager.loadAppState()).toBeNull();
    });

    it("a second loadAppState call after corruption succeeds without throwing", () => {
      const fakeDb = createFakeBetterSqlite3({
        app_state: [{ id: "app_state", data: "{CORRUPT}", updated_at: 1 }],
      });
      const manager = createManagerWithFakeDb(fakeDb);
      vi.spyOn(console, "warn").mockImplementation(() => {});

      // First call: corrupt row → null, row deleted
      const first = manager.loadAppState();
      expect(first).toBeNull();
      expect(fakeDb.store.app_state).toHaveLength(0);

      // Second call: no row → null (no throw, no warn)
      const second = manager.loadAppState();
      expect(second).toBeNull();
    });
  });

  // ---- loadEditorBuffer ----

  describe("loadEditorBuffer", () => {
    it("returns null and deletes the corrupt editor_buffer row", () => {
      const fakeDb = createFakeBetterSqlite3({
        editor_buffer: [{ id: "editor_buffer", data: "<<<NOT JSON>>>", updated_at: 1 }],
      });
      const manager = createManagerWithFakeDb(fakeDb);
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const result = manager.loadEditorBuffer();

      expect(result).toBeNull();
      expect(fakeDb.store.editor_buffer).toHaveLength(0);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("editor_buffer"),
        expect.any(SyntaxError),
      );

      warnSpy.mockRestore();
    });
  });

  // ---- getRecentFiles ----

  describe("getRecentFiles", () => {
    it("skips corrupt rows and removes them, returning only valid ones", () => {
      const fakeDb = createFakeBetterSqlite3({
        recent_files: [
          {
            id: "recent_/good.mdi",
            path: "/good.mdi",
            data: JSON.stringify({ path: "/good.mdi", name: "good.mdi", openedAt: 1 }),
            updated_at: 2,
          },
          { id: "recent_/bad.mdi", path: "/bad.mdi", data: "CORRUPT{{{", updated_at: 1 },
        ],
      });
      const manager = createManagerWithFakeDb(fakeDb);
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const results = manager.getRecentFiles();

      // Only the valid row is returned
      expect(results).toHaveLength(1);
      expect((results[0] as { path: string }).path).toBe("/good.mdi");
      // Corrupt row is removed
      expect(fakeDb.store.recent_files).toHaveLength(1);
      expect(fakeDb.store.recent_files[0].id).toBe("recent_/good.mdi");
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("recent_files"),
        expect.any(SyntaxError),
      );

      warnSpy.mockRestore();
    });

    it("returns empty array when all rows are corrupt", () => {
      const fakeDb = createFakeBetterSqlite3({
        recent_files: [
          { id: "recent_/a.mdi", data: "BAD1", updated_at: 1 },
          { id: "recent_/b.mdi", data: "BAD2", updated_at: 2 },
        ],
      });
      const manager = createManagerWithFakeDb(fakeDb);
      vi.spyOn(console, "warn").mockImplementation(() => {});

      const results = manager.getRecentFiles();

      expect(results).toHaveLength(0);
      expect(fakeDb.store.recent_files).toHaveLength(0);
    });
  });

  // ---- getRecentProjects ----

  describe("getRecentProjects", () => {
    it("skips corrupt rows and removes them", () => {
      const fakeDb = createFakeBetterSqlite3({
        recent_projects: [
          {
            id: "proj-good",
            data: JSON.stringify({ id: "proj-good", rootPath: "/good", name: "good" }),
            updated_at: 2,
          },
          { id: "proj-bad", data: "{{NOT_JSON}}", updated_at: 1 },
        ],
      });
      const manager = createManagerWithFakeDb(fakeDb);
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const results = manager.getRecentProjects();

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("proj-good");
      expect(fakeDb.store.recent_projects).toHaveLength(1);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("recent_projects"),
        expect.any(SyntaxError),
      );

      warnSpy.mockRestore();
    });
  });
});
