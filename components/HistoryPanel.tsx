"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Clock, Pin, Plus, RotateCcw, Loader2, History, Star, GitCompare } from "lucide-react";
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
 * Format a file size in human-readable format.
 * ファイルサイズを人間が読みやすい形式にフォーマットする。
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
  const [isLoadingDiff, setIsLoadingDiff] = useState(false);

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

  /**
   * Grouped snapshots based on current pagination.
   * ページネーションに基づき、日付ごとにグループ化されたスナップショット。
   */
  const groupedSnapshots = useMemo(
    () => groupSnapshotsByDate(snapshots.slice(0, displayCount)),
    [snapshots, displayCount]
  );

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
        setIsLoadingDiff(true);
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
        setIsLoadingDiff(false);
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
          スナップショットを作成
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
          {groupedSnapshots.map((group) => (
            <div key={group.label} className="space-y-2">
              {/* Date group header */}
              <div className="flex items-center gap-2 pt-1">
                <span className="text-[11px] font-medium text-foreground-tertiary whitespace-nowrap">
                  {group.label}
                </span>
                <div className="flex-1 border-b border-border" />
              </div>

              {/* Snapshots within this date group */}
              {group.snapshots.map((snapshot) => (
                <SnapshotItem
                  key={snapshot.id}
                  snapshot={snapshot}
                  isRestoring={restoringId === snapshot.id}
                  onRestore={handleRestore}
                  onCompare={handleCompare}
                  isLoadingDiff={isLoadingDiff}
                />
              ))}
            </div>
          ))}

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
}

function SnapshotItem({ snapshot, isRestoring, onRestore, onCompare, isLoadingDiff }: SnapshotItemProps) {
  return (
    <div className="bg-background-secondary rounded-lg p-3 border border-border">
      {/* Timestamp and type badge */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Clock className="w-3.5 h-3.5 text-foreground-tertiary flex-shrink-0" />
          <span className="text-xs font-medium text-foreground truncate">
            {formatTimeJa(snapshot.timestamp)}
            {snapshot.type === "auto" && (
              <span className="ml-1 text-[10px] text-foreground-tertiary">[自動]</span>
            )}
          </span>
        </div>
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

      {/* Milestone label */}
      {snapshot.label && (
        <p className="text-xs font-medium text-foreground-secondary mb-2 pl-5">
          {snapshot.label}
        </p>
      )}

      {/* Stats: character count and file size */}
      <div className="flex items-center gap-3 text-[10px] text-foreground-tertiary mb-2 pl-5">
        <span>{snapshot.characterCount.toLocaleString()}文字</span>
        <span>{formatFileSize(snapshot.fileSize)}</span>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 pl-5">
        <button
          onClick={() => onRestore(snapshot)}
          disabled={isRestoring}
          className={clsx(
            "flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded transition-colors",
            isRestoring
              ? "bg-background text-foreground-muted cursor-wait border border-border"
              : "bg-accent/10 text-accent hover:bg-accent/20 border border-accent/30"
          )}
        >
          {isRestoring ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <RotateCcw className="w-3 h-3" />
          )}
          復元
        </button>

        {/* Compare with current content */}
        <button
          onClick={() => onCompare(snapshot)}
          disabled={isLoadingDiff}
          className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded transition-colors bg-background text-foreground-tertiary hover:text-foreground-secondary hover:bg-hover border border-border"
          title="現在の内容と比較"
        >
          {isLoadingDiff ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <GitCompare className="w-3 h-3" />
          )}
          比較
        </button>

        {/* "Mark as milestone" button for auto snapshots */}
        {snapshot.type === "auto" && (
          <button
            className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded transition-colors bg-background text-foreground-tertiary hover:text-foreground-secondary hover:bg-hover border border-border"
            title="マイルストーンとしてマーク"
          >
            <Star className="w-3 h-3" />
            お気に入り
          </button>
        )}
      </div>
    </div>
  );
}
