/**
 * User dictionary service.
 * CRUD operations for .illusions/user-dictionary.json (project mode)
 * and StorageService key-value store (standalone mode).
 *
 * ユーザー辞書の管理サービス。
 * プロジェクトモード: .illusions/user-dictionary.json
 * スタンドアロンモード: StorageService (IndexedDB / SQLite)
 */

import { getVFS } from "../vfs";
import { getStorageService } from "../storage/storage-service";
import { AsyncMutex } from "../utils/async-mutex";
import type { VirtualFileSystem } from "../vfs/types";
import type { IStorageService } from "../storage/storage-types";
import type { UserDictionaryEntry, UserDictionaryFile } from "../project/project-types";

// -----------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------

const USER_DICTIONARY_FILENAME = "user-dictionary.json";
const STANDALONE_STORAGE_PREFIX = "illusions-user-dictionary:";

// -----------------------------------------------------------------------
// Service
// -----------------------------------------------------------------------

class UserDictionaryService {
  private vfs: VirtualFileSystem;
  private storage: IStorageService;
  /** Serializes all read-modify-write operations to prevent last-writer-wins data loss in multi-window scenarios. */
  private readonly writeMutex = new AsyncMutex();

  constructor() {
    this.vfs = getVFS();
    this.storage = getStorageService();
  }

  // -------------------------------------------------------------------
  // Project mode (VFS)
  // -------------------------------------------------------------------

  /**
   * Load user dictionary entries from .illusions/user-dictionary.json.
   * Returns empty array if the file does not exist.
   */
  async loadEntries(): Promise<UserDictionaryEntry[]> {
    try {
      const rootDir = await this.vfs.getDirectoryHandle("");
      const illusionsDir = await rootDir.getDirectoryHandle(".illusions", { create: true });
      const fileHandle = await illusionsDir.getFileHandle(USER_DICTIONARY_FILENAME);
      const raw = await fileHandle.read();
      const data: UserDictionaryFile = JSON.parse(raw);
      return data.entries ?? [];
    } catch {
      // File doesn't exist yet — that's fine
      return [];
    }
  }

  /**
   * Save user dictionary entries to .illusions/user-dictionary.json.
   * Creates .illusions directory if it does not exist.
   */
  async saveEntries(entries: UserDictionaryEntry[]): Promise<void> {
    const rootDir = await this.vfs.getDirectoryHandle("");
    const illusionsDir = await rootDir.getDirectoryHandle(".illusions", { create: true });
    const fileHandle = await illusionsDir.getFileHandle(USER_DICTIONARY_FILENAME, { create: true });
    const data: UserDictionaryFile = {
      version: "1.0.0",
      entries,
    };
    await fileHandle.write(JSON.stringify(data, null, 2));
  }

  /**
   * Add a new entry. Deduplicates by word.
   * Guarded by writeMutex to prevent concurrent read-modify-write races.
   */
  async addEntry(entry: UserDictionaryEntry): Promise<UserDictionaryEntry[]> {
    const releaseLock = await this.writeMutex.acquire();
    try {
      const entries = await this.loadEntries();
      const exists = entries.some((e) => e.id === entry.id);
      if (exists) return entries;

      entries.push(entry);
      entries.sort((a, b) => a.word.localeCompare(b.word));
      await this.saveEntries(entries);
      return entries;
    } finally {
      releaseLock();
    }
  }

  /**
   * Update an existing entry by id.
   * Guarded by writeMutex to prevent concurrent read-modify-write races.
   */
  async updateEntry(
    id: string,
    updates: Partial<UserDictionaryEntry>,
  ): Promise<UserDictionaryEntry[]> {
    const releaseLock = await this.writeMutex.acquire();
    try {
      const entries = await this.loadEntries();
      const updated = entries.map((e) => (e.id === id ? { ...e, ...updates } : e));
      await this.saveEntries(updated);
      return updated;
    } finally {
      releaseLock();
    }
  }

