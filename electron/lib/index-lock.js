"use strict";
/**
 * Cross-window history index lock (HistoryService) — pure lock manager
 * extracted from electron/ipc/vfs-ipc.js for hardening + testability
 * (#1567 S3).
 *
 * Hardening added on top of the original semantics:
 * - Lock keys are validated (string, non-empty, max length, no control chars).
 * - acquire() has a timeout so a renderer can never hang forever waiting on
 *   a lock held by another window. On timeout a Japanese error is thrown.
 *
 * The lock semantics for valid keys are unchanged: an in-memory registry,
 * atomic because the main-process event loop is single-threaded; each entry
 * maps a lock key to the sender (webContents id) that holds it, with a FIFO
 * queue of waiters per key.
 */

/** Maximum accepted lock key length (characters). */
const INDEX_LOCK_KEY_MAX_LENGTH = 256;

/** Default acquisition timeout (ms) before acquire() fails. */
const INDEX_LOCK_ACQUIRE_TIMEOUT_MS = 10_000;

const CONTROL_CHARS_RE = /[\u0000-\u001F\u007F]/;

/**
 * Validate a renderer-supplied lock key. Throws on invalid input.
 * @param {unknown} key
 * @returns {asserts key is string}
 */
function validateIndexLockKey(key) {
  if (typeof key !== "string" || key.length === 0) {
    throw new Error("ロックキーが不正です: 空でない文字列を指定してください");
  }
  if (key.length > INDEX_LOCK_KEY_MAX_LENGTH) {
    throw new Error(
      `ロックキーが不正です: ${INDEX_LOCK_KEY_MAX_LENGTH} 文字以内で指定してください`,
    );
  }
  if (CONTROL_CHARS_RE.test(key)) {
    throw new Error("ロックキーが不正です: 制御文字は使用できません");
  }
}

/**
 * Create an index lock manager.
 * @param {object} [options]
 * @param {(senderId: number) => boolean} [options.isSenderAlive]
 *   Returns false for waiters whose webContents have been destroyed,
 *   so they are skipped when dequeuing (prevents stuck locks).
 * @param {number} [options.acquireTimeoutMs] Acquisition timeout in ms.
 */
function createIndexLockManager({
  isSenderAlive = () => true,
  acquireTimeoutMs = INDEX_LOCK_ACQUIRE_TIMEOUT_MS,
} = {}) {
  const owners = new Map(); // key -> senderId
  const queues = new Map(); // key -> Array<{ resolve: () => void, senderId: number }>

  /**
   * Dequeue the next waiter for a lock key, if any.
   * Skips waiters whose sender is no longer alive.
   * The dequeued entry's resolve() will set the owner itself.
   * @param {string} key
   */
  function processQueue(key) {
    const queue = queues.get(key) || [];
    while (queue.length > 0 && !owners.has(key)) {
      const next = queue.shift();
      if (queue.length === 0) {
        queues.delete(key);
      }
      // Skip waiters whose webContents have been destroyed
      if (!isSenderAlive(next.senderId)) {
        continue;
      }
      next.resolve();
      return;
    }
    if (queue.length === 0) {
      queues.delete(key);
    }
  }

  /**
   * Acquire the lock for `key` on behalf of `senderId`.
   * Resolves when the lock is held; throws on invalid key or timeout.
   * @param {unknown} key
   * @param {number} senderId
   * @returns {Promise<void>}
   */
  async function acquire(key, senderId) {
    validateIndexLockKey(key);

    if (!owners.has(key)) {
      // Lock is free — acquire immediately
      owners.set(key, senderId);
      return;
    }

    // Lock is held — enqueue this waiter and suspend until released,
    // but never longer than acquireTimeoutMs (fail instead of hanging).
    const acquired = await new Promise((resolve) => {
      const entry = {
        senderId,
        resolve: () => {
          clearTimeout(timer);
          resolve(true);
        },
      };
      const timer = setTimeout(() => {
        // Remove this waiter from the queue so a later release cannot
        // resolve an already-failed acquire.
        const queue = queues.get(key);
        if (queue) {
          const idx = queue.indexOf(entry);
          if (idx !== -1) queue.splice(idx, 1);
          if (queue.length === 0) queues.delete(key);
        }
        resolve(false);
      }, acquireTimeoutMs);
      if (typeof timer.unref === "function") timer.unref();
      const queue = queues.get(key) || [];
      queue.push(entry);
      queues.set(key, queue);
    });

    if (!acquired) {
      throw new Error(
        `インデックスロックの取得がタイムアウトしました（${Math.round(acquireTimeoutMs / 1000)}秒）。他のウィンドウがロックを保持し続けている可能性があります。`,
      );
    }

    // Now the lock is free for us (processQueue verified this before calling resolve)
    owners.set(key, senderId);
  }

  /**
   * Release the lock for `key` if held by `senderId` (no-op otherwise).
   * @param {unknown} key
   * @param {number} senderId
   */
  function release(key, senderId) {
    if (owners.get(key) === senderId) {
      owners.delete(key);
      processQueue(key);
    }
  }

  /**
   * Release all locks held by a sender (called when its window closes).
   * @param {number} senderId
   */
  function releaseAllForSender(senderId) {
    for (const [key, ownerId] of owners) {
      if (ownerId === senderId) {
        owners.delete(key);
        processQueue(key);
      }
    }
  }

  return { acquire, release, releaseAllForSender };
}

module.exports = {
  validateIndexLockKey,
  createIndexLockManager,
  INDEX_LOCK_KEY_MAX_LENGTH,
  INDEX_LOCK_ACQUIRE_TIMEOUT_MS,
};
