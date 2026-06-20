/**
 * Startup check: 校正ルールセット（公式）の更新確認。
 *
 * 公式ルールセットの配信は Electron 専用（web には `electronAPI.rulesets` が無い）。
 * ブラウザでは何もしない。
 *
 * 動作（辞書の dict-update-check を踏襲、ただしルールセットの資産は数 KB と軽量なので
 * 回線種別・省電力ゲートは設けず、更新があれば即適用する）:
 * - `checkUpdate()`（IPC `rulesets:check-update`）で各公式ルールセットの最新タグ vs
 *   インストール済みタグを比較し、更新ありの件数を得る。
 * - 自動更新が ON（AppState `rulesetAutoUpdate` が `false` 以外。既定 ON）なら、進捗トースト
 *   付きで `sync()` を実行して自動適用する。トーストは下の `runRulesetSync` が出すので
 *   notice は返さない。
 * - 自動更新が OFF のときは「更新があります」トーストに「更新」ボタンを付けて手動適用させる。
 *
 * ネットワーク失敗は握り潰し、起動を妨げない（エラートーストも出さない）。
 */
import { getStorageService } from "@/lib/storage/storage-service";
import { notificationManager } from "../notification-manager";
import type { StartupCheck, StartupNotice } from "../startup-check-queue";

interface RulesetUpdateInfo {
  id: string;
  updateAvailable?: boolean;
  error?: string;
}

interface RulesetSyncResult {
  id: string;
  status: "installed" | "up-to-date" | "skipped" | "error";
  detail?: string;
}

interface ElectronRulesetsApi {
  checkUpdate?: () => Promise<RulesetUpdateInfo[]>;
  sync?: () => Promise<RulesetSyncResult[]>;
}

function getElectronRulesets(): ElectronRulesetsApi | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { electronAPI?: { rulesets?: ElectronRulesetsApi } }).electronAPI
    ?.rulesets;
}

const SYNC_MESSAGE = "校正ルールセットを更新中...";

/**
 * `sync()`（全公式ルールセットの差分ダウンロード）を進捗トースト付きで実行する。
 * 自動更新・手動「更新」ボタンの両方から使う。完了時にインストール件数を要約表示し、
 * 1 件も更新が無ければ静かに閉じる。worker への再読み込みは main 側の `changed`
 * イベント → subscribeRulesetChanges が担うため、ここでは行わない。
 */
export function runRulesetSync(): void {
  const api = getElectronRulesets();
  if (!api?.sync) return;

  const progressId = notificationManager.showMessage(SYNC_MESSAGE, {
    type: "info",
    duration: 0,
  });

  api
    .sync()
    .then((summary) => {
      notificationManager.dismiss(progressId);
      const installed = Array.isArray(summary)
        ? summary.filter((s) => s.status === "installed").length
        : 0;
      const failed = Array.isArray(summary)
        ? summary.filter((s) => s.status === "error").length
        : 0;
      if (failed > 0) {
        notificationManager.warning(
          `校正ルールセットを更新しました（${installed} 件）。${failed} 件は失敗しました。`,
        );
      } else if (installed > 0) {
        notificationManager.success(`校正ルールセットを更新しました（${installed} 件）。`);
      }
    })
    .catch((err: unknown) => {
      notificationManager.dismiss(progressId);
      console.warn("[ruleset-update-check] sync failed:", err);
      notificationManager.error(
        `校正ルールセットの更新に失敗しました：${err instanceof Error ? err.message : String(err)}`,
      );
    });
}

export const rulesetUpdateCheck: StartupCheck = {
  id: "ruleset-update",
  async evaluate(): Promise<StartupNotice | null> {
    const api = getElectronRulesets();
    // Electron 専用機能。web には公式ルールセットの配信が無い。
    if (!api?.checkUpdate) return null;

    // 最新タグ vs インストール済みタグ（ダウンロードはしない）。
    // ネットワーク/IPC エラーは握り潰して起動を妨げない。
    let results: RulesetUpdateInfo[];
    try {
      results = await api.checkUpdate();
    } catch (err) {
      console.warn("[ruleset-update-check] update check failed (network?):", err);
      return null;
    }

    const updatable = Array.isArray(results)
      ? results.filter((r) => r.updateAvailable === true)
      : [];
    if (updatable.length === 0) return null;

    // 自動更新の設定（AppState `rulesetAutoUpdate`）。既定 ON のため、明示的に
    // `false` のときだけ無効扱い。読めない場合は安全側で ON 扱い。
    let autoUpdate = true;
    try {
      const appState = await getStorageService().loadAppState();
      if (appState?.rulesetAutoUpdate === false) autoUpdate = false;
    } catch {
      // 設定が読めない場合は既定（ON）のまま。
    }

    if (autoUpdate) {
      // 軽量資産なのでカウントダウンを挟まず即適用。トーストは runRulesetSync が出す。
      runRulesetSync();
      return null;
    }

    // 自動更新 OFF。手動適用のためのトーストを出す。
    return {
      id: "ruleset-update-available",
      type: "info",
      message: `校正ルールセットに更新があります（${updatable.length} 件）。`,
      duration: 0, // 手動で閉じるまで保持
      actions: [{ label: "更新", onClick: () => runRulesetSync() }],
    };
  },
};