  /**
   * Remove an entry by id.
   * Guarded by writeMutex to prevent concurrent read-modify-write races.
   */
  async removeEntry(id: string): Promise<UserDictionaryEntry[]> {
    const releaseLock = await this.writeMutex.acquire();
    try {
      const entries = await this.loadEntries();
      const filtered = entries.filter((e) => e.id !== id);
      await this.saveEntries(filtered);
      return filtered;
    } finally {
      releaseLock();
    }
  }

  // -------------------------------------------------------------------
  // Standalone mode (StorageService key-value store)
  // -------------------------------------------------------------------

  /**
   * Build a storage key from the full file path to avoid basename collisions.
   * Normalizes path separators so keys are consistent across platforms.
   */
  private buildStandaloneKey(filePath: string): string {
    // Normalize backslashes to forward slashes and strip leading slash
    // so keys are deterministic regardless of platform separator.
    const normalized = filePath.replace(/\\/g, "/").replace(/^\//, "");
    return STANDALONE_STORAGE_PREFIX + normalized;
  }

  /**
   * Load user dictionary entries from StorageService for a specific file.
   * @param filePath - Full path to the file (used as storage key to avoid basename collisions).
   */
  async loadEntriesStandalone(filePath: string): Promise<UserDictionaryEntry[]> {
    try {
      const key = this.buildStandaloneKey(filePath);
      const raw = await this.storage.getItem(key);
      if (!raw) return [];
      const data: UserDictionaryFile = JSON.parse(raw);
      return data.entries ?? [];
    } catch {
      return [];
    }
  }

  /**
   * Save user dictionary entries to StorageService for a specific file.
   * @param filePath - Full path to the file (used as storage key to avoid basename collisions).
   */
  async saveEntriesStandalone(filePath: string, entries: UserDictionaryEntry[]): Promise<void> {
    const key = this.buildStandaloneKey(filePath);
    const data: UserDictionaryFile = {
      version: "1.0.0",
      entries,
    };
    await this.storage.setItem(key, JSON.stringify(data));
  }

  /**
   * Add an entry in standalone mode.
   * Guarded by writeMutex to prevent concurrent read-modify-write races.
   */
  async addEntryStandalone(
    fileName: string,
    entry: UserDictionaryEntry,
  ): Promise<UserDictionaryEntry[]> {
    const releaseLock = await this.writeMutex.acquire();
    try {
      const entries = await this.loadEntriesStandalone(fileName);
      const exists = entries.some((e) => e.id === entry.id);
      if (exists) return entries;

      entries.push(entry);
      entries.sort((a, b) => a.word.localeCompare(b.word));
      await this.saveEntriesStandalone(fileName, entries);
      return entries;
    } finally {
      releaseLock();
    }
  }

  /**
   * Update an entry in standalone mode.
   * Guarded by writeMutex to prevent concurrent read-modify-write races.
   */
  async updateEntryStandalone(
    fileName: string,
    id: string,
    updates: Partial<UserDictionaryEntry>,
  ): Promise<UserDictionaryEntry[]> {
    const releaseLock = await this.writeMutex.acquire();
    try {
      const entries = await this.loadEntriesStandalone(fileName);
      const updated = entries.map((e) => (e.id === id ? { ...e, ...updates } : e));
      await this.saveEntriesStandalone(fileName, updated);
      return updated;
    } finally {
      releaseLock();
    }
  }

  /**
   * Remove an entry in standalone mode.
   * Guarded by writeMutex to prevent concurrent read-modify-write races.
   */
  async removeEntryStandalone(fileName: string, id: string): Promise<UserDictionaryEntry[]> {
    const releaseLock = await this.writeMutex.acquire();
    try {
      const entries = await this.loadEntriesStandalone(fileName);
      const filtered = entries.filter((e) => e.id !== id);
      await this.saveEntriesStandalone(fileName, filtered);
      return filtered;
    } finally {
      releaseLock();
    }
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
