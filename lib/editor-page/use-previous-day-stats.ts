"use client";

import { useState, useEffect } from "react";
import { getHistoryService } from "@/lib/services/history-service";
import { chars } from "@/lib/editor-page/types";

import type { SnapshotEntry } from "@/lib/services/history-service";

/**
 * Previous day comparison data.
 * 前日比較データ。
 */
export interface PreviousDayStats {
  /** Character count from the last snapshot of the previous day */
  charCount: number;
  /** Timestamp of the reference snapshot */
  timestamp: number;
}

/**
 * Get the date key (YYYY-MM-DD) for a timestamp in local timezone.
 */
function getDateKey(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Find the last snapshot from yesterday.
 * Returns the latest snapshot entry from yesterday, or null if none exists.
 *
 * 昨日のスナップショットを探す。
 * 昨日の最後のスナップショットを返す。存在しない場合はnull。
 */
function findPreviousDaySnapshot(snapshots: SnapshotEntry[]): SnapshotEntry | null {
  const now = new Date();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const yesterdayKey = getDateKey(yesterday.getTime());

  // Snapshots are sorted newest-first
  for (const snapshot of snapshots) {
    const key = getDateKey(snapshot.timestamp);
    if (key === yesterdayKey) {
      return snapshot;
    }
  }

  return null;
}

/**
 * Hook to fetch previous day's character count for comparison.
 * Uses the history service to find the last snapshot from the most recent
 * day before today.
 *
 * 前日の文字数を取得するフック。
 * 履歴サービスから今日以前の最新スナップショットを取得する。
 *
 * @param sourceFile - Source file name to filter snapshots (e.g. "main.mdi")
 * @param enabled - Whether the hook should fetch data (requires project mode)
 */
export function usePreviousDayStats(
  sourceFile: string | undefined,
  enabled: boolean,
): PreviousDayStats | null {
  const [stats, setStats] = useState<PreviousDayStats | null>(null);

  useEffect(() => {
    if (!enabled || !sourceFile) {
      setStats(null);
      return;
    }

    let cancelled = false;

    async function fetchPreviousDayStats(): Promise<void> {
      try {
        const historyService = getHistoryService();
        const snapshots = await historyService.getSnapshots(sourceFile);
        if (cancelled) return;

        const prevSnapshot = findPreviousDaySnapshot(snapshots);
        if (prevSnapshot) {
          // Load snapshot content and count with chars() (whitespace-stripped)
          // to match StatsPanel's charCount calculation
          const content = await historyService.getSnapshotContent(prevSnapshot.id);
          if (cancelled) return;

          if (content !== null) {
            setStats({
              charCount: chars(content),
              timestamp: prevSnapshot.timestamp,
            });
          } else {
            setStats(null);
          }
        } else {
          setStats(null);
        }
      } catch (error) {
        console.error("Failed to fetch previous day stats:", error);
        if (!cancelled) {
          setStats(null);
        }
      }
    }

    void fetchPreviousDayStats();

    return () => {
      cancelled = true;
    };
  }, [sourceFile, enabled]);

  return stats;
}
