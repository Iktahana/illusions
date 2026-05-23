/**
 * HistoryService — Phase 8 facade
 *
 * Thin facade that composes HistoryPolicy (decisions) + HistoryStore (IO).
 * The public API is identical to the Phase 5 stub so callers (HistoryPanel,
 * use-previous-day-stats) work unchanged.
 *
 * 履歴サービス — Phase 8 facade。
 * HistoryPolicy（判定）と HistoryStore（IO）を合成する薄い facade。
 * 公開 API は Phase 5 stub と同一なので、呼び出し元は変更不要。
 */

// Re-export all types from history-policy.ts for backward compatibility.
// Callers that import from "@/lib/services/history-service" continue to work.
export type {
  SnapshotType,
  SnapshotEntry,
  HistoryIndex,
  CreateSnapshotOptions,
  RestoreResult,
} from "./history-policy";

import {
  shouldCreateSnapshot as policyCheckThrottle,
  getPruneSet,
  calculateChecksum,
  calculateByteSize,
  formatTimestamp,
  isAutoSnapshotFilename,
  getSnapshotSourceKey,
  getSnapshotDisplayName,
  makeSnapshotStorageLabel,
} from "./history-policy";

import type {
  SnapshotType,
  SnapshotEntry,
  CreateSnapshotOptions,
  RestoreResult,
} from "./history-policy";

import { HistoryStore } from "./history-store";

// -----------------------------------------------------------------------
// HistoryService
// -----------------------------------------------------------------------

/**
 * Facade for managing file history snapshots.
 * Composes HistoryPolicy (stateless decisions) and HistoryStore (IO).
 *
 * ファイル履歴のスナップショットを管理する facade。
 * HistoryPolicy（ステートレス判定）と HistoryStore（IO）を合成する。
 */
export class HistoryService {
  private readonly store = new HistoryStore();
  private readonly snapshotListeners = new Set<(snapshot: SnapshotEntry) => void>();

  // -----------------------------------------------------------------------
  // Event listeners
  // -----------------------------------------------------------------------

  /**
   * Register a listener that fires whenever a snapshot is created.
   * スナップショット作成時に呼び出されるリスナーを登録する。
   */
  onSnapshotCreated(listener: (snapshot: SnapshotEntry) => void): () => void {
    this.snapshotListeners.add(listener);
    return () => {
      this.snapshotListeners.delete(listener);
    };
  }

  private notifySnapshotCreated(entry: SnapshotEntry): void {
    for (const listener of this.snapshotListeners) {
      try {
        listener(entry);
      } catch (err) {
        console.error("Snapshot listener error / スナップショットリスナーエラー:", err);
      }
    }
  }

  // -----------------------------------------------------------------------
  // createSnapshot
  // -----------------------------------------------------------------------

