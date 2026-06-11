/**
 * Unit tests for runInTransaction (electron-storage-manager.ts).
 *
 * Regression tests for QA finding #1567 (S3): an unconditional ROLLBACK in
 * the catch block used to mask the original error when BEGIN (or ROLLBACK
 * itself) failed.
 */

import { describe, it, expect, vi } from "vitest";

import { runInTransaction } from "@/lib/storage/electron-storage-manager";

// electron は実行環境に存在しないためモックする（app.getPath は constructor 専用）
vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => "/tmp/illusions-test") },
}));

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
