/**
 * Ignored corrections service.
 * CRUD operations for .illusions/ignored-corrections.json (project mode)
 * and localStorage (standalone mode).
 *
 * 無視された校正指摘の管理サービス。
 * プロジェクトモード: .illusions/ignored-corrections.json
 * スタンドアロンモード: localStorage
 */

import { getVFS } from "./vfs";
import type { VirtualFileSystem } from "./vfs/types";
import type { IgnoredCorrection, IgnoredCorrectionsFile } from "./project-types";

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

  constructor() {
    this.vfs = getVFS();
  }

  // -------------------------------------------------------------------
  // Project mode (VFS)
  // -------------------------------------------------------------------

  /**
   * Load ignored corrections from .illusions/ignored-corrections.json.
   * Returns empty array if the file does not exist.
   */
  async loadIgnoredCorrections(): Promise<IgnoredCorrection[]> {
    try {
      const rootDir = await this.vfs.getDirectoryHandle("");
      const illusionsDir = await rootDir.getDirectoryHandle(".illusions", { create: true });
      const fileHandle = await illusionsDir.getFileHandle(IGNORED_CORRECTIONS_FILENAME);
      const raw = await fileHandle.read();
      const data: IgnoredCorrectionsFile = JSON.parse(raw);
      return data.ignoredCorrections ?? [];
    } catch {
      // File doesn't exist yet — that's fine
      return [];
    }
  }

  /**
   * Save ignored corrections to .illusions/ignored-corrections.json.
   * Creates .illusions directory if it does not exist.
   */
  async saveIgnoredCorrections(corrections: IgnoredCorrection[]): Promise<void> {
    const rootDir = await this.vfs.getDirectoryHandle("");
    const illusionsDir = await rootDir.getDirectoryHandle(".illusions", { create: true });
    const fileHandle = await illusionsDir.getFileHandle(IGNORED_CORRECTIONS_FILENAME, { create: true });
    const data: IgnoredCorrectionsFile = {
      version: "1.0.0",
      ignoredCorrections: corrections,
    };
    await fileHandle.write(JSON.stringify(data, null, 2));
  }

  /**
   * Add an ignored correction. Deduplicates by (ruleId, text, context).
   */
  async addIgnoredCorrection(
    ruleId: string,
    text: string,
    context?: string,
  ): Promise<IgnoredCorrection[]> {
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
  }

  /**
   * Remove an ignored correction by (ruleId, text, context).
   */
  async removeIgnoredCorrection(
    ruleId: string,
    text: string,
    context?: string,
  ): Promise<IgnoredCorrection[]> {
    const corrections = await this.loadIgnoredCorrections();
    const filtered = corrections.filter(
      (c) => !(c.ruleId === ruleId && c.text === text && c.context === context),
    );
    await this.saveIgnoredCorrections(filtered);
    return filtered;
  }

  // -------------------------------------------------------------------
  // Standalone mode (localStorage)
  // -------------------------------------------------------------------

  /**
   * Load ignored corrections from localStorage for a specific file.
   */
  loadIgnoredCorrectionsStandalone(fileName: string): IgnoredCorrection[] {
    if (typeof window === "undefined") return [];
    try {
      const key = STANDALONE_STORAGE_PREFIX + fileName;
      const raw = localStorage.getItem(key);
      if (!raw) return [];
      const data: IgnoredCorrectionsFile = JSON.parse(raw);
      return data.ignoredCorrections ?? [];
    } catch {
      return [];
    }
  }

  /**
   * Save ignored corrections to localStorage for a specific file.
   */
  saveIgnoredCorrectionsStandalone(
    fileName: string,
    corrections: IgnoredCorrection[],
  ): void {
    if (typeof window === "undefined") return;
    const key = STANDALONE_STORAGE_PREFIX + fileName;
    const data: IgnoredCorrectionsFile = {
      version: "1.0.0",
      ignoredCorrections: corrections,
    };
    localStorage.setItem(key, JSON.stringify(data));
  }

  /**
   * Add an ignored correction in standalone mode.
   */
  addIgnoredCorrectionStandalone(
    fileName: string,
    ruleId: string,
    text: string,
    context?: string,
  ): IgnoredCorrection[] {
    const corrections = this.loadIgnoredCorrectionsStandalone(fileName);
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
    this.saveIgnoredCorrectionsStandalone(fileName, corrections);
    return corrections;
  }

  /**
   * Remove an ignored correction in standalone mode.
   */
  removeIgnoredCorrectionStandalone(
    fileName: string,
    ruleId: string,
    text: string,
    context?: string,
  ): IgnoredCorrection[] {
    const corrections = this.loadIgnoredCorrectionsStandalone(fileName);
    const filtered = corrections.filter(
      (c) => !(c.ruleId === ruleId && c.text === text && c.context === context),
    );
    this.saveIgnoredCorrectionsStandalone(fileName, filtered);
    return filtered;
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
