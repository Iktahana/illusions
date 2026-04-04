/**
 * Ignored corrections service.
 * CRUD operations for .illusions/ignored-corrections.json (project mode)
 * and StorageService key-value store (standalone mode).
 *
 * 無視された校正指摘の管理サービス。
 * プロジェクトモード: .illusions/ignored-corrections.json
 * スタンドアロンモード: StorageService (IndexedDB / SQLite)
 */

import { getVFS } from "../vfs";
import { getStorageService } from "../storage/storage-service";
import { AsyncMutex } from "../utils/async-mutex";
import type { VirtualFileSystem } from "../vfs/types";
import type { IStorageService } from "../storage/storage-types";
import type { IgnoredCorrection, IgnoredCorrectionsFile } from "../project/project-types";

// -----------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------

const IGNORED_CORRECTIONS_FILENAME = "ignored-corrections.json";
const STANDALONE_STORAGE_PREFIX = "illusions-ignored-corrections:";

// -----------------------------------------------------------------------
// Service
// -----------------------------------------------------------------------

class IgnoredCorrectionsService {
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
   * Load ignored corrections from .illusions/ignored-corrections.json.
   * Returns empty array if the file does not exist (ENOENT).
   * Re-throws on JSON corruption or permission errors to prevent data loss.
   */
  async loadIgnoredCorrections(): Promise<IgnoredCorrection[]> {
    try {
      const rootDir = await this.vfs.getDirectoryHandle("");
      const illusionsDir = await rootDir.getDirectoryHandle(".illusions", { create: true });
      const fileHandle = await illusionsDir.getFileHandle(IGNORED_CORRECTIONS_FILENAME);
      const raw = await fileHandle.read();
      const data: IgnoredCorrectionsFile = JSON.parse(raw);
      return data.ignoredCorrections ?? [];
    } catch (err) {
      // File doesn't exist yet — that's fine
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      // JSON corruption or permission error — re-throw to prevent overwriting existing data
      throw err;
    }
  }

  /**
   * Save ignored corrections to .illusions/ignored-corrections.json.
   * Creates .illusions directory if it does not exist.
   */
  async saveIgnoredCorrections(corrections: IgnoredCorrection[]): Promise<void> {
    const rootDir = await this.vfs.getDirectoryHandle("");
    const illusionsDir = await rootDir.getDirectoryHandle(".illusions", { create: true });
    const fileHandle = await illusionsDir.getFileHandle(IGNORED_CORRECTIONS_FILENAME, {
      create: true,
    });
    const data: IgnoredCorrectionsFile = {
      version: "1.0.0",
      ignoredCorrections: corrections,
    };
    await fileHandle.write(JSON.stringify(data, null, 2));
  }

  /**
   * Add an ignored correction. Deduplicates by (ruleId, text, context).
   * Guarded by writeMutex to prevent concurrent read-modify-write races.
   */
  async addIgnoredCorrection(
    ruleId: string,
    text: string,
    context?: string,
  ): Promise<IgnoredCorrection[]> {
    const releaseLock = await this.writeMutex.acquire();
    try {
      const corrections = await this.loadIgnoredCorrections();
      const exists = corrections.some(
        (c) => c.ruleId === ruleId && c.text === text && c.context === context,
      );
      if (exists) return corrections;

      const entry: IgnoredCorrection = {
        ruleId,
        text,
        addedAt: Date.now(),
        ...(context !== undefined ? { context } : {}),
      };
      corrections.push(entry);
      await this.saveIgnoredCorrections(corrections);
      return corrections;
    } finally {
      releaseLock();
    }
  }

  /**
   * Remove an ignored correction by (ruleId, text, context).
   * Guarded by writeMutex to prevent concurrent read-modify-write races.
   */
  async removeIgnoredCorrection(
    ruleId: string,
    text: string,
    context?: string,
  ): Promise<IgnoredCorrection[]> {
    const releaseLock = await this.writeMutex.acquire();
    try {
      const corrections = await this.loadIgnoredCorrections();
      const filtered = corrections.filter(
        (c) => !(c.ruleId === ruleId && c.text === text && c.context === context),
      );
      await this.saveIgnoredCorrections(filtered);
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
   * Load ignored corrections from StorageService for a specific file.
   * @param filePath - Full path to the file (used as storage key to avoid basename collisions).
   * Returns empty array if no entry exists; re-throws on JSON corruption or storage errors.
   */
  async loadIgnoredCorrectionsStandalone(filePath: string): Promise<IgnoredCorrection[]> {
    try {
      const key = this.buildStandaloneKey(filePath);
      const raw = await this.storage.getItem(key);
      if (!raw) return [];
      const data: IgnoredCorrectionsFile = JSON.parse(raw);
      return data.ignoredCorrections ?? [];
    } catch (err) {
      // No stored entry — that's fine
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      // JSON corruption or storage error — re-throw to prevent overwriting existing data
      throw err;
    }
  }

  /**
   * Save ignored corrections to StorageService for a specific file.
   * @param filePath - Full path to the file (used as storage key to avoid basename collisions).
   */
  async saveIgnoredCorrectionsStandalone(
    filePath: string,
    corrections: IgnoredCorrection[],
  ): Promise<void> {
    const key = this.buildStandaloneKey(filePath);
    const data: IgnoredCorrectionsFile = {
      version: "1.0.0",
      ignoredCorrections: corrections,
    };
    await this.storage.setItem(key, JSON.stringify(data));
  }

  /**
   * Add an ignored correction in standalone mode.
   * Guarded by writeMutex to prevent concurrent read-modify-write races.
   */
  async addIgnoredCorrectionStandalone(
    fileName: string,
    ruleId: string,
    text: string,
    context?: string,
  ): Promise<IgnoredCorrection[]> {
    const releaseLock = await this.writeMutex.acquire();
    try {
      const corrections = await this.loadIgnoredCorrectionsStandalone(fileName);
      const exists = corrections.some(
        (c) => c.ruleId === ruleId && c.text === text && c.context === context,
      );
      if (exists) return corrections;

      const entry: IgnoredCorrection = {
        ruleId,
        text,
        addedAt: Date.now(),
        ...(context !== undefined ? { context } : {}),
      };
      corrections.push(entry);
      await this.saveIgnoredCorrectionsStandalone(fileName, corrections);
      return corrections;
    } finally {
      releaseLock();
    }
  }

  /**
   * Remove an ignored correction in standalone mode.
   * Guarded by writeMutex to prevent concurrent read-modify-write races.
   */
  async removeIgnoredCorrectionStandalone(
    fileName: string,
    ruleId: string,
    text: string,
    context?: string,
  ): Promise<IgnoredCorrection[]> {
    const releaseLock = await this.writeMutex.acquire();
    try {
      const corrections = await this.loadIgnoredCorrectionsStandalone(fileName);
      const filtered = corrections.filter(
        (c) => !(c.ruleId === ruleId && c.text === text && c.context === context),
      );
      await this.saveIgnoredCorrectionsStandalone(fileName, filtered);
      return filtered;
    } finally {
      releaseLock();
    }
  }
}

// -----------------------------------------------------------------------
// Singleton
// -----------------------------------------------------------------------

let instance: IgnoredCorrectionsService | null = null;

export function getIgnoredCorrectionsService(): IgnoredCorrectionsService {
  if (!instance) {
    instance = new IgnoredCorrectionsService();
  }
  return instance;
}
