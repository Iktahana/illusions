/**
 * History Policy — Phase 8 stateless pure functions
 *
 * Contains all decision logic for snapshot lifecycle management.
 * No IO, no side effects, no state. This enables high test coverage.
 *
 * 履歴ポリシー — Phase 8 ステートレス純関数群。
 * スナップショットのライフサイクル管理に関するすべての判定ロジックを含む。
 * IO なし、副作用なし、状態なし。高いテストカバレッジを可能にする。
 */

// -----------------------------------------------------------------------
// Types (re-exported here; history-service.ts re-exports for backward compat)
// -----------------------------------------------------------------------

/**
 * Snapshot type.
 * "auto"      — triggered by auto-save interval
 * "manual"    — triggered by explicit user save (Cmd+S / Save button)
 * "milestone" — user-marked permanent snapshot
 * "pre-close"            — taken before a tab/window close (Wave 2)
 * "pre-external-reload"  — taken before adopting external disk change (Wave 2)
 * "restore-point"        — taken before restoring a previous snapshot (Wave 2)
 */
export type SnapshotType =
  "auto" | "manual" | "milestone" | "pre-close" | "pre-external-reload" | "restore-point";

/**
 * A single entry in the history index.
 * 履歴インデックスの個別エントリ。
 */
export interface SnapshotEntry {
  /** Unique identifier for this snapshot */
  id: string;
  /** Unix timestamp in milliseconds when the snapshot was created */
  timestamp: number;
  /** History file name (e.g. "main.mdi.[20260206143025_0123].__auto__.history") */
  filename: string;
  /** Stable document identity within the project (prefer project-relative path). */
  sourcePath: string;
  /** Human-readable file name for UI display. */
  displayName: string;
  /** Legacy basename-only identity retained for backward compatibility reads. */
  sourceFile?: string;
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
  /** Maximum number of non-permanent snapshots to retain */
  maxSnapshots: number;
  /** Number of days to retain non-permanent snapshots */
  retentionDays: number;
}

/**
 * Options for creating a snapshot.
 * スナップショット作成時のオプション。
 */
