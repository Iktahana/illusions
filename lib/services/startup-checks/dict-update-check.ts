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
 */
import { getDictService } from "@/lib/dict/dict-service";
import { getStorageService } from "@/lib/storage/storage-service";
import { notificationManager } from "../notification-manager";
import type { StartupCheck, StartupNotice } from "../startup-check-queue";

const GENJI_PROVIDER_ID = "genji";

/**
 * Result shape resolved by `electronAPI.dict.download()` (IPC `dict:download`).
 * The handler RESOLVES `{ success: false, error }` on recoverable failures
 * (another download running, checksum/URL validation, etc.) rather than
 * rejecting, so the caller must inspect `success` — not just rely on `.catch`.
 */
interface DictDownloadResult {
  success: boolean;
  version?: string;
  error?: string;
}

interface ElectronDictApi {
  download?: () => Promise<DictDownloadResult | undefined>;
  getStatus?: () => Promise<unknown>;
}

function getElectronDict(): ElectronDictApi | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { electronAPI?: { dict?: ElectronDictApi } }).electronAPI?.dict;
}

function startDictDownload(): void {
  const dict = getElectronDict();
  if (!dict?.download) return;
  notificationManager.info("辞書のダウンロードを開始しました。");
  // The IPC handler resolves `{ success: false, error }` on recoverable
  // failures instead of rejecting, so inspect the resolved result and surface
  // the error rather than leaving the optimistic "started" toast standing.
  dict
    .download()
    .then((result) => {
      if (result?.success === false) {
        notificationManager.error(
          `辞書のダウンロードに失敗しました：${result.error ?? "不明なエラー"}`,
        );
      }
    })
    .catch((e: unknown) => {
      console.warn("[dict] download failed:", e);
      notificationManager.error(
        `辞書のダウンロードに失敗しました：${e instanceof Error ? e.message : String(e)}`,
      );
    });
}

export const dictUpdateCheck: StartupCheck = {
  id: "dict-update",
  async evaluate(): Promise<StartupNotice | null> {
    // Electron-only feature; the browser has no local dictionary download.
    if (!getElectronDict()) return null;

    const state = await getDictService().getDownloadState(GENJI_PROVIDER_ID);

    if (state.status === "not-installed") {
      return {
        id: "dict-not-installed",
        type: "warning",
        message:
          "日本語辞書が未ダウンロードです。ダウンロードすると校正と辞書引きがより正確になります。",
        duration: 0, // keep until dismissed
        actions: [{ label: "今すぐダウンロード", onClick: startDictDownload }],
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
    return {
      id: "dict-update-available",
      type: "info",
      message: `日本語辞書の更新があります（${from} → ${to}）。`,
      duration: 0,
      actions: [{ label: "更新", onClick: startDictDownload }],
    };
  },
};
