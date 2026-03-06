/**
 * History management service.
 * Handles automatic snapshots, manual milestones, and snapshot restoration.
 *
 * 履歴管理サービス。自動スナップショット、マイルストーン、復元を管理する。
 */

import { getVFS } from "../vfs";
import { AsyncMutex } from "../utils/async-mutex";

import type { VirtualFileSystem, VFSDirectoryHandle } from "../vfs/types";

// -----------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------

/** Default maximum number of non-milestone snapshots to keep */
const DEFAULT_MAX_SNAPSHOTS = 100;

/** Default retention period in days for non-milestone snapshots */
const DEFAULT_RETENTION_DAYS = 90;

/** Minimum interval in milliseconds between auto-snapshots (5 minutes) */
const AUTO_SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Maximum number of snapshots per source file.
 * When exceeded, the oldest auto-snapshots are pruned automatically.
 *
 * ソースファイルあたりの最大スナップショット数。
 * 超過時、最も古い自動スナップショットが自動的に削除される。
 */
const MAX_SNAPSHOTS_PER_FILE = 100;

/** Path to the history directory relative to .illusions */
const HISTORY_DIR_NAME = "history";

/** Name of the history index file */
const HISTORY_INDEX_FILENAME = "index.json";

/** Name of the bookmarks file */
const BOOKMARKS_FILENAME = ".history_bookmarks.json";

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

/** Snapshot type: auto (triggered by save), manual (user-created), or milestone (permanent) */
export type SnapshotType = "auto" | "manual" | "milestone";

/**
 * A single entry in the history index.
 * 履歴インデックスの個別エントリ。
 */
export interface SnapshotEntry {
  /** Unique identifier for this snapshot */
  id: string;
  /** Unix timestamp in milliseconds when the snapshot was created */
  timestamp: number;
  /** History file name (e.g. "main.mdi.[202602061430].history") */
  filename: string;
  /** Source file that was snapshotted (e.g. "main.mdi") */
  sourceFile: string;
  /** Type of snapshot */
  type: SnapshotType;
  /** User-defined label (primarily for milestones) */
  label?: string;
  /** Number of characters in the snapshot content */
  characterCount: number;
  /** File size in bytes */
  fileSize: number;
  /** SHA-256 hex digest of the content */
  checksum: string;
}

/**
 * History index structure stored in .illusions/history/index.json.
 * 履歴インデックスの構造。.illusions/history/index.json に保存される。
 */
export interface HistoryIndex {
  /** All snapshot entries, ordered by timestamp descending */
  snapshots: SnapshotEntry[];
  /** Maximum number of non-milestone snapshots to retain */
  maxSnapshots: number;
  /** Number of days to retain non-milestone snapshots */
  retentionDays: number;
}

/**
 * Options for creating a snapshot.
 * スナップショット作成時のオプション。
 */
export interface CreateSnapshotOptions {
  /** Source file name (e.g. "main.mdi") */
  sourceFile: string;
  /** Content to snapshot */
  content: string;
  /** Snapshot type (defaults to "auto") */
  type?: SnapshotType;
  /** Optional label for milestone snapshots */
  label?: string;
}

/**
 * Result of restoring a snapshot.
 * スナップショット復元の結果。
 */
export interface RestoreResult {
  /** Whether the restoration was successful */
  success: boolean;
  /** The restored content (if successful) */
  content?: string;
  /** Error message (if unsuccessful) */
  error?: string;
}

// -----------------------------------------------------------------------
// Utility Functions
// -----------------------------------------------------------------------

/**
 * Format a timestamp as YYYYMMDDHHmm.
 * タイムスタンプを YYYYMMDDHHmm 形式に変換する。
 */
