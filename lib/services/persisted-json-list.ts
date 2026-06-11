/**
 * Persisted JSON list store.
 * Shared persistence backbone for per-file JSON list services that store data in
 * .illusions/<filename> (project mode) or the StorageService key-value store
 * (standalone mode).
 *
 * ストレージ永続化された JSON リスト系サービスの共通基盤。
 * プロジェクトモード: .illusions/<filename>
 * スタンドアロンモード: StorageService (IndexedDB / SQLite)
 *
 * Callers supply only the variable parts:
 * - filename / standalone storage key prefix
 * - envelope (de)serialization (version 付き envelope の shape は caller が決める)
 * - domain-specific mutation callbacks (identity / dedupe policy を含む)
 *
 * All read-modify-write operations are serialized through a per-store AsyncMutex
 * to prevent last-writer-wins data loss in multi-window scenarios.
 */

import { getProjectFileService } from "./project-file-service";
import { getStorageService } from "../storage/storage-service";
import { AsyncMutex } from "../utils/async-mutex";
import type { VirtualFileSystem, VFSFileHandle } from "../vfs/types";
import type { IStorageService } from "../storage/storage-types";

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

/**
 * Mutation callback applied under the write mutex.
 * Return the next list to persist, or `null` to skip the save entirely
 * (e.g. when dedupe policy rejects the change). Mutating and returning the
 * given array is allowed.
 */
export type PersistedListMutation<TItem> = (items: TItem[]) => TItem[] | null;

/** Configuration for a {@link PersistedJsonListStore}. */
export interface PersistedJsonListConfig<TItem> {
  /** File name under .illusions/ in project mode (e.g. "user-dictionary.json"). */
  filename: string;
  /** Storage key prefix in standalone mode (e.g. "illusions-user-dictionary:"). */
  standaloneKeyPrefix: string;
  /**
   * Build the versioned JSON envelope from the item list.
   * Property insertion order is preserved in the serialized output, so the
   * envelope shape (including the version field) stays byte-compatible.
   */
  toEnvelope: (items: TItem[]) => unknown;
  /** Extract the item list from a parsed envelope (missing list → empty array). */
  fromEnvelope: (envelope: unknown) => TItem[];
}

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

/**
 * Returns true when an error signals a missing file across either VFS backend:
 * a Web File System Access API `DOMException` named "NotFoundError", or an
 * Electron/Node `ENOENT` error code. Used to treat an absent file as "empty"
 * rather than a hard failure.
 */
export function isFileNotFoundError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const name = (err as { name?: unknown }).name;
  const code = (err as { code?: unknown }).code;
  return name === "NotFoundError" || code === "ENOENT";
}

// -----------------------------------------------------------------------
// Store
// -----------------------------------------------------------------------

/**
 * A JSON list persisted per file, in project mode (.illusions/<filename>) or
 * standalone mode (StorageService). Domain semantics (identity, dedupe,
 * sorting) stay in the calling service via mutation callbacks.
 */
export class PersistedJsonListStore<TItem> {
  private readonly config: PersistedJsonListConfig<TItem>;
  private readonly vfs: VirtualFileSystem;
  private readonly storage: IStorageService;
  /** Serializes all read-modify-write operations to prevent last-writer-wins data loss in multi-window scenarios. */
  private readonly writeMutex = new AsyncMutex();

  constructor(config: PersistedJsonListConfig<TItem>) {
    this.config = config;
    this.vfs = getProjectFileService();
    this.storage = getStorageService();
  }

  // -------------------------------------------------------------------
  // Project mode (VFS)
  // -------------------------------------------------------------------

