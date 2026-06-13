/**
 * Startup check: Japanese dictionary (Genji) not downloaded / update available.
 *
 * Local dictionary download is Electron-only. In the browser there is no
 * `electronAPI.dict`, and `getDownloadState` would report "not-installed" even
 * though local download isn't applicable — so we skip entirely on Web to avoid
 * a false "please download" toast.
 */
import { getDictService } from "@/lib/dict/dict-service";
import { notificationManager } from "../notification-manager";
import type { StartupCheck, StartupNotice } from "../startup-check-queue";

const GENJI_PROVIDER_ID = "genji";

interface ElectronDictApi {
  download?: () => Promise<unknown>;
  getStatus?: () => Promise<unknown>;
}

function getElectronDict(): ElectronDictApi | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { electronAPI?: { dict?: ElectronDictApi } }).electronAPI?.dict;
}

function startDictDownload(): void {
  const dict = getElectronDict();
  if (!dict?.download) return;
  dict.download().catch((e: unknown) => console.warn("[dict] download failed:", e));
  notificationManager.info("辞書のダウンロードを開始しました。");
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
        message: "日本語辞書が未ダウンロードです。ダウンロードすると校正と辞書引きがより正確になります。",
        duration: 0, // keep until dismissed
        actions: [{ label: "今すぐダウンロード", onClick: startDictDownload }],
      };
    }

    if (state.updateAvailable) {
      const from = state.installedVersion ?? "?";
      const to = state.latestVersion ?? "?";
      return {
        id: "dict-update-available",
        type: "info",
        message: `日本語辞書の更新があります（${from} → ${to}）。`,
        duration: 0,
        actions: [{ label: "更新", onClick: startDictDownload }],
      };
    }

    return null;
  },
};
