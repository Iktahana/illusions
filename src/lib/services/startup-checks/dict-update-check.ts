/**
 * Startup check: Japanese dictionary (Genji) not downloaded / update available.
 *
 * Local dictionary download is Electron-only. In the browser there is no
 * `electronAPI.dict`, and `getDownloadState` would report "not-installed" even
 * though local download isn't applicable — so we skip entirely on Web to avoid
 * a false "please download" toast.
 *
 * Update detection: `getStatus()` (IPC `dict:get-status`) only returns
 * `{ status, installedVersion }` — it never sets `updateAvailable` because it
 * does not hit the network. When the dictionary is installed we therefore call
 * `checkForUpdate()` (IPC `dict:check-update`) which fetches the GitHub Releases
 * API and returns `{ latestVersion, installedVersion, updateAvailable }`.
 * Network failures are swallowed so startup is never blocked by connectivity
 * problems and no error toast is surfaced.
 *
 * 自動化（#1639 follow-up）: WiFi 等の非従量回線かつ省電力 OFF のときは、
 * - 未導入   → 3 秒カウントダウンで自動ダウンロード
 * - 更新あり → 30 秒カウントダウンで自動更新
 * を行う。条件を満たさない場合は従来どおり手動ボタンのトーストを出す。
 */
import { getDictService } from "@/lib/dict/dict-service";
import { getStorageService } from "@/lib/storage/storage-service";
import {
  isAutoDownloadAllowed,
  runDictDownloadWithProgress,
  startCountdownDownload,
} from "./dict-auto-download";
import type { StartupCheck, StartupNotice } from "../startup-check-queue";

const GENJI_PROVIDER_ID = "genji";
const NOT_INSTALLED_DOWNLOAD_KEY = "dict-not-installed";
const UPDATE_DOWNLOAD_KEY = "dict-update";
const DOWNLOAD_MESSAGE = "辞書をダウンロード中...";
const UPDATE_MESSAGE = "辞書を更新中...";

interface ElectronDictApi {
  download?: () => Promise<unknown>;
  getStatus?: () => Promise<unknown>;
}

function getElectronDict(): ElectronDictApi | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { electronAPI?: { dict?: ElectronDictApi } }).electronAPI?.dict;
}

export const dictUpdateCheck: StartupCheck = {
  id: "dict-update",
  async evaluate(): Promise<StartupNotice | null> {
    // Electron-only feature; the browser has no local dictionary download.
    if (!getElectronDict()) return null;

    const state = await getDictService().getDownloadState(GENJI_PROVIDER_ID);

    if (state.status === "not-installed") {
      // 回線・省電力が許せば 3 秒カウントダウンで自動ダウンロード。
      if (await isAutoDownloadAllowed()) {
        startCountdownDownload({
          key: NOT_INSTALLED_DOWNLOAD_KEY,
          seconds: 3,
          buildMessage: (remaining) =>
            `日本語辞書が未ダウンロードです。${remaining} 秒後に自動でダウンロードします。`,
          downloadMessage: DOWNLOAD_MESSAGE,
        });
        return null;
      }
      return {
        id: "dict-not-installed",
        type: "warning",
        message:
          "日本語辞書が未ダウンロードです。ダウンロードすると校正と辞書引きがより正確になります。",
        duration: 0, // keep until dismissed
        actions: [
          {
            label: "今すぐダウンロード",
            onClick: () =>
              runDictDownloadWithProgress(DOWNLOAD_MESSAGE, NOT_INSTALLED_DOWNLOAD_KEY),
          },
        ],
      };
    }

    // Dictionary is installed (or in a transient state like downloading).
    // Only check for updates when idle — skip while a download is already running.
    if (state.status !== "installed") {
      return null;
    }

    // Respect the user's "起動時に更新を確認する" preference. The Electron main
    // process gates its own dictionary update check on the same AppState key
    // (`dictAutoCheckUpdates`); this renderer check must honor it too so we
    // never fire the network `checkForUpdate()` when auto-checking is OFF.
    // Default is enabled when the key is unset (treat only an explicit `false`
    // as disabled). This gate applies to the installed→update branch only — the
    // "not installed" warning above is always shown.
    const appState = await getStorageService().loadAppState();
    if (appState?.dictAutoCheckUpdates === false) {
      return null;
    }

    // `getStatus()` never sets updateAvailable — it does not hit the network.
    // Call checkForUpdate() to fetch the GitHub Releases API and get the real
    // update info. Swallow network/IPC errors to avoid blocking startup.
    let updateResult;
    try {
      updateResult = await getDictService().checkForUpdate(GENJI_PROVIDER_ID);
    } catch (err) {
      console.warn("[dict-update-check] update check failed (network?):", err);
      return null;
    }

    if (!updateResult?.updateAvailable) {
      return null;
    }

    const from = updateResult.installedVersion ?? "?";
    const to = updateResult.latestVersion ?? "?";

    // 回線・省電力が許せば 30 秒カウントダウンで自動更新。
    if (await isAutoDownloadAllowed()) {
      startCountdownDownload({
        key: UPDATE_DOWNLOAD_KEY,
        seconds: 30,
        buildMessage: (remaining) =>
          `日本語辞書の更新があります（${from} → ${to}）。${remaining} 秒後に自動で更新します。`,
        downloadMessage: UPDATE_MESSAGE,
      });
      return null;
    }

    return {
      id: "dict-update-available",
      type: "info",
      message: `日本語辞書の更新があります（${from} → ${to}）。`,
      duration: 0,
      actions: [
        {
          label: "更新",
          onClick: () => runDictDownloadWithProgress(UPDATE_MESSAGE, UPDATE_DOWNLOAD_KEY),
        },
      ],
    };
  },
};
