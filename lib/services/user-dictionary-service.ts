/**
 * User dictionary service.
 * CRUD operations for .illusions/user-dictionary.json (project mode)
 * and StorageService key-value store (standalone mode).
 *
 * ユーザー辞書の管理サービス。
 * プロジェクトモード: .illusions/user-dictionary.json
 * スタンドアロンモード: StorageService (IndexedDB / SQLite)
 *
 * Persistence (file/storage access, envelope, mutex) is delegated to the
 * shared PersistedJsonListStore; domain semantics (dedupe by id, sort by
 * word) live here.
 */

import { PersistedJsonListStore } from "./persisted-json-list";
import type { UserDictionaryEntry, UserDictionaryFile } from "../project/project-types";

// -----------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------

const USER_DICTIONARY_FILENAME = "user-dictionary.json";
const STANDALONE_STORAGE_PREFIX = "illusions-user-dictionary:";

// -----------------------------------------------------------------------
// Change notification
// -----------------------------------------------------------------------

/**
 * Listeners notified after any successful write to the user dictionary. Lets the
 * lint pipeline (see use-known-terms) re-read the dictionary and refresh
 * 辞書外語 marks the instant the user adds/removes a word — no reload needed.
 */
const changeListeners = new Set<() => void>();

/** Subscribe to user-dictionary writes. Returns an unsubscribe function. */
export function subscribeUserDictionaryChange(listener: () => void): () => void {
  changeListeners.add(listener);
  return () => {
    changeListeners.delete(listener);
  };
}

function notifyUserDictionaryChange(): void {
  for (const listener of changeListeners) {
    try {
      listener();
    } catch (err) {
      console.warn("[user-dictionary] change listener failed:", err);
    }
  }
}

// -----------------------------------------------------------------------
// Domain mutations (identity / dedupe policy)
// -----------------------------------------------------------------------

/** Add an entry, deduplicating by id and keeping the list sorted by word. Returns null when a duplicate id exists (skip save). */
function insertEntry(
  entries: UserDictionaryEntry[],
  entry: UserDictionaryEntry,
): UserDictionaryEntry[] | null {
  const exists = entries.some((e) => e.id === entry.id);
  if (exists) return null;

  entries.push(entry);
  entries.sort((a, b) => a.word.localeCompare(b.word));
  return entries;
}

/** Merge partial updates into the entry matching id. */
function applyUpdate(
  entries: UserDictionaryEntry[],
  id: string,
  updates: Partial<UserDictionaryEntry>,
): UserDictionaryEntry[] {
  return entries.map((e) => (e.id === id ? { ...e, ...updates } : e));
}

/** Remove the entry matching id. */
function removeById(entries: UserDictionaryEntry[], id: string): UserDictionaryEntry[] {
  return entries.filter((e) => e.id !== id);
}

// -----------------------------------------------------------------------
// Service
// -----------------------------------------------------------------------

class UserDictionaryService {
  private readonly store: PersistedJsonListStore<UserDictionaryEntry>;

  constructor() {
    this.store = new PersistedJsonListStore<UserDictionaryEntry>({
      filename: USER_DICTIONARY_FILENAME,
      standaloneKeyPrefix: STANDALONE_STORAGE_PREFIX,
      toEnvelope: (entries): UserDictionaryFile => ({
        version: "1.0.0",
        entries,
      }),
      fromEnvelope: (envelope): UserDictionaryEntry[] =>
        (envelope as UserDictionaryFile).entries ?? [],
    });
  }

  // -------------------------------------------------------------------
  // Project mode (VFS)
  // -------------------------------------------------------------------

  /**
   * Load user dictionary entries from .illusions/user-dictionary.json.
   * Returns empty array if the file does not exist.
   * Re-throws on JSON corruption or permission errors to prevent data loss.
   */
  async loadEntries(): Promise<UserDictionaryEntry[]> {
    return this.store.loadProject();
  }