  /**
   * Create a history snapshot.
   *
   * Flow:
   *   a) HistoryPolicy.shouldCreateSnapshot — return null if throttled (auto only)
   *   b) Build SnapshotEntry (timestamp, filename, checksum, size, type)
   *   c) withIndexLock → loadIndex → writeSnapshotFile → update index
   *      (add entry, prune via Policy.getPruneSet) → saveIndex → releaseLock
   *   d) Emit onSnapshotCreated listeners
   *   e) Return new entry
   *
   * 履歴スナップショットを作成する。
   *
   * @param options - Snapshot creation options (type is taken from options, not hardcoded)
   * @returns The created SnapshotEntry, or null if throttled
   */
  async createSnapshot(options: CreateSnapshotOptions): Promise<SnapshotEntry | null> {
    const { sourcePath, displayName: displayNameOption, content, type = "auto", label } = options;

    try {
      // a) Throttle check — only "auto" is throttled
      const index = await this.store.loadIndex();
      const lastEntry = index.snapshots.find((s) => getSnapshotSourceKey(s) === sourcePath);
      const lastSnapshotAt = lastEntry?.timestamp;

      if (!policyCheckThrottle(sourcePath, lastSnapshotAt, type)) {
        return null;
      }

      // b) Build SnapshotEntry
      const timestamp = Date.now();
      const formattedTime = formatTimestamp(timestamp);
      const autoMarker = type === "auto" ? ".__auto__" : "";
      const displayName = displayNameOption ?? getSnapshotDisplayName({ sourcePath });
      const storageLabel = makeSnapshotStorageLabel(sourcePath, displayName);
      const filename = `${storageLabel}.[${formattedTime}]${autoMarker}.history`;
      const checksum = await calculateChecksum(content);
      const fileSize = calculateByteSize(content);
      const characterCount = content.length;

      const entry: SnapshotEntry = {
        id: crypto.randomUUID(),
        timestamp,
        filename,
        sourcePath,
        displayName,
        type,
        characterCount,
        fileSize,
        checksum,
      };

      if (label !== undefined) {
        entry.label = label;
      }

      // c) Write file + update index under lock
      await this.store.withIndexLock(async () => {
        // Write the snapshot file first
        await this.store.writeSnapshotFile(sourcePath, filename, content);

        // Re-read index inside lock (TOCTOU safety)
        const lockedIndex = await this.store.loadIndex();
        lockedIndex.snapshots.unshift(entry);

        // Prune according to policy
        const toDelete = getPruneSet(lockedIndex);
        if (toDelete.length > 0) {
          const deleteIds = new Set(toDelete.map((s) => s.id));
          for (const pruned of toDelete) {
            await this.store.deleteSnapshotFile(sourcePath, pruned.filename);
          }
          lockedIndex.snapshots = lockedIndex.snapshots.filter((s) => !deleteIds.has(s.id));
        }

        await this.store.saveIndex(lockedIndex);
      });

      // d) Notify listeners
      this.notifySnapshotCreated(entry);

      // e) Return
      return entry;
    } catch (error) {
      console.error("Failed to create snapshot / スナップショットの作成に失敗しました:", error);
      throw error;
    }
  }

  // -----------------------------------------------------------------------
  // shouldCreateSnapshot
  // -----------------------------------------------------------------------

  /**
   * Determine whether a new auto-snapshot should be created for a source file.
   * Returns false if the last snapshot was created within the minimum interval.
   *
   * 新しい自動スナップショットを作成すべきか判定する。
   * 最後のスナップショットが最小間隔内に作成されていた場合は false を返す。
   *
   * @param sourcePath - The source file path to check against
   * @returns true if a new snapshot should be created
   */
  async shouldCreateSnapshot(sourcePath: string): Promise<boolean> {
    try {
      const index = await this.store.loadIndex();
      const lastEntry = index.snapshots.find((s) => getSnapshotSourceKey(s) === sourcePath);
      return policyCheckThrottle(sourcePath, lastEntry?.timestamp, "auto");
    } catch {
      // If we can't read the index, allow snapshot creation
      return true;
    }
  }

  // -----------------------------------------------------------------------
  // getSnapshots
  // -----------------------------------------------------------------------

  /**
   * Get all snapshots for display, optionally filtered by source file.
   * Returns snapshots sorted by timestamp descending (newest first).
   * Falls back to filename detection for type when metadata is missing.
   *
   * 表示用に全スナップショットを取得する。ソースファイルでフィルタ可能。
   * タイムスタンプ降順（新しい順）でソートされる。
   * メタデータが不足している場合、ファイル名から型を検出する。
   *
   * @param sourcePath - Optional source file filter
   * @returns Array of snapshot entries
   */
  async getSnapshots(sourcePath?: string): Promise<SnapshotEntry[]> {
    try {
      const index = await this.store.loadIndex();

      let { snapshots } = index;

      if (sourcePath !== undefined) {
        snapshots = snapshots.filter((s) => getSnapshotSourceKey(s) === sourcePath);
      }

      // Add fallbacks for older entries missing newer metadata.
      for (const entry of snapshots) {
        if (!entry.type) {
          entry.type = isAutoSnapshotFilename(entry.filename) ? "auto" : "manual";
        }
        if (!entry.sourcePath) {
          entry.sourcePath = entry.sourceFile ?? "";
        }
        if (!entry.displayName) {
          entry.displayName = getSnapshotDisplayName(entry);
        }
      }

      // Ensure sorted by timestamp descending
      return snapshots.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      console.error("Failed to get snapshots / スナップショットの取得に失敗しました:", error);
      return [];
    }
  }

  // -----------------------------------------------------------------------
  // getSnapshotContent
  // -----------------------------------------------------------------------

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

