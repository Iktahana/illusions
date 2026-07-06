/**
 * Startup check: installed Japanese dictionary (Genji) is corrupt.
 *
 * Electron-only (no local DB on web). When {@link getDictAccess}'s health
 * resolves to "corrupt" — the DB file exists but failed a fast integrity check
 * (truncated download, bad header, missing table) — surface a warning that
 * offers to re-download. This runs alongside {@link dictUpdateCheck}; the
 * corrupt state takes precedence conceptually (a corrupt DB answers no queries).
 *
 * WiFi 等の非従量回線かつ省電力 OFF のときは、3 秒カウントダウンで自動的に
 * 再ダウンロードを開始する（#1639 follow-up）。それ以外は手動ボタンのみ。
 */
import { getDictAccess } from "@/lib/dict/dict-access";
import {
  isAutoDownloadAllowed,
  runDictDownloadWithProgress,
  startCountdownDownload,
} from "./dict-auto-download";
import type { StartupCheck, StartupNotice } from "../startup-check-queue";

interface ElectronDictApi {
  download?: () => Promise<unknown>;
}

function getElectronDict(): ElectronDictApi | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { electronAPI?: { dict?: ElectronDictApi } }).electronAPI?.dict;
}

const REDOWNLOAD_MESSAGE = "辞書を再ダウンロード中...";
const CORRUPT_DOWNLOAD_KEY = "dict-corrupt";

export const dictCorruptCheck: StartupCheck = {
  id: "dict-corrupt",
  async evaluate(): Promise<StartupNotice | null> {
    // Electron-only feature; the browser has no local dictionary file.
    if (!getElectronDict()) return null;

    const health = await getDictAccess().getHealth();
    if (health.state !== "corrupt") return null;

    // 回線・省電力が許せば 3 秒カウントダウンで自動再ダウンロード。
    // その場合トーストはカウントダウン側が出すので、ここでは notice を返さない。
    if (await isAutoDownloadAllowed()) {
      startCountdownDownload({
        key: CORRUPT_DOWNLOAD_KEY,
        seconds: 3,
        buildMessage: (remaining) =>
          `辞書データが破損しています。${remaining} 秒後に自動で再ダウンロードします。`,
        downloadMessage: REDOWNLOAD_MESSAGE,
      });
      return null;
    }

    // 自動ダウンロード不可（オフライン/従量回線/省電力中）。手動ボタンのみ提示。
    return {
      id: "dict-corrupt",
      type: "warning",
      message: health.message ?? "辞書データが破損しています。再ダウンロードしてください。",
      duration: 0, // keep until dismissed
      actions: [
        {
          label: "再ダウンロード",
          onClick: () => runDictDownloadWithProgress(REDOWNLOAD_MESSAGE, CORRUPT_DOWNLOAD_KEY),
        },
      ],
    };
  },
};
