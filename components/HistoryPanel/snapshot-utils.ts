import type { SnapshotType } from "@/lib/services/history-service";

/** Day-of-week names in Japanese (日〜土) */
const DAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"] as const;

/**
 * Extract a YYYY-MM-DD date key from a timestamp for grouping.
 * タイムスタンプからグルーピング用の日付キー (YYYY-MM-DD) を抽出する。
 */
export function getDateKey(timestamp: number): string {
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
export function formatDateGroupLabel(dateKey: string): string {
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

/**
 * Format a timestamp as time only, respecting the user's locale and
 * 12/24-hour preference from the browser.
 */
export function formatTimeJa(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Get the Japanese label for a snapshot type.
 * スナップショットタイプの日本語ラベルを取得する。
 */
export function getSnapshotTypeLabel(type: SnapshotType): string {
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
export function getSnapshotTypeBadgeClass(type: SnapshotType): string {
  switch (type) {
    case "auto":
      return "bg-foreground-muted/20 text-foreground-secondary";
    case "manual":
      return "bg-info/20 text-info";
    case "milestone":
      return "bg-accent/20 text-accent";
  }
}