  /**
   * Load the item list from .illusions/<filename>.
   * Returns empty array if the file does not exist (web NotFoundError,
   * Electron ENOENT, or exists() === false).
   * Re-throws on JSON corruption or permission errors to prevent data loss.
   */
  async loadProject(): Promise<TItem[]> {
    const rootDir = await this.vfs.getDirectoryHandle("");
    const illusionsDir = await rootDir.getDirectoryHandle(".illusions", { create: true });

    let fileHandle: VFSFileHandle;
    try {
      fileHandle = await illusionsDir.getFileHandle(this.config.filename);
    } catch (err) {
      // Web (File System Access API) throws NotFoundError synchronously from
      // getFileHandle when the file is absent — before exists() can be consulted.
      // Electron's VFS only builds a path wrapper here and never throws for a
      // missing file, so this branch is web-only. Any other error (permission,
      // etc.) must propagate to avoid masking real failures.
      if (isFileNotFoundError(err)) return [];
      throw err;
    }

    // Electron path: a missing file only surfaces on access, and the error's
    // `code` is dropped across the IPC boundary, so a post-read ENOENT check is
    // unreliable — guard with exists() before reading instead.
    if (!(await fileHandle.exists())) return [];
    // JSON corruption or permission errors still propagate to prevent data loss.
    const raw = await fileHandle.read();
    return this.config.fromEnvelope(JSON.parse(raw));
  }

  /**
   * Save the item list to .illusions/<filename> as pretty-printed JSON.
   * Creates .illusions directory if it does not exist.
   */
  async saveProject(items: TItem[]): Promise<void> {
    const rootDir = await this.vfs.getDirectoryHandle("");
    const illusionsDir = await rootDir.getDirectoryHandle(".illusions", { create: true });
    const fileHandle = await illusionsDir.getFileHandle(this.config.filename, { create: true });
    await fileHandle.write(JSON.stringify(this.config.toEnvelope(items), null, 2));
  }

  /**
   * Apply a mutation to the project-mode list under the write mutex
   * (read-modify-write). Returns the resulting list; if the mutation returns
   * `null`, nothing is saved and the loaded list is returned as-is.
   */
  async mutateProject(mutation: PersistedListMutation<TItem>): Promise<TItem[]> {
    const releaseLock = await this.writeMutex.acquire();
    try {
      const items = await this.loadProject();
      const next = mutation(items);
      if (next === null) return items;
      await this.saveProject(next);
      return next;
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
    return this.config.standaloneKeyPrefix + normalized;
  }

  /**
   * Load the item list from StorageService for a specific file.
   * @param filePath - Full path to the file (used as storage key to avoid basename collisions).
   * Returns empty array if no entry exists; re-throws on JSON corruption or storage errors.
   */
  async loadStandalone(filePath: string): Promise<TItem[]> {
    try {
      const key = this.buildStandaloneKey(filePath);
      const raw = await this.storage.getItem(key);
      if (!raw) return [];
      return this.config.fromEnvelope(JSON.parse(raw));
    } catch (err) {
      // No stored entry — that's fine
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      // JSON corruption or storage error — re-throw to prevent overwriting existing data
      throw err;
    }
  }

  /**
   * Save the item list to StorageService for a specific file as compact JSON.
   * @param filePath - Full path to the file (used as storage key to avoid basename collisions).
   */
  async saveStandalone(filePath: string, items: TItem[]): Promise<void> {
    const key = this.buildStandaloneKey(filePath);
    await this.storage.setItem(key, JSON.stringify(this.config.toEnvelope(items)));
  }

  /**
   * Apply a mutation to the standalone-mode list under the write mutex
   * (read-modify-write). Returns the resulting list; if the mutation returns
   * `null`, nothing is saved and the loaded list is returned as-is.
   */
  async mutateStandalone(
    filePath: string,
    mutation: PersistedListMutation<TItem>,
  ): Promise<TItem[]> {
    const releaseLock = await this.writeMutex.acquire();
    try {
      const items = await this.loadStandalone(filePath);
      const next = mutation(items);
      if (next === null) return items;
      await this.saveStandalone(filePath, next);
      return next;
    } finally {
      releaseLock();
    }
  }
}
