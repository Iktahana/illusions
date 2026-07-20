/**
 * 辞書（幻辞）の自動ダウンロード共通ロジック。
 *
 * dict-corrupt-check / dict-update-check の両方から使う:
 * - {@link isAutoDownloadAllowed} — 無人での ~526MB ダウンロードを許してよい回線か
 *   （WiFi 等の非従量回線・データセーバー OFF・省電力モード OFF）を判定する。
 * - {@link runDictDownloadWithProgress} — 実際のダウンロードを進捗トーストつきで実行。
 * - {@link startCountdownDownload} — 「あと N 秒で自動ダウンロード」のキャンセル可能な
 *   カウントダウントーストを表示し、0 で自動的にダウンロードを開始する。
 *
 * すべて Electron 専用（web には electronAPI.dict が無い）。
 */
import { getDictAccess } from "@/lib/dict/dict-access";
import { getStorageService } from "@/lib/storage/storage-service";
import { notificationManager } from "../notification-manager";
import type { NotificationAction } from "@/types/notification";

interface DictDownloadResult {
  success: boolean;
  version?: string;
  error?: string;
}

interface ElectronDictApi {
  download?: () => Promise<DictDownloadResult | undefined>;
  onDownloadProgress?: (cb: (data: { progress: number }) => void) => () => void;
}

/** Network Information API（Chromium）の最小型。lib.dom に型が無いため自前定義。 */
interface NetworkInformationLike {
  type?: string;
  saveData?: boolean;
  effectiveType?: string;
}

function getElectronDict(): ElectronDictApi | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { electronAPI?: { dict?: ElectronDictApi } }).electronAPI?.dict;
}

/**
 * 無人での自動ダウンロードを許可してよいか。
 *
 * 重い辞書（~526MB）を従量回線や省電力中に勝手に落とさないためのゲート。
 * 判定材料（取得できないものは "安全側=許可" に倒す。確実に危険なときだけ拒否）:
 * - オフライン（navigator.onLine === false）→ 拒否
 * - セルラー回線（connection.type === "cellular"）→ 拒否（従量の可能性大）
 * - OS データセーバー（connection.saveData === true）→ 拒否
 * - アプリの省電力（節流）モード ON → 拒否
 */
export async function isAutoDownloadAllowed(): Promise<boolean> {
  if (typeof navigator !== "undefined") {
    if (navigator.onLine === false) return false;

    const connection = (navigator as Navigator & { connection?: NetworkInformationLike })
      .connection;
    if (connection) {
      // type が取れる環境（"wifi"/"ethernet"/"cellular"/"none"/"unknown" …）では
      // セルラーのみ拒否。desktop では "unknown"/undefined が多いので許可側に倒す。
      if (connection.type === "cellular" || connection.type === "none") return false;
      if (connection.saveData === true) return false;
    }
  }

  // アプリの省電力（節流）モード中は重いダウンロードを自動起動しない。
  try {
    const appState = await getStorageService().loadAppState();
    if (appState?.powerSaveMode === true) return false;
  } catch {
    // 設定が読めない場合は判断材料が無いので、他の条件のみで許可する。
  }

  return true;
}

const DEFAULT_DOWNLOAD_KEY = "dict-download";
const activeDownloadKeys = new Set<string>();

/**
 * 辞書ダウンロードを進捗トーストつきで実行する（手動ボタン・カウントダウン共通）。
 * 既定 UA の Chromium と同様、進捗 95% 以降は「展開中」に切り替える。
 */
