"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Pin, Plus, RotateCcw, Loader2, History, Bookmark, GitCompare, MoreVertical, ChevronDown, ChevronRight } from "lucide-react";
import clsx from "clsx";
import { getHistoryService } from "@/lib/history-service";

import type { SnapshotEntry, SnapshotType } from "@/lib/history-service";

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
// Utility Functions
// -----------------------------------------------------------------------

/** Day-of-week names in Japanese (日〜土) */
const DAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"] as const;

/**
 * Extract a YYYY-MM-DD date key from a timestamp for grouping.
 * タイムスタンプからグルーピング用の日付キー (YYYY-MM-DD) を抽出する。
 */
function getDateKey(timestamp: number): string {
  const d = new Date(timestamp);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Format a date key into a Japanese group label.
 * 日付キーを日本語のグループラベルにフォーマットする。
 * - 今日 / 昨日 for recent dates
 * - M月D日（曜日） for current year
 * - YYYY年M月D日（曜日） for older years
 */
function formatDateGroupLabel(dateKey: string): string {
  const today = new Date();
  const todayKey = getDateKey(today.getTime());

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = getDateKey(yesterday.getTime());

  if (dateKey === todayKey) return "今日";
  if (dateKey === yesterdayKey) return "昨日";

  const [yearStr, monthStr, dayStr] = dateKey.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const d = new Date(year, month - 1, day);
  const dow = DAY_NAMES[d.getDay()];

  if (year === today.getFullYear()) {
    return `${month}月${day}日（${dow}）`;
  }
  return `${year}年${month}月${day}日（${dow}）`;
}

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

/**
 * Format a timestamp as time only (HH:mm).
 * タイムスタンプを時刻のみ (HH:mm) にフォーマットする。
 */
function formatTimeJa(timestamp: number): string {
  const date = new Date(timestamp);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

/**
 * Get the Japanese label for a snapshot type.
 * スナップショットタイプの日本語ラベルを取得する。
 */
function getSnapshotTypeLabel(type: SnapshotType): string {
  switch (type) {
    case "auto":
      return "自動保存";
    case "manual":
      return "手動保存";
    case "milestone":
      return "マイルストーン";
  }
}

/**
 * Get the CSS classes for a snapshot type badge.
 * スナップショットタイプのバッジ用CSSクラスを取得する。
 */
function getSnapshotTypeBadgeClass(type: SnapshotType): string {
  switch (type) {
    case "auto":
      return "bg-foreground-muted/20 text-foreground-secondary";
    case "manual":
      return "bg-info/20 text-info";
    case "milestone":
      return "bg-accent/20 text-accent";
  }
}

// -----------------------------------------------------------------------
// Diff Stats
// -----------------------------------------------------------------------

interface DiffStats {
  added: number;
  removed: number;
  addedText: string;
  removedText: string;
}

/**
 * Compute approximate character-level additions and removals
 * by matching common prefix and suffix between two strings.
 * O(n) time, no external library required.
 *
 * 共通の接頭辞と接尾辞を照合して文字レベルの追加・削除数を近似計算する。
 */
function computeDiffStats(oldText: string, newText: string): DiffStats {
  const oldLen = oldText.length;
  const newLen = newText.length;
  const minLen = Math.min(oldLen, newLen);

  let prefixLen = 0;
  while (prefixLen < minLen && oldText[prefixLen] === newText[prefixLen]) {
    prefixLen++;
  }

  let suffixLen = 0;
  const maxSuffix = minLen - prefixLen;
  while (
    suffixLen < maxSuffix &&
    oldText[oldLen - 1 - suffixLen] === newText[newLen - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  const removedStart = prefixLen;
  const removedEnd = oldLen - suffixLen;
  const addedStart = prefixLen;
  const addedEnd = newLen - suffixLen;

  const removedText = oldText.slice(removedStart, removedEnd);
  const addedText = newText.slice(addedStart, addedEnd);

  return {
    added: addedText.length,
    removed: removedText.length,
    addedText,
    removedText,
  };
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
   * Handle snapshot restoration with confirmation dialog.
   * 確認ダイアログ付きでスナップショットの復元を処理する。
   */
  const handleRestore = useCallback(
    async (snapshot: SnapshotEntry) => {
      const confirmed = window.confirm(
        "この時点の内容に戻しますか？現在の内容は失われます。"
      );
      if (!confirmed) return;

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
              : "bg-accent text-white hover:bg-accent-hover"
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
    </div>
  );
}

// -----------------------------------------------------------------------
// SnapshotItem sub-component
// -----------------------------------------------------------------------

interface SnapshotItemProps {
  snapshot: SnapshotEntry;
  isRestoring: boolean;
  onRestore: (snapshot: SnapshotEntry) => void;
  onCompare: (snapshot: SnapshotEntry) => void;
  isLoadingDiff: boolean;
  diffStats?: DiffStats;
  isFirstVersion: boolean;
  isBookmarked: boolean;
  onToggleBookmark: (snapshotId: string) => void;
}

function SnapshotItem({ snapshot, isRestoring, onRestore, onCompare, isLoadingDiff, diffStats, isFirstVersion, isBookmarked, onToggleBookmark }: SnapshotItemProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  return (
    <div className="bg-background-secondary rounded-lg p-3 border border-border">
      {/* Row 1: Time + type badge + char count */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-semibold tabular-nums text-foreground">
            {formatTimeJa(snapshot.timestamp)}
          </span>
          <span
            className={clsx(
              "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0",
              getSnapshotTypeBadgeClass(snapshot.type)
            )}
          >
            {snapshot.type === "milestone" && (
              <Pin className="w-2.5 h-2.5" />
            )}
            {getSnapshotTypeLabel(snapshot.type)}
          </span>
        </div>
        <span className="text-[10px] text-foreground-tertiary tabular-nums flex-shrink-0">
          {snapshot.characterCount.toLocaleString()}文字
        </span>
      </div>

      {/* Milestone label */}
      {snapshot.label && (
        <p className="text-xs font-medium text-foreground-secondary mb-1">
          {snapshot.label}
        </p>
      )}

      {/* Row 2: Diff indicator + actions */}
      <div className="flex items-end justify-between">
        <DiffIndicator diffStats={diffStats} isFirstVersion={isFirstVersion} />

        <div className="flex items-center gap-0.5 flex-shrink-0">
          {/* Bookmark button */}
          <button
            onClick={() => onToggleBookmark(snapshot.id)}
            className={clsx(
              "p-1 rounded transition-colors",
              isBookmarked
                ? "text-accent"
                : "text-foreground-tertiary hover:text-accent hover:bg-hover"
            )}
            title={isBookmarked ? "ブックマークを解除" : "ブックマークに追加"}
          >
            <Bookmark className="w-3.5 h-3.5" fill={isBookmarked ? "currentColor" : "none"} />
          </button>

          {/* Three-dot menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="p-1 rounded transition-colors text-foreground-tertiary hover:text-foreground-secondary hover:bg-hover"
              title="メニュー"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 bottom-full mb-1 z-10 min-w-[120px] rounded-lg border border-border bg-background-secondary shadow-lg py-1">
                <button
                  onClick={() => { setMenuOpen(false); onRestore(snapshot); }}
                  disabled={isRestoring}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] font-medium text-foreground-secondary hover:bg-hover transition-colors disabled:opacity-50"
                >
                  {isRestoring ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="w-3.5 h-3.5" />
                  )}
                  復元
                </button>
                <button
                  onClick={() => { setMenuOpen(false); onCompare(snapshot); }}
                  disabled={isLoadingDiff}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] font-medium text-foreground-secondary hover:bg-hover transition-colors disabled:opacity-50"
                >
                  {isLoadingDiff ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <GitCompare className="w-3.5 h-3.5" />
                  )}
                  比較
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------
// DiffIndicator sub-component
// -----------------------------------------------------------------------

/** Total number of signs (+/−) in the git-style bar */
const TOTAL_SIGNS = 5;

interface DiffIndicatorProps {
  diffStats?: DiffStats;
  isFirstVersion: boolean;
}

/**
 * Git-style proportional diff bar with separate addition/removal lines.
 * 前のバージョンとの差分を git 風の +/− バーで比率表示する。
 *
 * Example output:
 *   +++++ +68
 *   −−    −10
 */
function DiffIndicator({ diffStats, isFirstVersion }: DiffIndicatorProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  if (isFirstVersion) {
    return (
      <span className="text-[10px] tabular-nums text-foreground-tertiary">
        初版
      </span>
    );
  }

  if (!diffStats) return null;

  const { added, removed, addedText, removedText } = diffStats;

  if (added === 0 && removed === 0) {
    return (
      <span className="text-[10px] tabular-nums text-foreground-tertiary">
        変更なし
      </span>
    );
  }

  const total = added + removed;
  let plusCount: number;
  let minusCount: number;

  if (added > 0 && removed > 0) {
    // Split proportionally, ensure at least 1 each
    plusCount = Math.max(1, Math.round((added / total) * TOTAL_SIGNS));
    minusCount = TOTAL_SIGNS - plusCount;
    if (minusCount < 1) {
      minusCount = 1;
      plusCount = TOTAL_SIGNS - 1;
    }
  } else if (added > 0) {
    plusCount = TOTAL_SIGNS;
    minusCount = 0;
  } else {
    plusCount = 0;
    minusCount = TOTAL_SIGNS;
  }

  // Build tooltip content showing actual changes
  const MAX_PREVIEW_LEN = 80;

  return (
    <div
      className="relative flex flex-col gap-0 cursor-help"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {added > 0 && (
        <div className="flex items-center gap-1">
          <span className="text-[11px] font-mono leading-tight text-success">
            {"+".repeat(plusCount)}
          </span>
          <span className="text-[10px] tabular-nums text-success">
            {added.toLocaleString()}
          </span>
        </div>
      )}
      {removed > 0 && (
        <div className="flex items-center gap-1">
          <span className="text-[11px] font-mono leading-tight text-error">
            {"\u2212".repeat(minusCount)}
          </span>
          <span className="text-[10px] tabular-nums text-error">
            {removed.toLocaleString()}
          </span>
        </div>
      )}

      {/* Custom tooltip */}
      {showTooltip && (
        <div className="absolute left-0 bottom-full mb-2 z-20 min-w-[200px] max-w-[300px] p-2 rounded-lg bg-background-secondary border border-border shadow-lg text-[11px] leading-relaxed pointer-events-none">
          {removed > 0 && (
            <div className="mb-1">
              <div className="text-error whitespace-pre-wrap break-words line-through">
                {removedText.length > MAX_PREVIEW_LEN
                  ? removedText.slice(0, MAX_PREVIEW_LEN) + "…"
                  : removedText}
              </div>
            </div>
          )}
          {added > 0 && (
            <div>
              <div className="text-success whitespace-pre-wrap break-words">
                {addedText.length > MAX_PREVIEW_LEN
                  ? addedText.slice(0, MAX_PREVIEW_LEN) + "…"
                  : addedText}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
