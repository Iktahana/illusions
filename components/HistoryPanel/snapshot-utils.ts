/**
 * Snapshot UI utilities.
 *
 * Phase 5 shim: history backend が削除されたため、UI で使われる
 * フォーマット関数のみを最小限残置する。Phase 8 で履歴 UI を再構築する際に
 * 必要なら本実装に戻す。
 */

import type { SnapshotType } from "@/lib/services/history-service";

export function formatTimeJa(timestamp: number): string {
  if (!timestamp) return "";
  const d = new Date(timestamp);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd} ${hh}:${mi}`;
}

export function getSnapshotTypeLabel(type: SnapshotType): string {
  switch (type) {
    case "auto":
      return "自動";
    case "manual":
      return "手動";
    case "milestone":
      return "ﾏｲﾙｽﾄｰﾝ";
  }
}

export function getDateKey(timestamp: number): string {
  const d = new Date(timestamp);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function formatDateGroupLabel(dateKey: string): string {
  return dateKey;
}

export function getSnapshotTypeBadgeClass(type: SnapshotType): string {
  switch (type) {
    case "auto":
      return "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200";
    case "manual":
      return "bg-blue-200 text-blue-700 dark:bg-blue-700 dark:text-blue-200";
    case "milestone":
      return "bg-amber-200 text-amber-700 dark:bg-amber-700 dark:text-amber-200";
  }
}