export interface CreateSnapshotOptions {
  /** Stable document identity within the project (prefer project-relative path). */
  sourcePath: string;
  /** Human-readable file name for UI display. */
  displayName?: string;
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
// Constants
// -----------------------------------------------------------------------

/** Minimum interval in milliseconds between auto-snapshots (5 minutes) */
export const AUTO_SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000;

/** Default maximum number of non-permanent snapshots to keep */
export const MAX_SNAPSHOTS = 100;

/** Default retention period in days for non-permanent snapshots */
export const RETENTION_DAYS = 90;

/**
 * Snapshot types that bypass the throttle and are never pruned by retention policy.
 * Milestones also bypass throttle and are never pruned.
 *
 * スロットル・削除対象外のスナップショット種別。
 */
const PERMANENT_TYPES = new Set<SnapshotType>([
  "manual",
  "milestone",
  "pre-close",
  "restore-point",
]);

/**
 * Determine whether a snapshot type should bypass the auto-snapshot throttle.
 * Returns true for types that always get a snapshot regardless of last-snapshot timing.
 *
 * スナップショット種別がスロットルをバイパスするかを判定する。
 */
function bypassesThrottle(type: SnapshotType): boolean {
  return PERMANENT_TYPES.has(type) || type === "pre-external-reload";
}

// -----------------------------------------------------------------------
// Pure policy functions
// -----------------------------------------------------------------------

/**
 * Determine whether a new snapshot should be created.
 *
 * - "auto" type: throttled to AUTO_SNAPSHOT_INTERVAL_MS. Returns false if the
 *   most recent snapshot for this source path was created within that window.
 * - All other types (manual, milestone, pre-close, pre-external-reload,
 *   restore-point): always returns true.
 *
 * 新しいスナップショットを作成すべきか判定する。
 * auto 種別: 5分スロットル。他の種別は常に true。
 *
 * @param sourcePath      - Source file path to check
 * @param lastSnapshotAt  - Timestamp of the most recent snapshot for this file, or undefined
 * @param type            - The type of snapshot being requested
 * @param now             - Current time in ms (injectable for testing, defaults to Date.now())
 * @returns true if a snapshot should be created
 */
export function shouldCreateSnapshot(
  sourcePath: string,
  lastSnapshotAt: number | undefined,
  type: SnapshotType,
  now: number = Date.now(),
): boolean {
  // Suppress unused-variable warning — sourcePath is part of the contract
  void sourcePath;

  if (bypassesThrottle(type)) {
    return true;
  }

  // "auto" type: enforce minimum interval
  if (lastSnapshotAt === undefined) {
    return true;
  }

  const elapsed = now - lastSnapshotAt;
  return elapsed >= AUTO_SNAPSHOT_INTERVAL_MS;
}

/**
 * Determine whether a single snapshot entry should be pruned.
 *
 * Rules:
 * - Permanent types (manual, milestone, pre-close, restore-point) → never pruned
 * - "pre-external-reload" and "auto" → pruned if older than retentionDays
 *
 * 単一エントリを削除すべきか判定する。
 * 永続種別（manual / milestone / pre-close / restore-point）は絶対に削除しない。
 *
 * @param entry         - The snapshot entry to evaluate
 * @param now           - Current time in ms
 * @param retentionDays - Number of days to retain pruneable snapshots
 */
export function shouldPrune(entry: SnapshotEntry, now: number, retentionDays: number): boolean {
  // Permanent types are never pruned
  if (PERMANENT_TYPES.has(entry.type)) {
    return false;
  }

  const retentionMs = retentionDays * 24 * 60 * 60 * 1000;
  const age = now - entry.timestamp;
  return age > retentionMs;
}

/**
 * Given a history index, return the set of entries that should be deleted.
 *
 * Prune criteria (both applied, union of results):
 * 1. Non-permanent entries exceeding maxSnapshots (oldest first)
 * 2. Non-permanent entries older than retentionDays
 *
 * Permanent types (manual, milestone, pre-close, restore-point) are never included.
 *
 * インデックスから削除すべきエントリ一覧を返す。
 * 永続種別は含まない。auto / pre-external-reload のみ対象。
 *
 * @param index - Current history index
 * @param now   - Current time in ms (injectable for testing)
 * @returns Array of entries to be deleted (may be empty)
 */
export function getPruneSet(index: HistoryIndex, now: number = Date.now()): SnapshotEntry[] {
  const { snapshots, maxSnapshots, retentionDays } = index;
  const retentionMs = retentionDays * 24 * 60 * 60 * 1000;

  // Separate pruneable from permanent
  const prunable: SnapshotEntry[] = snapshots.filter((s) => !PERMANENT_TYPES.has(s.type));

  // Sort pruneable by timestamp descending (newest first)
  prunable.sort((a, b) => b.timestamp - a.timestamp);

  const toDelete = new Set<string>();

  // Rule 1: count-based pruning (oldest pruneable entries beyond maxSnapshots)
  for (let i = maxSnapshots; i < prunable.length; i++) {
    toDelete.add(prunable[i].id);
  }

  // Rule 2: time-based pruning (entries older than retentionDays)
  for (const entry of prunable) {
    const age = now - entry.timestamp;
    if (age > retentionMs) {
      toDelete.add(entry.id);
    }
  }

  return snapshots.filter((s) => toDelete.has(s.id));
}

// -----------------------------------------------------------------------
// Utility functions (pure, no IO)
// -----------------------------------------------------------------------

/**
 * Format a timestamp as YYYYMMDDHHmmss_xxxx.
 * The 4-digit random suffix prevents filename collisions when multiple
 * snapshots are created within the same second.
 *
 * タイムスタンプを YYYYMMDDHHmmss_xxxx 形式に変換する。
 * 4桁の乱数サフィックスにより、同一秒内の複数スナップショットでの
 * ファイル名衝突を防ぐ。
 */
export function formatTimestamp(timestamp: number): string {
  const d = new Date(timestamp);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const seconds = String(d.getSeconds()).padStart(2, "0");
  const rand = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0");
  return `${year}${month}${day}${hours}${minutes}${seconds}_${rand}`;
}

/**
 * Calculate the SHA-256 hex digest of a string using Web Crypto API.
 * Web Crypto API を使用して文字列の SHA-256 ハッシュを計算する。
 */
export async function calculateChecksum(content: string): Promise<string> {
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
export function calculateByteSize(content: string): number {
  const encoder = new TextEncoder();
  return encoder.encode(content).byteLength;
}

/**
 * Check if a snapshot filename contains the __auto__ marker.
 * スナップショットのファイル名が __auto__ マーカーを含むかチェックする。
 */
export function isAutoSnapshotFilename(filename: string): boolean {
  return filename.includes(".__auto__.");
}

/**
 * Get the canonical source key from a snapshot entry.
 * Prefers sourcePath; falls back to legacy sourceFile field.
 *
 * スナップショットエントリから正規のソースキーを取得する。
 */
export function getSnapshotSourceKey(
  snapshot: Partial<Pick<SnapshotEntry, "sourcePath" | "sourceFile">>,
): string {
  return snapshot.sourcePath || snapshot.sourceFile || "";
}

/**
 * Derive a display name from a snapshot entry.
 * Uses displayName if available, otherwise derives from sourcePath.
 *
 * スナップショットエントリから表示名を導出する。
 */
export function getSnapshotDisplayName(
  snapshot: Partial<Pick<SnapshotEntry, "displayName" | "sourcePath" | "sourceFile">>,
): string {
  if (snapshot.displayName) return snapshot.displayName;
  const source = getSnapshotSourceKey(snapshot);
  const normalized = source.replace(/\\/g, "/");
  const lastSegment = normalized.split("/").pop();
  return lastSegment || source;
}

/**
 * Maximum byte length for the storage label portion of a snapshot filename.
 * Windows MAX_PATH is 260 chars. The label is followed by a timestamp + markers
 * (~30 chars) and lives inside .illusions/history/ (~20 chars of path prefix),
 * so 100 chars leaves ample safety margin on all cloud-sync drives.
 */
const MAX_STORAGE_LABEL_LENGTH = 100;

/**
 * Number of trailing path segments to use when constructing the storage label.
 * Using only the last 2 segments (parent dir + filename) keeps labels short
 * while remaining human-readable.
 */
const STORAGE_LABEL_PATH_SEGMENTS = 2;

/**
 * Build a filesystem-safe storage label from a source path and display name.
 * Used as a human-readable prefix in snapshot filenames.
 *
 * ソースパスと表示名からファイルシステム安全なストレージラベルを生成する。
 */
export function makeSnapshotStorageLabel(sourcePath: string, displayName: string): string {
  // Normalize backslashes and strip Windows drive letter (e.g. "G:" or "C:")
  const normalizedPath = sourcePath.replace(/\\/g, "/").replace(/^[A-Za-z]:/, "");

  // Use only the last N path segments to keep filenames short
  const segments = normalizedPath.split("/").filter((s) => s.length > 0);
  const shortSegments = segments.slice(-STORAGE_LABEL_PATH_SEGMENTS);
  const shortPath = shortSegments.join("__");

  // Replace remaining characters that are invalid in Windows filenames: / : * ? " < > |
  const sanitized = shortPath.replace(/[/:<>"|?*]/g, "__") || displayName;

  if (sanitized.length <= MAX_STORAGE_LABEL_LENGTH) {
    return sanitized;
  }

  // Truncate and append a short hash of the full original path for uniqueness
  const hashInput = sourcePath;
  let hash = 0;
  for (let i = 0; i < hashInput.length; i++) {
    hash = (Math.imul(31, hash) + hashInput.charCodeAt(i)) | 0;
  }
  const hashSuffix = (hash >>> 0).toString(16).padStart(8, "0");
  return `${sanitized.slice(0, MAX_STORAGE_LABEL_LENGTH - 9)}_${hashSuffix}`;
}

/**
 * Create a default (empty) history index.
 * デフォルトの空の履歴インデックスを作成する。
 */
export function createDefaultHistoryIndex(): HistoryIndex {
  return {
    snapshots: [],
    maxSnapshots: MAX_SNAPSHOTS,
    retentionDays: RETENTION_DAYS,
  };
}
