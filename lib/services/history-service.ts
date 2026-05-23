/**
 * History Service
 *
 * Phase 5 shim: backend を完全削除。Phase 8 で 2026-05-06 計画に従って再構築する。
 *
 * 型 surface（SnapshotEntry / HistoryIndex / SnapshotType / CreateSnapshotOptions /
 * RestoreResult）と getHistoryService() factory を維持して、components/HistoryPanel.tsx
 * や lib/editor-page/use-previous-day-stats.ts の型をブロックしないようにする。
 *
 * すべてのメソッドは no-op もしくは空コレクションを返す。
 */

export type SnapshotType = "auto" | "manual" | "milestone";

export interface SnapshotEntry {
  id: string;
  timestamp: number;
  filename: string;
  sourcePath: string;
  displayName: string;
  sourceFile?: string;
  type: SnapshotType;
  label?: string;
  characterCount: number;
  fileSize: number;
  checksum: string;
}

export interface HistoryIndex {
  snapshots: SnapshotEntry[];
  maxSnapshots: number;
  retentionDays: number;
}

export interface CreateSnapshotOptions {
  sourcePath: string;
  displayName?: string;
  content: string;
  type?: SnapshotType;
  label?: string;
}

export interface RestoreResult {
  success: boolean;
  content?: string;
  error?: string;
}

/**
 * Phase 5 stub HistoryService.
 * すべて no-op / 空コレクションを返す。Phase 8 で本実装に書き換える。
 */
export class HistoryService {
  async getSnapshots(_sourcePath?: string): Promise<SnapshotEntry[]> {
    return [];
  }

  async getSnapshotContent(_snapshotId: string): Promise<string | null> {
    return null;
  }

  async createSnapshot(_options: CreateSnapshotOptions): Promise<SnapshotEntry | null> {
    return null;
  }

  async restoreSnapshot(_snapshotId: string): Promise<RestoreResult> {
    return { success: false, error: "Phase 5 shim: history is disabled" };
  }

  async shouldCreateSnapshot(_sourcePath: string): Promise<boolean> {
    return false;
  }

  async getBookmarks(): Promise<Set<string>> {
    return new Set();
  }

  async toggleBookmark(_snapshotId: string): Promise<boolean> {
    return false;
  }

  onSnapshotCreated(_listener: (snapshot: SnapshotEntry) => void): () => void {
    return () => {};
  }
}

let instance: HistoryService | null = null;

export function getHistoryService(): HistoryService {
  if (!instance) {
    instance = new HistoryService();
  }
  return instance;
}

export function resetHistoryService(): void {
  instance = null;
}
