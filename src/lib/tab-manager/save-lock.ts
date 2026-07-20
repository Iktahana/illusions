/**
 * Unified per-target save lock (fix #1562, extended for #1579).
 *
 * The active-tab save path (use-file-io) and the background auto-save path
 * (use-auto-save) previously used independent guards that could not see each
 * other. When a background save was still in flight for a tab that became
 * active, the next auto-save interval could start a second concurrent write
 * to the same path, and the stale write could land last — silently dropping
 * newer edits from disk.
 *
 * This module provides a single synchronous guard keyed by save target that
 * all save flows share (via the executor in save-executor.ts). The key is
 * usually the file path; targets without a path (web File System Access
 * handles, untitled tabs) use a stable identity key computed by
 * getSaveLockKey() so they are serialized too (#1579). Locks are acquired
 * synchronously before any async write starts and must be released in a
 * `finally` block.
 */

const savingKeys = new Set<string>();

/**
 * Try to acquire the save lock for a save-target key (usually a file path).
 * Returns false if a save for the same target is already in flight.
 */
export function acquireSaveLock(key: string): boolean {
  if (savingKeys.has(key)) return false;
  savingKeys.add(key);
  return true;
}

/** Release the save lock for a save-target key. */
export function releaseSaveLock(key: string): void {
  savingKeys.delete(key);
}

/** Whether a save is currently in flight for the given target. */
export function isSaveLocked(key: string): boolean {
  return savingKeys.has(key);
}

/** Test-only helper: clear all locks. */
export function clearSaveLocks(): void {
  savingKeys.clear();
}
