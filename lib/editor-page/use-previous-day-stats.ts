"use client";

import { useState, useEffect } from "react";
import { getHistoryService } from "@/lib/services/history-service";

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
 * Find the last snapshot from the most recent day before today.
 * Returns the latest snapshot entry from that day, or null if none exists.
 *
 * 今日より前の最新日のスナップショットを探す。
 * その日の最後のスナップショットを返す。存在しない場合はnull。
 */
function findPreviousDaySnapshot(snapshots: SnapshotEntry[]): SnapshotEntry | null {
  const todayKey = getDateKey(Date.now());

  // Snapshots are sorted newest-first
  for (const snapshot of snapshots) {
    const key = getDateKey(snapshot.timestamp);
    if (key !== todayKey) {
      // This is the latest snapshot from a previous day — use it
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
          setStats({
            charCount: prevSnapshot.characterCount,
            timestamp: prevSnapshot.timestamp,
          });
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
