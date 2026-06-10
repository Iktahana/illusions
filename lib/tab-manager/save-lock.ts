/**
 * Unified per-path save lock (fix #1562).
 *
 * The active-tab save path (use-file-io: `isSavingRef`) and the background
 * auto-save path (use-auto-save: `savingTabIdsRef`) previously used
 * independent guards that could not see each other. When a background save
 * was still in flight for a tab that became active, the next auto-save
 * interval could start a second concurrent write to the same path, and the
 * stale write could land last — silently dropping newer edits from disk.
 *
 * This module provides a single synchronous guard keyed by file path that
 * all save paths share. Locks are acquired synchronously before any async
 * write starts and must be released in a `finally` block.
 */

const savingPaths = new Set<string>();

/**
 * Try to acquire the save lock for a file path.
 * Returns false if a save for the same path is already in flight.
 */
export function acquireSaveLock(path: string): boolean {
  if (savingPaths.has(path)) return false;
  savingPaths.add(path);
  return true;
}

/** Release the save lock for a file path. */
export function releaseSaveLock(path: string): void {
  savingPaths.delete(path);
}

/** Whether a save is currently in flight for the given path. */
export function isSaveLocked(path: string): boolean {
  return savingPaths.has(path);
}

/** Test-only helper: clear all locks. */
export function clearSaveLocks(): void {
  savingPaths.clear();
}
