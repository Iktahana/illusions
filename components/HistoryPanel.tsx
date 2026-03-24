"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Plus, Loader2, History, ChevronDown, ChevronRight } from "lucide-react";
import clsx from "clsx";
import { getHistoryService } from "@/lib/services/history-service";
import ConfirmDialog from "@/components/ConfirmDialog";
import SnapshotItem from "./HistoryPanel/SnapshotItem";
import { computeDiffStats } from "./HistoryPanel/DiffIndicator";
import { getDateKey, formatDateGroupLabel, formatTimeJa, getSnapshotTypeLabel } from "./HistoryPanel/snapshot-utils";

import type { SnapshotEntry } from "@/lib/services/history-service";
import type { DiffStats } from "./HistoryPanel/DiffIndicator";

// -----------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------

/**
 * Number of snapshots to display per page.
 * Additional snapshots are loaded on demand via "Load more" button.
 *
 * 1ページあたりの表示スナップショット数。
 * 追加のスナップショットは「もっと読み込む」ボタンで読み込む。
 */
const SNAPSHOTS_PER_PAGE = 20;

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

interface HistoryPanelProps {
  projectId: string;
  mainFileName: string;
  onRestore: (content: string) => void;
  /** Current editor content for diff comparison */
  currentContent?: string;
  /** Callback to display diff in the editor area */
  onCompareInEditor?: (data: { snapshotContent: string; currentContent: string; label: string }) => void;
}

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

interface DateGroup {
  label: string;
  snapshots: SnapshotEntry[];
}

/**
 * Group snapshots by date, preserving newest-first order.
 * スナップショットを日付ごとにグループ化する（新しい順を維持）。
 */
function groupSnapshotsByDate(items: SnapshotEntry[]): DateGroup[] {
  const groups: DateGroup[] = [];
  let currentKey = "";
  let currentGroup: DateGroup | null = null;

  for (const snapshot of items) {
    const key = getDateKey(snapshot.timestamp);
    if (key !== currentKey) {
      currentKey = key;
      currentGroup = { label: formatDateGroupLabel(key), snapshots: [] };
      groups.push(currentGroup);
    }
    currentGroup!.snapshots.push(snapshot);
  }

  return groups;
}

// -----------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------

