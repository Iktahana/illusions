/**
 * Ignored corrections service.
 * CRUD operations for .illusions/ignored-corrections.json (project mode)
 * and StorageService key-value store (standalone mode).
 *
 * 無視された校正指摘の管理サービス。
 * プロジェクトモード: .illusions/ignored-corrections.json
 * スタンドアロンモード: StorageService (IndexedDB / SQLite)
 *
 * Persistence (file/storage access, envelope, mutex) is delegated to the
 * shared PersistedJsonListStore; domain semantics (identity by
 * (ruleId, text, context)) live here.
 */

import { PersistedJsonListStore } from "./persisted-json-list";
import type { IgnoredCorrection, IgnoredCorrectionsFile } from "../project/project-types";

// -----------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------

const IGNORED_CORRECTIONS_FILENAME = "ignored-corrections.json";
const STANDALONE_STORAGE_PREFIX = "illusions-ignored-corrections:";

// -----------------------------------------------------------------------
// Domain mutations (identity / dedupe policy)
// -----------------------------------------------------------------------

/** Identity of an ignored correction is the (ruleId, text, context) triple. */
function matchesIdentity(
  correction: IgnoredCorrection,
  ruleId: string,
  text: string,
  context?: string,
): boolean {
  return correction.ruleId === ruleId && correction.text === text && correction.context === context;
}

/** Add a correction, deduplicating by (ruleId, text, context). Returns null when a duplicate exists (skip save). */
function insertCorrection(
  corrections: IgnoredCorrection[],
  ruleId: string,
  text: string,
  context?: string,
): IgnoredCorrection[] | null {
  const exists = corrections.some((c) => matchesIdentity(c, ruleId, text, context));
  if (exists) return null;

  const entry: IgnoredCorrection = {
    ruleId,
    text,
    addedAt: Date.now(),
    ...(context !== undefined ? { context } : {}),
  };
  corrections.push(entry);
  return corrections;
}

/** Remove the correction matching (ruleId, text, context). */
function removeByIdentity(
  corrections: IgnoredCorrection[],
  ruleId: string,
  text: string,
  context?: string,
): IgnoredCorrection[] {
  return corrections.filter((c) => !matchesIdentity(c, ruleId, text, context));
}

// -----------------------------------------------------------------------
// Service
// -----------------------------------------------------------------------

class IgnoredCorrectionsService {
  private readonly store: PersistedJsonListStore<IgnoredCorrection>;

  constructor() {
    this.store = new PersistedJsonListStore<IgnoredCorrection>({
      filename: IGNORED_CORRECTIONS_FILENAME,
      standaloneKeyPrefix: STANDALONE_STORAGE_PREFIX,
      toEnvelope: (corrections): IgnoredCorrectionsFile => ({
        version: "1.0.0",
        ignoredCorrections: corrections,
      }),
      fromEnvelope: (envelope): IgnoredCorrection[] =>
        (envelope as IgnoredCorrectionsFile).ignoredCorrections ?? [],
    });
  }

  // -------------------------------------------------------------------
  // Project mode (VFS)
  // -------------------------------------------------------------------

  /**
   * Load ignored corrections from .illusions/ignored-corrections.json.
   * Returns empty array if the file does not exist.
   * Re-throws on JSON corruption or permission errors to prevent data loss.
   */
  async loadIgnoredCorrections(): Promise<IgnoredCorrection[]> {
    return this.store.loadProject();
  }

  /**
   * Save ignored corrections to .illusions/ignored-corrections.json.
   * Creates .illusions directory if it does not exist.
   */
  async saveIgnoredCorrections(corrections: IgnoredCorrection[]): Promise<void> {
    return this.store.saveProject(corrections);
  }

  /**
   * Add an ignored correction. Deduplicates by (ruleId, text, context).
   * Guarded by the store mutex to prevent concurrent read-modify-write races.
   */
  async addIgnoredCorrection(
    ruleId: string,
    text: string,
    context?: string,
  ): Promise<IgnoredCorrection[]> {
    return this.store.mutateProject((corrections) =>
      insertCorrection(corrections, ruleId, text, context),
    );
  }

  /**
   * Remove an ignored correction by (ruleId, text, context).
   * Guarded by the store mutex to prevent concurrent read-modify-write races.
   */
  async removeIgnoredCorrection(
    ruleId: string,
    text: string,
    context?: string,
  ): Promise<IgnoredCorrection[]> {
    return this.store.mutateProject((corrections) =>
      removeByIdentity(corrections, ruleId, text, context),
    );
  }

  // -------------------------------------------------------------------
  // Standalone mode (StorageService key-value store)
  // -------------------------------------------------------------------

  /**
   * Load ignored corrections from StorageService for a specific file.
   * @param filePath - Full path to the file (used as storage key to avoid basename collisions).
   * Returns empty array if no entry exists; re-throws on JSON corruption or storage errors.
   */
  async loadIgnoredCorrectionsStandalone(filePath: string): Promise<IgnoredCorrection[]> {
    return this.store.loadStandalone(filePath);
  }

  /**
   * Save ignored corrections to StorageService for a specific file.
   * @param filePath - Full path to the file (used as storage key to avoid basename collisions).
   */
  async saveIgnoredCorrectionsStandalone(
    filePath: string,
    corrections: IgnoredCorrection[],
  ): Promise<void> {
    return this.store.saveStandalone(filePath, corrections);
  }

  /**
   * Add an ignored correction in standalone mode.
   * Guarded by the store mutex to prevent concurrent read-modify-write races.
   */
  async addIgnoredCorrectionStandalone(
    fileName: string,
    ruleId: string,
    text: string,
    context?: string,
  ): Promise<IgnoredCorrection[]> {
    return this.store.mutateStandalone(fileName, (corrections) =>
      insertCorrection(corrections, ruleId, text, context),
    );
  }

  /**
   * Remove an ignored correction in standalone mode.
   * Guarded by the store mutex to prevent concurrent read-modify-write races.
   */
  async removeIgnoredCorrectionStandalone(
    fileName: string,
    ruleId: string,
    text: string,
    context?: string,
  ): Promise<IgnoredCorrection[]> {
    return this.store.mutateStandalone(fileName, (corrections) =>
      removeByIdentity(corrections, ruleId, text, context),
    );
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
