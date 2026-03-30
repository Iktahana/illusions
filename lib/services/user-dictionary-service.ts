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
   */
  async addEntry(entry: UserDictionaryEntry): Promise<UserDictionaryEntry[]> {
    const entries = await this.loadEntries();
    const exists = entries.some((e) => e.id === entry.id);
    if (exists) return entries;

    entries.push(entry);
    entries.sort((a, b) => a.word.localeCompare(b.word));
    await this.saveEntries(entries);
    return entries;
  }

  /**
   * Update an existing entry by id.
   */
  async updateEntry(
    id: string,
    updates: Partial<UserDictionaryEntry>,
  ): Promise<UserDictionaryEntry[]> {
    const entries = await this.loadEntries();
    const updated = entries.map((e) => (e.id === id ? { ...e, ...updates } : e));
    await this.saveEntries(updated);
    return updated;
  }

  /**
   * Remove an entry by id.
   */
  async removeEntry(id: string): Promise<UserDictionaryEntry[]> {
    const entries = await this.loadEntries();
    const filtered = entries.filter((e) => e.id !== id);
    await this.saveEntries(filtered);
    return filtered;
  }

  // -------------------------------------------------------------------
  // Standalone mode (StorageService key-value store)
  // -------------------------------------------------------------------

  /**
   * Load user dictionary entries from StorageService for a specific file.
   */
  async loadEntriesStandalone(fileName: string): Promise<UserDictionaryEntry[]> {
    try {
      const key = STANDALONE_STORAGE_PREFIX + fileName;
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
   */
  async saveEntriesStandalone(fileName: string, entries: UserDictionaryEntry[]): Promise<void> {
    const key = STANDALONE_STORAGE_PREFIX + fileName;
    const data: UserDictionaryFile = {
      version: "1.0.0",
      entries,
    };
    await this.storage.setItem(key, JSON.stringify(data));
  }

  /**
   * Add an entry in standalone mode.
   */
  async addEntryStandalone(
    fileName: string,
    entry: UserDictionaryEntry,
  ): Promise<UserDictionaryEntry[]> {
    const entries = await this.loadEntriesStandalone(fileName);
    const exists = entries.some((e) => e.id === entry.id);
    if (exists) return entries;

    entries.push(entry);
    entries.sort((a, b) => a.word.localeCompare(b.word));
    await this.saveEntriesStandalone(fileName, entries);
    return entries;
  }

  /**
   * Update an entry in standalone mode.
   */
  async updateEntryStandalone(
    fileName: string,
    id: string,
    updates: Partial<UserDictionaryEntry>,
  ): Promise<UserDictionaryEntry[]> {
    const entries = await this.loadEntriesStandalone(fileName);
    const updated = entries.map((e) => (e.id === id ? { ...e, ...updates } : e));
    await this.saveEntriesStandalone(fileName, updated);
    return updated;
  }

  /**
   * Remove an entry in standalone mode.
   */
  async removeEntryStandalone(fileName: string, id: string): Promise<UserDictionaryEntry[]> {
    const entries = await this.loadEntriesStandalone(fileName);
    const filtered = entries.filter((e) => e.id !== id);
    await this.saveEntriesStandalone(fileName, filtered);
    return filtered;
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