export default function HistoryPanel({
  projectId: _projectId,
  mainFileName,
  onRestore,
  currentContent = "",
  onCompareInEditor,
}: HistoryPanelProps) {
  const [snapshots, setSnapshots] = useState<SnapshotEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [creatingSnapshot, setCreatingSnapshot] = useState(false);
  const [displayCount, setDisplayCount] = useState(SNAPSHOTS_PER_PAGE);
  const [loadingDiffId, setLoadingDiffId] = useState<string | null>(null);
  const [restoreConfirm, setRestoreConfirm] = useState<SnapshotEntry | null>(null);

  /**
   * Load snapshots from HistoryService.
   * HistoryService からスナップショットを読み込む。
   */
  const loadSnapshots = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const historyService = getHistoryService();
      const loaded = await historyService.getSnapshots(mainFileName);
      setSnapshots(loaded);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`履歴の読み込みに失敗しました: ${message}`);
    } finally {
      setIsLoading(false);
    }
  }, [mainFileName]);

  // Load snapshots on mount and when mainFileName changes
  useEffect(() => {
    void loadSnapshots();
    // Reset pagination when file changes
    setDisplayCount(SNAPSHOTS_PER_PAGE);
  }, [loadSnapshots]);

  /** Map of snapshot ID → diff stats relative to previous version */
  const [diffStatsMap, setDiffStatsMap] = useState<Map<string, DiffStats>>(new Map());

  /** ID of the very first (oldest) snapshot overall */
  const firstVersionId = snapshots.length > 0 ? snapshots[snapshots.length - 1].id : null;

  // Compute diff stats between consecutive snapshots asynchronously
  useEffect(() => {
    const displayed = snapshots.slice(0, displayCount);
    if (displayed.length < 2) {
      setDiffStatsMap(new Map());
      return;
    }

    let cancelled = false;

    const compute = async () => {
      const historyService = getHistoryService();
      // Load one extra snapshot for the last displayed item's predecessor
      const idsToLoad = displayed.map((s) => s.id);
      const nextSnapshot = snapshots[displayCount];
      if (nextSnapshot) idsToLoad.push(nextSnapshot.id);

      const contents = await Promise.all(
        idsToLoad.map((id) => historyService.getSnapshotContent(id))
      );
      if (cancelled) return;

      const map = new Map<string, DiffStats>();
      for (let i = 0; i < displayed.length; i++) {
        const newContent = contents[i];
        const oldContent = contents[i + 1];
        if (newContent != null && oldContent != null) {
          map.set(displayed[i].id, computeDiffStats(oldContent, newContent));
        }
      }
      setDiffStatsMap(map);
    };

    void compute();
    return () => { cancelled = true; };
  }, [snapshots, displayCount]);

  /** Set of bookmarked snapshot IDs */
  const [bookmarkSet, setBookmarkSet] = useState<Set<string>>(new Set());

  // Load bookmarks on mount
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const historyService = getHistoryService();
      const set = await historyService.getBookmarks();
      if (!cancelled) setBookmarkSet(set);
    };
    void load();
    return () => { cancelled = true; };
  }, [snapshots]);

  /** Toggle a bookmark and update local state */
  const handleToggleBookmark = useCallback(async (snapshotId: string) => {
    const historyService = getHistoryService();
    const isNowBookmarked = await historyService.toggleBookmark(snapshotId);
    setBookmarkSet((prev) => {
      const next = new Set(prev);
      if (isNowBookmarked) {
        next.add(snapshotId);
      } else {
        next.delete(snapshotId);
      }
      return next;
    });
  }, []);

  /**
   * Grouped snapshots based on current pagination.
   * ページネーションに基づき、日付ごとにグループ化されたスナップショット。
   */
  const groupedSnapshots = useMemo(
    () => groupSnapshotsByDate(snapshots.slice(0, displayCount)),
    [snapshots, displayCount]
  );

  /** Collapsed state for each date group. Key = date label */
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  /** Daily diff stats: date label → DiffStats between last of prev day and first of this day */
  const [dailyDiffMap, setDailyDiffMap] = useState<Map<string, DiffStats>>(new Map());

  /** Initialize collapsed state: collapse groups older than 2 days */
  useEffect(() => {
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const cutoffKey = getDateKey(twoDaysAgo.getTime());

    const toCollapse = new Set<string>();
    for (const group of groupedSnapshots) {
      // Extract date key from label (reverse engineer from formatDateGroupLabel)
      const firstSnapshot = group.snapshots[0];
      if (!firstSnapshot) continue;
      const groupKey = getDateKey(firstSnapshot.timestamp);
      if (groupKey < cutoffKey) {
        toCollapse.add(group.label);
      }
    }
    setCollapsedGroups(toCollapse);
  }, [groupedSnapshots]);

  /** Compute daily diff: first snapshot of each day vs last snapshot of previous day */
  useEffect(() => {
    if (groupedSnapshots.length === 0) {
      setDailyDiffMap(new Map());
      return;
    }

    let cancelled = false;

    const compute = async () => {
      const historyService = getHistoryService();
      const map = new Map<string, DiffStats>();

      for (let i = 0; i < groupedSnapshots.length; i++) {
        const group = groupedSnapshots[i];
        const todayNewest = group.snapshots[0]; // newest in this group (today)
        if (!todayNewest) continue;

        // Find newest snapshot of previous day
        const prevGroup = groupedSnapshots[i + 1];
        const prevDayNewest = prevGroup?.snapshots[0]; // newest in previous day
        if (!prevDayNewest) continue;

        // Load both contents
        const [newContent, oldContent] = await Promise.all([
          historyService.getSnapshotContent(todayNewest.id),
          historyService.getSnapshotContent(prevDayNewest.id),
        ]);

        if (cancelled) return;

        if (newContent != null && oldContent != null) {
          const stats = computeDiffStats(oldContent, newContent);
          map.set(group.label, stats);
        }
      }

      if (!cancelled) {
        setDailyDiffMap(map);
      }
    };

    void compute();
    return () => { cancelled = true; };
  }, [groupedSnapshots]);

  const toggleGroup = useCallback((label: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  }, []);

  /** Whether there are more snapshots to load */
  const hasMore = snapshots.length > displayCount;

  /**
   * Load more snapshots by incrementing the display count.
   * 表示数を増やして追加のスナップショットを読み込む。
   */
  const handleLoadMore = useCallback(() => {
    setDisplayCount((prev) => prev + SNAPSHOTS_PER_PAGE);
  }, []);

  /**
   * Show confirmation dialog for snapshot restoration.
   * スナップショット復元の確認ダイアログを表示する。
   */
  const handleRestore = useCallback(
    (snapshot: SnapshotEntry) => {
      setRestoreConfirm(snapshot);
    },
    []
  );

  /**
   * Execute the snapshot restoration after user confirmation.
   * ユーザー確認後にスナップショットの復元を実行する。
   */
  const executeRestore = useCallback(
    async (snapshot: SnapshotEntry) => {
      try {
        setRestoringId(snapshot.id);
        const historyService = getHistoryService();
        const result = await historyService.restoreSnapshot(snapshot.id);

        if (result.success && result.content !== undefined) {
          onRestore(result.content);
        } else {
          setError(result.error ?? "復元に失敗しました");
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(`復元に失敗しました: ${message}`);
      } finally {
        setRestoringId(null);
      }
    },
    [onRestore]
  );

  /**
   * Handle manual snapshot creation.
   * 手動スナップショットの作成を処理する。
   * Note: This creates a snapshot of the current content via HistoryService.
   *       The actual content is not accessible here; a placeholder is used.
   */
  const handleCreateSnapshot = useCallback(async () => {
    try {
      setCreatingSnapshot(true);
      setError(null);
      const historyService = getHistoryService();
      await historyService.createSnapshot({
        sourceFile: mainFileName,
        content: "", // The caller should provide actual content via a different mechanism
        type: "manual",
      });
      await loadSnapshots();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`スナップショットの作成に失敗しました: ${message}`);
    } finally {
      setCreatingSnapshot(false);
    }
  }, [mainFileName, loadSnapshots]);

  /**
   * Handle comparing a snapshot with current content.
   * スナップショットを現在の内容と比較する。
   */
  const handleCompare = useCallback(
    async (snapshot: SnapshotEntry) => {
      try {
        setLoadingDiffId(snapshot.id);
        const historyService = getHistoryService();
        const snapshotContent = await historyService.getSnapshotContent(snapshot.id);

        if (snapshotContent === null) {
          setError("スナップショットの読み込みに失敗しました");
          return;
        }

        const label = `${formatTimeJa(snapshot.timestamp)} (${getSnapshotTypeLabel(snapshot.type)})`;
        onCompareInEditor?.({
          snapshotContent,
          currentContent,
          label,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(`差分の読み込みに失敗しました: ${message}`);
      } finally {
        setLoadingDiffId(null);
      }
    },
    [currentContent, onCompareInEditor]
  );

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-foreground-tertiary">
        <Loader2 className="w-6 h-6 animate-spin mb-2" />
        <p className="text-sm">履歴を読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header with create snapshot button */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-foreground-tertiary uppercase tracking-wide">
          履歴
        </h3>
        <button
          onClick={() => void handleCreateSnapshot()}
          disabled={creatingSnapshot}
          className={clsx(
            "flex items-center gap-1 px-2 py-1 text-xs font-medium rounded transition-colors",
            creatingSnapshot
              ? "bg-background text-foreground-muted cursor-wait border border-border"
              : "bg-accent text-accent-foreground hover:bg-accent-hover"
          )}
        >
          {creatingSnapshot ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Plus className="w-3 h-3" />
          )}
          スナップショット
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="bg-warning/10 border border-warning/30 rounded-lg p-3">
          <p className="text-xs text-warning">{error}</p>
          <button
            onClick={() => setError(null)}
            className="text-xs text-foreground-tertiary hover:text-foreground-secondary mt-1 underline"
          >
            閉じる
          </button>
        </div>
      )}

      {/* Empty state */}
      {snapshots.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <History className="w-8 h-8 text-foreground-muted mb-3" />
          <p className="text-sm font-medium text-foreground-secondary mb-1">
            履歴がありません
          </p>
          <p className="text-xs text-foreground-tertiary leading-relaxed">
            プロジェクトを保存すると、自動的に履歴が作成されます。
          </p>
        </div>
      )}

      {/* Snapshot list with date groups and pagination */}
      {snapshots.length > 0 && (
        <div className="space-y-3">
          {groupedSnapshots.map((group) => {
            const isCollapsed = collapsedGroups.has(group.label);
            const dailyStats = dailyDiffMap.get(group.label);
            const totalAdded = dailyStats?.added ?? 0;
            const totalRemoved = dailyStats?.removed ?? 0;

            return (
              <div key={group.label} className="space-y-2">
                {/* Date group header */}
                <button
                  onClick={() => toggleGroup(group.label)}
                  className="flex items-center gap-2 pt-1 w-full text-left hover:opacity-80 transition-opacity"
                >
                  {isCollapsed ? (
                    <ChevronRight className="w-3.5 h-3.5 text-foreground-tertiary flex-shrink-0" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-foreground-tertiary flex-shrink-0" />
                  )}
                  <span className="text-[11px] font-medium text-foreground-tertiary whitespace-nowrap">
                    {group.label}
                  </span>
                  <div className="flex-1 border-b border-border" />
                  {(totalAdded > 0 || totalRemoved > 0) && (
                    <span className="text-[10px] tabular-nums flex items-center gap-1.5 flex-shrink-0">
                      {totalAdded > 0 && (
                        <span className="text-success">+{totalAdded.toLocaleString()}</span>
                      )}
                      {totalRemoved > 0 && (
                        <span className="text-error">−{totalRemoved.toLocaleString()}</span>
                      )}
                    </span>
                  )}
                </button>

                {/* Snapshots within this date group */}
                {!isCollapsed && group.snapshots.map((snapshot) => (
                  <SnapshotItem
                    key={snapshot.id}
                    snapshot={snapshot}
                    isRestoring={restoringId === snapshot.id}
                    onRestore={handleRestore}
                    onCompare={handleCompare}
                    isLoadingDiff={loadingDiffId === snapshot.id}
                    diffStats={diffStatsMap.get(snapshot.id)}
                    isFirstVersion={snapshot.id === firstVersionId}
                    isBookmarked={bookmarkSet.has(snapshot.id)}
                    onToggleBookmark={handleToggleBookmark}
                  />
                ))}
              </div>
            );
          })}

          {/* Load more button */}
          {hasMore && (
            <button
              onClick={handleLoadMore}
              className="w-full flex items-center justify-center gap-1 px-3 py-2 text-xs font-medium rounded transition-colors bg-background-secondary text-foreground-tertiary hover:text-foreground-secondary hover:bg-hover border border-border"
            >
              もっと読み込む ({snapshots.length - displayCount}件)
            </button>
          )}
        </div>
      )}

      {/* Restore confirmation dialog */}
      <ConfirmDialog
        isOpen={restoreConfirm !== null}
        title="スナップショットの復元"
        message="この時点の内容に戻しますか？現在の内容は失われます。"
        confirmLabel="復元する"
        cancelLabel="キャンセル"
        onConfirm={() => {
          if (restoreConfirm) {
            void executeRestore(restoreConfirm);
          }
          setRestoreConfirm(null);
        }}
        onCancel={() => setRestoreConfirm(null)}
      />
    </div>
  );
}