function formatTimestamp(timestamp: number): string {
  const d = new Date(timestamp);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${year}${month}${day}${hours}${minutes}`;
}

/**
 * Calculate the SHA-256 hex digest of a string using Web Crypto API.
 * Web Crypto API を使用して文字列の SHA-256 ハッシュを計算する。
 */
async function calculateChecksum(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Calculate the byte size of a string encoded as UTF-8.
 * UTF-8 エンコード時の文字列のバイトサイズを計算する。
 */
function calculateByteSize(content: string): number {
  const encoder = new TextEncoder();
  return encoder.encode(content).byteLength;
}

/**
 * Check if a snapshot filename contains the __auto__ marker.
 * スナップショットのファイル名が __auto__ マーカーを含むかチェックする。
 */
function isAutoSnapshotFilename(filename: string): boolean {
  return filename.includes(".__auto__.");
}

/**
 * Create a default (empty) history index.
 * デフォルトの空の履歴インデックスを作成する。
 */
function createDefaultHistoryIndex(): HistoryIndex {
  return {
    snapshots: [],
    maxSnapshots: DEFAULT_MAX_SNAPSHOTS,
    retentionDays: DEFAULT_RETENTION_DAYS,
  };
}

// -----------------------------------------------------------------------
// HistoryService
// -----------------------------------------------------------------------

/**
 * Service for managing file history snapshots.
 * Provides automatic snapshots, manual milestones, and snapshot restoration.
 *
 * ファイル履歴のスナップショットを管理するサービス。
 * 自動スナップショット、手動マイルストーン、復元機能を提供する。
 */
export class HistoryService {
  private vfs: VirtualFileSystem;
  private readonly indexMutex = new AsyncMutex();

  constructor() {
    this.vfs = getVFS();
  }

  /**
   * Create a history snapshot.
   * Saves the content to a history file and updates the index.
   *
   * 履歴スナップショットを作成する。
   * コンテンツを履歴ファイルに保存し、インデックスを更新する。
   *
   * @param options - Snapshot creation options
   * @returns The created SnapshotEntry
   */
  async createSnapshot(options: CreateSnapshotOptions): Promise<SnapshotEntry> {
    const {
      sourceFile,
      content,
      type = "auto",
      label,
    } = options;

    try {
      const timestamp = Date.now();
      const formattedTime = formatTimestamp(timestamp);
      const autoMarker = type === "auto" ? ".__auto__" : "";
      const filename = `${sourceFile}.[${formattedTime}]${autoMarker}.history`;
      const checksum = await calculateChecksum(content);
      const fileSize = calculateByteSize(content);
      const characterCount = content.length;

      const entry: SnapshotEntry = {
        id: crypto.randomUUID(),
        timestamp,
        filename,
        sourceFile,
        type,
        characterCount,
        fileSize,
        checksum,
      };

      if (label !== undefined) {
        entry.label = label;
      }

      // Get or create history directory
      const historyDir = await this.ensureHistoryDirectory();

      // Write the snapshot file
      const snapshotFileHandle = await historyDir.getFileHandle(filename, {
        create: true,
      });
      await snapshotFileHandle.write(content);

      // Update the index (serialized via mutex to prevent TOCTOU race)
      const releaseLock = await this.indexMutex.acquire();
      try {
        const index = await this.readHistoryIndex();
        index.snapshots.unshift(entry);
        await this.writeHistoryIndex(index);

        // Auto-prune old snapshots (global and per-file, within same lock)
        await this.pruneOldSnapshotsUnsafe();
        await this.pruneSnapshotsPerFileUnsafe(sourceFile);
      } finally {
        releaseLock();
      }

      return entry;
    } catch (error) {
      console.error(
        "Failed to create snapshot / スナップショットの作成に失敗しました:",
        error
      );
      throw error;
    }
  }

  /**
   * Restore content from a snapshot.
   * Verifies the checksum before returning content.
   *
   * スナップショットからコンテンツを復元する。
   * 返却前にチェックサムを検証する。
   *
   * @param snapshotId - The ID of the snapshot to restore
   * @returns Restoration result with content or error
   */
  async restoreSnapshot(snapshotId: string): Promise<RestoreResult> {
    try {
      // Find the snapshot entry in the index
      const index = await this.readHistoryIndex();
      const entry = index.snapshots.find((s) => s.id === snapshotId);

      if (!entry) {
        return {
          success: false,
          error: `Snapshot not found: ${snapshotId}`,
        };
      }

      // Read the snapshot file
      const historyDir = await this.getHistoryDirectory();
      const fileHandle = await historyDir.getFileHandle(entry.filename);
      const content = await fileHandle.read();

      // Verify checksum
      const actualChecksum = await calculateChecksum(content);
      if (actualChecksum !== entry.checksum) {
        return {
          success: false,
          error: `Checksum mismatch for snapshot "${entry.filename}". ` +
            `Expected: ${entry.checksum}, got: ${actualChecksum}. ` +
            "The snapshot file may be corrupted.",
        };
      }

      return {
        success: true,
        content,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to restore snapshot: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Prune old snapshots according to retention policy.
   * - Milestones are NEVER deleted
   * - Non-milestone snapshots exceeding maxSnapshots are removed (oldest first)
   * - Non-milestone snapshots older than retentionDays are removed
   *
   * 保持ポリシーに従って古いスナップショットを削除する。
   * - マイルストーンは絶対に削除しない
   * - maxSnapshots を超えるスナップショットを古い順に削除
   * - retentionDays を超えるスナップショットを削除
   */
  async pruneOldSnapshots(): Promise<void> {
    const releaseLock = await this.indexMutex.acquire();
    try {
      await this.pruneOldSnapshotsUnsafe();
    } finally {
      releaseLock();
    }
  }

  /**
   * Internal pruning logic without lock acquisition.
   * Caller MUST hold indexMutex before invoking this method.
   *
   * ロックを取得しない内部削減ロジック。
   * 呼び出し元は事前に indexMutex を保持していなければならない。
   */
  private async pruneOldSnapshotsUnsafe(): Promise<void> {
    const index = await this.readHistoryIndex();
    const now = Date.now();
    const retentionMs = index.retentionDays * 24 * 60 * 60 * 1000;

    // Separate milestones from non-milestones
    const milestones: SnapshotEntry[] = [];
    const nonMilestones: SnapshotEntry[] = [];

    for (const snapshot of index.snapshots) {
      if (snapshot.type === "milestone") {
        milestones.push(snapshot);
      } else {
        nonMilestones.push(snapshot);
      }
    }

    // Sort non-milestones by timestamp descending (newest first)
    nonMilestones.sort((a, b) => b.timestamp - a.timestamp);

    // Determine which non-milestones to keep
    const toKeep: SnapshotEntry[] = [];
    const toDelete: SnapshotEntry[] = [];

    for (let i = 0; i < nonMilestones.length; i++) {
      const snapshot = nonMilestones[i];
      const age = now - snapshot.timestamp;
      const exceedsMaxCount = i >= index.maxSnapshots;
      const exceedsRetention = age > retentionMs;

      if (exceedsMaxCount || exceedsRetention) {
        toDelete.push(snapshot);
      } else {
        toKeep.push(snapshot);
      }
    }

    // Delete the snapshot files
    if (toDelete.length > 0) {
      const historyDir = await this.getHistoryDirectory();

      for (const snapshot of toDelete) {
        try {
          await historyDir.removeEntry(snapshot.filename);
        } catch {
          // File may already be deleted; ignore
          console.warn(
            `Failed to delete snapshot file: ${snapshot.filename}`
          );
        }
      }

      // Update the index with remaining snapshots
      // Combine milestones and kept non-milestones, sorted by timestamp descending
      const remaining = [...milestones, ...toKeep];
      remaining.sort((a, b) => b.timestamp - a.timestamp);
      index.snapshots = remaining;

      await this.writeHistoryIndex(index);
    }
  }

  /**
   * Prune snapshots for a specific source file when they exceed the per-file limit.
   * Only auto-snapshots are eligible for removal; milestones and manual snapshots are preserved.
   *
   * 特定ソースファイルのスナップショットがファイルあたりの上限を超えた場合に削除する。
   * 削除対象は自動スナップショットのみ。マイルストーンと手動スナップショットは保持する。
   *
   * @param sourceFile - The source file name to prune snapshots for
   */
  async pruneSnapshotsPerFile(sourceFile: string): Promise<void> {
    const releaseLock = await this.indexMutex.acquire();
    try {
      await this.pruneSnapshotsPerFileUnsafe(sourceFile);
    } finally {
      releaseLock();
    }
  }

  /**
   * Internal per-file pruning logic without lock acquisition.
   * Caller MUST hold indexMutex before invoking this method.
   *
   * ロックを取得しないファイルごとの内部削減ロジック。
   * 呼び出し元は事前に indexMutex を保持していなければならない。
   *
   * @param sourceFile - The source file name to prune snapshots for
   */
  private async pruneSnapshotsPerFileUnsafe(sourceFile: string): Promise<void> {
    try {
      const index = await this.readHistoryIndex();

      // Get all snapshots for this file
      const fileSnapshots = index.snapshots.filter(
        (s) => s.sourceFile === sourceFile
      );

      const autoCount = fileSnapshots.filter((s) => s.type === "auto").length;
      if (autoCount <= MAX_SNAPSHOTS_PER_FILE) {
        return;
      }

      // Sort by timestamp descending (newest first)
      fileSnapshots.sort((a, b) => b.timestamp - a.timestamp);

      // Identify auto-snapshots that exceed the limit
      const toDelete: SnapshotEntry[] = [];
      let kept = 0;

      for (const snapshot of fileSnapshots) {
        if (snapshot.type === "milestone" || snapshot.type === "manual") {
          // Always keep milestones and manual snapshots
          continue;
        }
        kept++;
        if (kept > MAX_SNAPSHOTS_PER_FILE) {
          toDelete.push(snapshot);
        }
      }

      if (toDelete.length === 0) {
        return;
      }

      const historyDir = await this.getHistoryDirectory();
      const deleteIds = new Set(toDelete.map((s) => s.id));

      for (const snapshot of toDelete) {
        try {
          await historyDir.removeEntry(snapshot.filename);
        } catch {
          // File may already be deleted; ignore
          console.warn(
            `Failed to delete snapshot file: ${snapshot.filename}`
          );
        }
      }

      // Remove deleted entries from index
      index.snapshots = index.snapshots.filter((s) => !deleteIds.has(s.id));
      await this.writeHistoryIndex(index);
    } catch (error) {
      // Non-critical: log warning and continue
      console.warn(
        "Failed to prune per-file snapshots / ファイルごとのスナップショット削減に失敗しました:",
        error
      );
    }
  }

  /**
   * Get the content of a snapshot without restoring it.
   * Unlike restoreSnapshot, this does not trigger any side effects.
   *
   * スナップショットの内容を復元せずに取得する。
   * restoreSnapshot と異なり、副作用を伴わない読み取り専用メソッド。
   *
   * @param snapshotId - The ID of the snapshot to read
   * @returns The snapshot content, or null if not found/corrupted
   */
  async getSnapshotContent(snapshotId: string): Promise<string | null> {
    const result = await this.restoreSnapshot(snapshotId);
    return result.success ? (result.content ?? null) : null;
  }

  /**
   * Determine whether a new auto-snapshot should be created.
   * Returns false if the last snapshot was created within the minimum interval.
   *
   * 新しい自動スナップショットを作成すべきか判定する。
   * 最後のスナップショットが最小間隔内に作成されていた場合は false を返す。
   *
   * @param sourceFile - The source file name to check against
   * @returns true if a new snapshot should be created
   */
  async shouldCreateSnapshot(sourceFile: string): Promise<boolean> {
    try {
      const index = await this.readHistoryIndex();

      // Find the most recent snapshot for this source file
      const lastSnapshot = index.snapshots.find(
        (s) => s.sourceFile === sourceFile
      );

      if (!lastSnapshot) {
        return true;
      }

      const elapsed = Date.now() - lastSnapshot.timestamp;
      return elapsed >= AUTO_SNAPSHOT_INTERVAL_MS;
    } catch {
      // If we can't read the index, allow snapshot creation
      return true;
    }
  }

  /**
   * Get all snapshots for display, optionally filtered by source file.
   * Returns snapshots sorted by timestamp descending (newest first).
   * Falls back to filename detection for type when metadata is missing.
   *
   * 表示用に全スナップショットを取得する。ソースファイルでフィルタ可能。
   * タイムスタンプ降順（新しい順）でソートされる。
   * メタデータが不足している場合、ファイル名から型を検出する。
   *
   * @param sourceFile - Optional source file filter
   * @returns Array of snapshot entries
   */
  async getSnapshots(sourceFile?: string): Promise<SnapshotEntry[]> {
    try {
      const index = await this.readHistoryIndex();

      let { snapshots } = index;

      if (sourceFile !== undefined) {
        snapshots = snapshots.filter((s) => s.sourceFile === sourceFile);
      }

      // Add type fallback for entries missing type metadata
      for (const entry of snapshots) {
        if (!entry.type) {
          entry.type = isAutoSnapshotFilename(entry.filename) ? "auto" : "manual";
        }
      }

      // Ensure sorted by timestamp descending
      return snapshots.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      console.error(
        "Failed to get snapshots / スナップショットの取得に失敗しました:",
        error
      );
      // Return empty array on failure so the UI can still render
      return [];
    }
  }

  /**
   * Delete a specific snapshot by ID.
   * Milestones can also be deleted if explicitly requested.
   *
   * 指定IDのスナップショットを削除する。
   * マイルストーンも明示的にリクエストされれば削除可能。
   *
   * @param snapshotId - The ID of the snapshot to delete
   */
  async deleteSnapshot(snapshotId: string): Promise<void> {
    const releaseLock = await this.indexMutex.acquire();
    try {
      const index = await this.readHistoryIndex();
      const entryIndex = index.snapshots.findIndex((s) => s.id === snapshotId);

      if (entryIndex === -1) {
        throw new Error(`Snapshot not found: ${snapshotId}`);
      }

      const entry = index.snapshots[entryIndex];

      // Delete the file
      try {
        const historyDir = await this.getHistoryDirectory();
        await historyDir.removeEntry(entry.filename);
      } catch {
        console.warn(`Failed to delete snapshot file: ${entry.filename}`);
      }

      // Remove from index
      index.snapshots.splice(entryIndex, 1);
      await this.writeHistoryIndex(index);
    } finally {
      releaseLock();
    }
  }

  // -----------------------------------------------------------------------
  // Bookmarks
  // -----------------------------------------------------------------------

  /**
   * Get all bookmarked snapshot IDs.
   * ブックマーク済みのスナップショットIDセットを取得する。
   */
  async getBookmarks(): Promise<Set<string>> {
    try {
      const historyDir = await this.getHistoryDirectory();
      const handle = await historyDir.getFileHandle(BOOKMARKS_FILENAME);
      const content = await handle.read();
      const ids = JSON.parse(content) as string[];
      return new Set(ids);
    } catch {
      return new Set();
    }
  }

  /**
   * Toggle bookmark state for a snapshot.
   * Returns the new bookmarked state.
   *
   * スナップショットのブックマーク状態をトグルする。
   * 新しいブックマーク状態を返す。
   */
  async toggleBookmark(snapshotId: string): Promise<boolean> {
    const bookmarks = await this.getBookmarks();
    const isBookmarked = bookmarks.has(snapshotId);

    if (isBookmarked) {
      bookmarks.delete(snapshotId);
    } else {
      bookmarks.add(snapshotId);
    }

    const historyDir = await this.ensureHistoryDirectory();
    const handle = await historyDir.getFileHandle(BOOKMARKS_FILENAME, {
      create: true,
    });
    await handle.write(JSON.stringify([...bookmarks], null, 2));

    return !isBookmarked;
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * Read the history index from .illusions/history/index.json.
   * Creates a default index if the file does not exist.
   *
   * .illusions/history/index.json から履歴インデックスを読み込む。
   * ファイルが存在しない場合はデフォルトのインデックスを作成する。
   */
  private async readHistoryIndex(): Promise<HistoryIndex> {
    try {
      const historyDir = await this.getHistoryDirectory();
      const indexHandle = await historyDir.getFileHandle(
        HISTORY_INDEX_FILENAME
      );
      const content = await indexHandle.read();
      return JSON.parse(content) as HistoryIndex;
    } catch {
      // Index file doesn't exist or is invalid; return defaults
      return createDefaultHistoryIndex();
    }
  }

  /**
   * Write the history index to .illusions/history/index.json.
   * 履歴インデックスを .illusions/history/index.json に書き込む。
   */
  private async writeHistoryIndex(index: HistoryIndex): Promise<void> {
    const historyDir = await this.ensureHistoryDirectory();
    const indexHandle = await historyDir.getFileHandle(
      HISTORY_INDEX_FILENAME,
      { create: true }
    );
    await indexHandle.write(JSON.stringify(index, null, 2));
  }

  /**
   * Get the history directory handle.
   * Assumes it already exists (use ensureHistoryDirectory for creation).
   *
   * 履歴ディレクトリのハンドルを取得する。
   * 既に存在していることを前提とする（作成にはensureHistoryDirectoryを使用）。
   */
  private async getHistoryDirectory(): Promise<VFSDirectoryHandle> {
    const rootDir = await this.vfs.getDirectoryHandle("");
    const illusionsDir = await rootDir.getDirectoryHandle(".illusions", { create: true });
    return illusionsDir.getDirectoryHandle(HISTORY_DIR_NAME);
  }

  /**
   * Ensure the .illusions/history/ directory exists, creating it if needed.
   * .illusions/history/ ディレクトリが存在することを保証する。
   */
  private async ensureHistoryDirectory(): Promise<VFSDirectoryHandle> {
    const rootDir = await this.vfs.getDirectoryHandle("");
    const illusionsDir = await rootDir.getDirectoryHandle(".illusions", {
      create: true,
    });
    return illusionsDir.getDirectoryHandle(HISTORY_DIR_NAME, {
      create: true,
    });
  }
}

// -----------------------------------------------------------------------
// Singleton
// -----------------------------------------------------------------------

/** Singleton instance */
let historyServiceInstance: HistoryService | null = null;

/**
 * Get the singleton HistoryService instance.
 * HistoryService のシングルトンインスタンスを取得する。
 */
export function getHistoryService(): HistoryService {
  if (!historyServiceInstance) {
    historyServiceInstance = new HistoryService();
  }
  return historyServiceInstance;
}

/**
 * Reset the singleton HistoryService instance.
 * Useful for testing.
 *
 * シングルトンインスタンスをリセットする。テスト用。
 */
export function resetHistoryService(): void {
  historyServiceInstance = null;
}