function runDictDownloadWithProgressInternal(
  startMessage: string,
  key: string,
  alreadyActive: boolean,
): void {
  if (!alreadyActive) {
    if (activeDownloadKeys.has(key)) return;
    activeDownloadKeys.add(key);
  }

  const dict = getElectronDict();
  if (!dict?.download) {
    activeDownloadKeys.delete(key);
    return;
  }

  const progressId = notificationManager.showProgress(startMessage, { type: "info" });
  const cleanup = dict.onDownloadProgress?.(({ progress }) => {
    notificationManager.updateProgress(
      progressId,
      progress,
      progress < 95 ? startMessage : "辞書を展開中...",
    );
  });

  let downloadPromise: Promise<DictDownloadResult | undefined>;
  try {
    downloadPromise = dict.download();
  } catch (e: unknown) {
    console.warn("[dict] auto download failed:", e);
    notificationManager.dismiss(progressId);
    notificationManager.error(
      `辞書のダウンロードに失敗しました：${e instanceof Error ? e.message : String(e)}`,
    );
    cleanup?.();
    activeDownloadKeys.delete(key);
    return;
  }

  downloadPromise
    .then((result) => {
      if (result?.success === false) {
        notificationManager.dismiss(progressId);
        notificationManager.error(
          `辞書のダウンロードに失敗しました：${result.error ?? "不明なエラー"}`,
        );
      } else {
        // updateProgress(100) は 3 秒後に自動クローズする。最終イベントが
        // 100 未満で coalesce された場合に備えて明示的に 100 にする。
        notificationManager.updateProgress(progressId, 100, "辞書のダウンロードが完了しました");
        // 新鮮な DB になったので "corrupt" ヘルス・負ルックアップのキャッシュを破棄。
        getDictAccess().invalidate();
      }
    })
    .catch((e: unknown) => {
      console.warn("[dict] auto download failed:", e);
      notificationManager.dismiss(progressId);
      notificationManager.error(
        `辞書のダウンロードに失敗しました：${e instanceof Error ? e.message : String(e)}`,
      );
    })
    .finally(() => {
      cleanup?.();
      activeDownloadKeys.delete(key);
    });
}

export function runDictDownloadWithProgress(
  startMessage = "辞書をダウンロード中...",
  key = DEFAULT_DOWNLOAD_KEY,
): void {
  runDictDownloadWithProgressInternal(startMessage, key, false);
}

interface CountdownOptions {
  /** 重複起動を防ぐための安定キー（未指定時は辞書ダウンロード共通キー）。 */
  key?: string;
  /** カウントダウン秒数（未導入/破損は 3、更新は 30 を想定）。 */
  seconds: number;
  /** 残り秒数からトースト本文を生成する。 */
  buildMessage: (remaining: number) => string;
  /** ダウンロード進捗トーストの開始メッセージ。 */
  downloadMessage: string;
}

/**
 * キャンセル可能なカウントダウントーストを表示し、0 で自動ダウンロードを開始する。
 * 「今すぐ」で即時開始、「キャンセル」で中止できる。
 */
export function startCountdownDownload(options: CountdownOptions): void {
  const key = options.key ?? DEFAULT_DOWNLOAD_KEY;
  if (activeDownloadKeys.has(key)) return;
  activeDownloadKeys.add(key);

  let remaining = options.seconds;
  // 開閉アクションが id/timer を先に参照する（カウントダウン開始前にクロージャを
  // 生成する）ため、可変ホルダーに保持する。
  const ctl: { id: string; timer: ReturnType<typeof setInterval> | null } = {
    id: "",
    timer: null,
  };
  let downloadStarted = false;

  const stop = (): void => {
    if (downloadStarted) return;
    if (ctl.timer !== null) clearInterval(ctl.timer);
    notificationManager.dismiss(ctl.id);
    activeDownloadKeys.delete(key);
  };
  const startNow = (): void => {
    if (downloadStarted) return;
    downloadStarted = true;
    if (ctl.timer !== null) clearInterval(ctl.timer);
    notificationManager.dismiss(ctl.id);
    runDictDownloadWithProgressInternal(options.downloadMessage, key, true);
  };
  const actions = (): NotificationAction[] => [
    { label: "今すぐ", onClick: startNow },
    { label: "キャンセル", onClick: stop },
  ];

  ctl.id = notificationManager.showMessage(options.buildMessage(remaining), {
    type: "info",
    duration: 0, // カウントダウン中は自動クローズしない
    actions: actions(),
  });

  ctl.timer = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      startNow();
      return;
    }
    notificationManager.updateMessage(ctl.id, options.buildMessage(remaining), actions());
  }, 1000);
}