  /**
   * Save user dictionary entries to .illusions/user-dictionary.json.
   * Creates .illusions directory if it does not exist.
   */
  async saveEntries(entries: UserDictionaryEntry[]): Promise<void> {
    await this.store.saveProject(entries);
    notifyUserDictionaryChange();
  }

  /**
   * Add a new entry. Deduplicates by id.
   * Guarded by the store mutex to prevent concurrent read-modify-write races.
   */
  async addEntry(entry: UserDictionaryEntry): Promise<UserDictionaryEntry[]> {
    const result = await this.store.mutateProject((entries) => insertEntry(entries, entry));
    notifyUserDictionaryChange();
    return result;
  }

  /**
   * Update an existing entry by id.
   * Guarded by the store mutex to prevent concurrent read-modify-write races.
   */
  async updateEntry(
    id: string,
    updates: Partial<UserDictionaryEntry>,
  ): Promise<UserDictionaryEntry[]> {
    const result = await this.store.mutateProject((entries) => applyUpdate(entries, id, updates));
    notifyUserDictionaryChange();
    return result;
  }

  /**
   * Remove an entry by id.
   * Guarded by the store mutex to prevent concurrent read-modify-write races.
   */
  async removeEntry(id: string): Promise<UserDictionaryEntry[]> {
    const result = await this.store.mutateProject((entries) => removeById(entries, id));
    notifyUserDictionaryChange();
    return result;
  }

  // -------------------------------------------------------------------
  // Standalone mode (StorageService key-value store)
  // -------------------------------------------------------------------

  /**
   * Load user dictionary entries from StorageService for a specific file.
   * @param filePath - Full path to the file (used as storage key to avoid basename collisions).
   * Returns empty array if no entry exists; re-throws on JSON corruption or storage errors.
   */
  async loadEntriesStandalone(filePath: string): Promise<UserDictionaryEntry[]> {
    return this.store.loadStandalone(filePath);
  }

  /**
   * Save user dictionary entries to StorageService for a specific file.
   * @param filePath - Full path to the file (used as storage key to avoid basename collisions).
   */
  async saveEntriesStandalone(filePath: string, entries: UserDictionaryEntry[]): Promise<void> {
    await this.store.saveStandalone(filePath, entries);
    notifyUserDictionaryChange();
  }

  /**
   * Add an entry in standalone mode.
   * Guarded by the store mutex to prevent concurrent read-modify-write races.
   */
  async addEntryStandalone(
    fileName: string,
    entry: UserDictionaryEntry,
  ): Promise<UserDictionaryEntry[]> {
    const result = await this.store.mutateStandalone(fileName, (entries) =>
      insertEntry(entries, entry),
    );
    notifyUserDictionaryChange();
    return result;
  }

  /**
   * Update an entry in standalone mode.
   * Guarded by the store mutex to prevent concurrent read-modify-write races.
   */
  async updateEntryStandalone(
    fileName: string,
    id: string,
    updates: Partial<UserDictionaryEntry>,
  ): Promise<UserDictionaryEntry[]> {
    const result = await this.store.mutateStandalone(fileName, (entries) =>
      applyUpdate(entries, id, updates),
    );
    notifyUserDictionaryChange();
    return result;
  }

  /**
   * Remove an entry in standalone mode.
   * Guarded by the store mutex to prevent concurrent read-modify-write races.
   */
  async removeEntryStandalone(fileName: string, id: string): Promise<UserDictionaryEntry[]> {
    const result = await this.store.mutateStandalone(fileName, (entries) =>
      removeById(entries, id),
    );
    notifyUserDictionaryChange();
    return result;
  }
}

// -----------------------------------------------------------------------
// Singleton
// -----------------------------------------------------------------------

let instance: UserDictionaryService | null = null;

export function getUserDictionaryService(): UserDictionaryService {
  if (!instance) {
    instance = new UserDictionaryService();
  }
  return instance;
}
