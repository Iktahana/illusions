/**
 * Tests for the cross-window history index lock manager (#1567 S3).
 *
 * Covers the hardening added to the vfs:index-lock:acquire IPC handler:
 * - key validation (type, emptiness, length, control characters)
 * - acquisition timeout (a renderer can never hang forever on a held lock)
 * - unchanged FIFO lock semantics for valid keys
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { validateIndexLockKey, createIndexLockManager, INDEX_LOCK_KEY_MAX_LENGTH } =
  require("../../../electron/lib/index-lock") as {
    validateIndexLockKey: (key: unknown) => void;
    createIndexLockManager: (options?: {
      isSenderAlive?: (senderId: number) => boolean;
      acquireTimeoutMs?: number;
    }) => {
      acquire: (key: unknown, senderId: number) => Promise<void>;
      release: (key: unknown, senderId: number) => void;
      releaseAllForSender: (senderId: number) => void;
    };
    INDEX_LOCK_KEY_MAX_LENGTH: number;
  };

// -----------------------------------------------------------------------
// validateIndexLockKey
// -----------------------------------------------------------------------
describe("validateIndexLockKey()", () => {
  it("accepts a typical history index lock key", () => {
    expect(() => validateIndexLockKey("history-index:/Users/me/novel")).not.toThrow();
  });

  it("accepts a key at exactly the max length", () => {
    expect(() => validateIndexLockKey("k".repeat(INDEX_LOCK_KEY_MAX_LENGTH))).not.toThrow();
  });

  it("rejects non-string keys", () => {
    for (const bad of [undefined, null, 42, {}, ["key"], Symbol("k")]) {
      expect(() => validateIndexLockKey(bad)).toThrow(/ロックキーが不正/);
    }
  });

  it("rejects an empty string", () => {
    expect(() => validateIndexLockKey("")).toThrow(/空でない文字列/);
  });

  it("rejects keys longer than the max length", () => {
    expect(() => validateIndexLockKey("k".repeat(INDEX_LOCK_KEY_MAX_LENGTH + 1))).toThrow(
      /文字以内/,
    );
  });

  it("rejects keys containing control characters", () => {
    expect(() => validateIndexLockKey("bad\tkey")).toThrow(/制御文字/);
    expect(() => validateIndexLockKey("bad\nkey")).toThrow(/制御文字/);
    expect(() => validateIndexLockKey("bad\u0000key")).toThrow(/制御文字/);
    expect(() => validateIndexLockKey("bad\u001Bkey")).toThrow(/制御文字/);
    expect(() => validateIndexLockKey("bad\u007Fkey")).toThrow(/制御文字/);
  });

  it("accepts Japanese and path-like characters", () => {
    expect(() => validateIndexLockKey("履歴インデックス:/プロジェクト/小説.mdi")).not.toThrow();
  });
});

// -----------------------------------------------------------------------
// createIndexLockManager — lock semantics (unchanged for valid keys)
// -----------------------------------------------------------------------
describe("createIndexLockManager() — lock semantics", () => {
  it("acquires a free lock immediately", async () => {
    const locks = createIndexLockManager();
    await expect(locks.acquire("key", 1)).resolves.toBeUndefined();
  });

  it("hands the lock to the next waiter on release (FIFO)", async () => {
    const locks = createIndexLockManager({ acquireTimeoutMs: 1000 });
    await locks.acquire("key", 1);

    const order: number[] = [];
    const w2 = locks.acquire("key", 2).then(() => order.push(2));
    const w3 = locks.acquire("key", 3).then(() => order.push(3));

    locks.release("key", 1);
    await w2;
    locks.release("key", 2);
    await w3;
    expect(order).toEqual([2, 3]);
  });

  it("release by a non-owner is a no-op", async () => {
    const locks = createIndexLockManager({ acquireTimeoutMs: 50 });
    await locks.acquire("key", 1);
    locks.release("key", 999); // not the owner
    // Lock still held by 1 — a second acquire must time out
    await expect(locks.acquire("key", 2)).rejects.toThrow(/タイムアウト/);
  });

  it("releaseAllForSender frees every lock held by that sender", async () => {
    const locks = createIndexLockManager({ acquireTimeoutMs: 1000 });
    await locks.acquire("a", 1);
    await locks.acquire("b", 1);
    const wa = locks.acquire("a", 2);
    const wb = locks.acquire("b", 2);
    locks.releaseAllForSender(1);
    await expect(wa).resolves.toBeUndefined();
    await expect(wb).resolves.toBeUndefined();
  });

  it("skips waiters whose sender is no longer alive", async () => {
    const dead = new Set([2]);
    const locks = createIndexLockManager({
      acquireTimeoutMs: 1000,
      isSenderAlive: (id) => !dead.has(id),
    });
    await locks.acquire("key", 1);
    // Waiter 2 dies while waiting; waiter 3 should get the lock
    locks.acquire("key", 2).catch(() => undefined);
    const w3 = locks.acquire("key", 3);
    locks.release("key", 1);
    await expect(w3).resolves.toBeUndefined();
  });

  it("rejects invalid keys without touching the registry", async () => {
    const locks = createIndexLockManager();
    await expect(locks.acquire("", 1)).rejects.toThrow(/ロックキーが不正/);
    await expect(locks.acquire(42, 1)).rejects.toThrow(/ロックキーが不正/);
  });
});

// -----------------------------------------------------------------------
// createIndexLockManager — acquisition timeout (#1567 S3)
// -----------------------------------------------------------------------
describe("createIndexLockManager() — acquisition timeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("times out with a Japanese error when the lock is never released", async () => {
    const locks = createIndexLockManager({ acquireTimeoutMs: 10_000 });
    await locks.acquire("key", 1);

    const waiter = locks.acquire("key", 2);
    const assertion = expect(waiter).rejects.toThrow(/インデックスロックの取得がタイムアウト/);
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
  });

  it("a timed-out waiter is removed from the queue (later release skips it)", async () => {
    const locks = createIndexLockManager({ acquireTimeoutMs: 1000 });
    await locks.acquire("key", 1);

    const timedOut = locks.acquire("key", 2);
    const timedOutAssertion = expect(timedOut).rejects.toThrow(/タイムアウト/);
    await vi.advanceTimersByTimeAsync(1000);
    await timedOutAssertion;

    // Sender 3 enqueues after 2 timed out; release must hand the lock to 3
    const w3 = locks.acquire("key", 3);
    locks.release("key", 1);
    await expect(w3).resolves.toBeUndefined();

    // 3 now owns the lock: 2 must not have stolen it back
    locks.release("key", 2); // no-op — 2 never became owner
    const w4 = locks.acquire("key", 4);
    locks.release("key", 3);
    await expect(w4).resolves.toBeUndefined();
  });

  it("does not time out when the lock is released in time", async () => {
    const locks = createIndexLockManager({ acquireTimeoutMs: 10_000 });
    await locks.acquire("key", 1);
    const waiter = locks.acquire("key", 2);
    await vi.advanceTimersByTimeAsync(5000);
    locks.release("key", 1);
    await expect(waiter).resolves.toBeUndefined();
    // Advancing past the original deadline must not throw anywhere
    await vi.advanceTimersByTimeAsync(10_000);
  });
});
