/**
 * User dictionary service.
 * CRUD operations for .illusions/user-dictionary.json (project mode)
 * and localStorage (standalone mode).
 *
 * ユーザー辞書の管理サービス。
 * プロジェクトモード: .illusions/user-dictionary.json
 * スタンドアロンモード: localStorage
 */

import { getVFS } from "./vfs";
import type { VirtualFileSystem } from "./vfs/types";
import type { UserDictionaryEntry, UserDictionaryFile } from "./project-types";

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

  constructor() {
    this.vfs = getVFS();
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
    const updated = entries.map((e) =>
      e.id === id ? { ...e, ...updates } : e,
    );
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
  // Standalone mode (localStorage)
  // -------------------------------------------------------------------

  /**
   * Load user dictionary entries from localStorage for a specific file.
   */
  loadEntriesStandalone(fileName: string): UserDictionaryEntry[] {
    if (typeof window === "undefined") return [];
    try {
      const key = STANDALONE_STORAGE_PREFIX + fileName;
      const raw = localStorage.getItem(key);
      if (!raw) return [];
      const data: UserDictionaryFile = JSON.parse(raw);
      return data.entries ?? [];
    } catch {
      return [];
    }
  }

  /**
   * Save user dictionary entries to localStorage for a specific file.
   */
  saveEntriesStandalone(
    fileName: string,
    entries: UserDictionaryEntry[],
  ): void {
    if (typeof window === "undefined") return;
    const key = STANDALONE_STORAGE_PREFIX + fileName;
    const data: UserDictionaryFile = {
      version: "1.0.0",
      entries,
    };
    localStorage.setItem(key, JSON.stringify(data));
  }

  /**
   * Add an entry in standalone mode.
   */
  addEntryStandalone(
    fileName: string,
    entry: UserDictionaryEntry,
  ): UserDictionaryEntry[] {
    const entries = this.loadEntriesStandalone(fileName);
    const exists = entries.some((e) => e.id === entry.id);
    if (exists) return entries;

    entries.push(entry);
    entries.sort((a, b) => a.word.localeCompare(b.word));
    this.saveEntriesStandalone(fileName, entries);
    return entries;
  }

  /**
   * Update an entry in standalone mode.
   */
  updateEntryStandalone(
    fileName: string,
    id: string,
    updates: Partial<UserDictionaryEntry>,
  ): UserDictionaryEntry[] {
    const entries = this.loadEntriesStandalone(fileName);
    const updated = entries.map((e) =>
      e.id === id ? { ...e, ...updates } : e,
    );
    this.saveEntriesStandalone(fileName, updated);
    return updated;
  }

  /**
   * Remove an entry in standalone mode.
   */
  removeEntryStandalone(
    fileName: string,
    id: string,
  ): UserDictionaryEntry[] {
    const entries = this.loadEntriesStandalone(fileName);
    const filtered = entries.filter((e) => e.id !== id);
    this.saveEntriesStandalone(fileName, filtered);
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
