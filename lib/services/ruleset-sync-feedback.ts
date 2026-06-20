/**
 * 校正ルールセット `sync()`（全公式ルールセットの差分ダウンロード）の共有トースト表示。
 *
 * 同じ `sync()` を呼ぶ経路が 2 つある:
 * - 起動時自動更新 / 手動「更新」ボタン … `startup-checks/ruleset-update-check.ts`
 * - 設定「すべて更新」/ 再ダウンロード … `useRulesetStatus.sync()`
 *
 * どちらも進捗トースト → 完了サマリーという同じ UX を出すべきなので、メッセージと
 * 要約ロジックをここに集約する（#1838: 設定側ボタンがトーストを出さない退行の修正）。
 */
import { notificationManager } from "./notification-manager";

export const RULESET_SYNC_PROGRESS_MESSAGE = "校正ルールセットを更新中...";

interface RulesetSyncResultLike {
  status: "installed" | "up-to-date" | "skipped" | "error";
}

/**
 * 進捗トーストを表示し、`id` を返す。完了後に `dismiss(id)` すること。
 */
export function showRulesetSyncProgress(): string {
  return notificationManager.showMessage(RULESET_SYNC_PROGRESS_MESSAGE, {
    type: "info",
    duration: 0,
  });
}

/**
 * `sync()` の結果を要約してトーストを出す。1 件も更新が無ければ静かに閉じる。
 */
export function notifyRulesetSyncSummary(
  summary: readonly RulesetSyncResultLike[] | undefined,
): void {
  const installed = Array.isArray(summary)
    ? summary.filter((s) => s.status === "installed").length
    : 0;
  const failed = Array.isArray(summary) ? summary.filter((s) => s.status === "error").length : 0;
  if (failed > 0) {
    notificationManager.warning(
      `校正ルールセットを更新しました（${installed} 件）。${failed} 件は失敗しました。`,
    );
  } else if (installed > 0) {
    notificationManager.success(`校正ルールセットを更新しました（${installed} 件）。`);
  }
}

/**
 * `sync()` の失敗をエラートーストで表示する。
 */
export function notifyRulesetSyncError(err: unknown): void {
  notificationManager.error(
    `校正ルールセットの更新に失敗しました：${err instanceof Error ? err.message : String(err)}`,
  );
}