  // -----------------------------------------------------------------------
  // restoreSnapshot
  // -----------------------------------------------------------------------

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
      const index = await this.store.loadIndex();
      const entry = index.snapshots.find((s) => s.id === snapshotId);

      if (!entry) {
        return {
          success: false,
          error: `Snapshot not found: ${snapshotId}`,
        };
      }

      const content = await this.store.readSnapshotFile(entry.sourcePath, entry.filename);

      // Verify checksum
      const actualChecksum = await calculateChecksum(content);
      if (actualChecksum !== entry.checksum) {
        return {
          success: false,
          error:
            `Checksum mismatch for snapshot "${entry.filename}". ` +
            `Expected: ${entry.checksum}, got: ${actualChecksum}. ` +
            "The snapshot file may be corrupted.",
        };
      }

      return { success: true, content };
    } catch (error) {
      return {
        success: false,
        error: `Failed to restore snapshot: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  // -----------------------------------------------------------------------
  // deleteSnapshot
  // -----------------------------------------------------------------------

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
    await this.store.withIndexLock(async () => {
      const index = await this.store.loadIndex();
      const entryIndex = index.snapshots.findIndex((s) => s.id === snapshotId);

      if (entryIndex === -1) {
        throw new Error(`Snapshot not found: ${snapshotId}`);
      }

      const entry = index.snapshots[entryIndex];
      await this.store.deleteSnapshotFile(entry.sourcePath, entry.filename);

      index.snapshots.splice(entryIndex, 1);
      await this.store.saveIndex(index);
    });
  }

  // -----------------------------------------------------------------------
  // Bookmarks
  // -----------------------------------------------------------------------

  /**
   * Get all bookmarked snapshot IDs.
   * ブックマーク済みのスナップショットIDセットを取得する。
   */
  async getBookmarks(): Promise<Set<string>> {
    return this.store.loadBookmarks();
  }

  /**
   * Toggle bookmark state for a snapshot.
   * Returns the new bookmarked state.
   *
   * スナップショットのブックマーク状態をトグルする。
   * 新しいブックマーク状態を返す。
   */
  async toggleBookmark(snapshotId: string): Promise<boolean> {
    const releaseLock = await this.store.acquireBookmarkLock();
    try {
      const bookmarks = await this.store.loadBookmarks();
      const isBookmarked = bookmarks.has(snapshotId);

      if (isBookmarked) {
        bookmarks.delete(snapshotId);
      } else {
        bookmarks.add(snapshotId);
      }

      await this.store.saveBookmarks(bookmarks);
      return !isBookmarked;
    } finally {
      releaseLock();
    }
  }

  // -----------------------------------------------------------------------
  // pruneOldSnapshots (retained for direct callers if any)
  // -----------------------------------------------------------------------

  /**
   * Prune old snapshots according to retention policy.
   * Exposed for explicit pruning; createSnapshot also auto-prunes.
   *
   * 保持ポリシーに従って古いスナップショットを削除する。
   * createSnapshot でも自動削除されるが、明示的な削除用に公開している。
   */
  async pruneOldSnapshots(): Promise<void> {
    await this.store.withIndexLock(async () => {
      const index = await this.store.loadIndex();
      const toDelete = getPruneSet(index);

      if (toDelete.length === 0) return;

      const deleteIds = new Set(toDelete.map((s) => s.id));
      for (const pruned of toDelete) {
        await this.store.deleteSnapshotFile(pruned.sourcePath, pruned.filename);
      }
      index.snapshots = index.snapshots.filter((s) => !deleteIds.has(s.id));
      await this.store.saveIndex(index);
    });
  }
}

// -----------------------------------------------------------------------
// Singleton
// -----------------------------------------------------------------------

let instance: HistoryService | null = null;

/**
 * Get the singleton HistoryService instance.
 * HistoryService のシングルトンインスタンスを取得する。
 */
export function getHistoryService(): HistoryService {
  if (!instance) {
    instance = new HistoryService();
  }
  return instance;
}

/**
 * Reset the singleton HistoryService instance.
 * Useful for testing.
 *
 * シングルトンインスタンスをリセットする。テスト用。
 */
export function resetHistoryService(): void {
  instance = null;
}
