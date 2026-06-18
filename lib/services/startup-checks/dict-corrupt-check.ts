/**
 * Startup check: installed Japanese dictionary (Genji) is corrupt.
 *
 * Electron-only (no local DB on web). When {@link getDictAccess}'s health
 * resolves to "corrupt" — the DB file exists but failed a fast integrity check
 * (truncated download, bad header, missing table) — surface a warning that
 * offers to re-download. This runs alongside {@link dictUpdateCheck}; the
 * corrupt state takes precedence conceptually (a corrupt DB answers no queries).
 */
import { getDictAccess } from "@/lib/dict/dict-access";
import { notificationManager } from "../notification-manager";
import type { StartupCheck, StartupNotice } from "../startup-check-queue";

interface DictDownloadResult {
  success: boolean;
  version?: string;
  error?: string;
}

interface ElectronDictApi {
  download?: () => Promise<DictDownloadResult | undefined>;
}

function getElectronDict(): ElectronDictApi | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { electronAPI?: { dict?: ElectronDictApi } }).electronAPI?.dict;
}

function startRedownload(): void {
  const dict = getElectronDict();
  if (!dict?.download) return;
  notificationManager.info("辞書の再ダウンロードを開始しました。");
  dict
    .download()
    .then((result) => {
      if (result?.success === false) {
        notificationManager.error(
          `辞書の再ダウンロードに失敗しました：${result.error ?? "不明なエラー"}`,
        );
      } else {
        // Clear cached "corrupt" health + negative lookups now that the DB is fresh.
        getDictAccess().invalidate();
      }
    })
    .catch((e: unknown) => {
      console.warn("[dict] re-download failed:", e);
      notificationManager.error(
        `辞書の再ダウンロードに失敗しました：${e instanceof Error ? e.message : String(e)}`,
      );
    });
}

export const dictCorruptCheck: StartupCheck = {
  id: "dict-corrupt",
  async evaluate(): Promise<StartupNotice | null> {
    // Electron-only feature; the browser has no local dictionary file.
    if (!getElectronDict()) return null;

    const health = await getDictAccess().getHealth();
    if (health.state !== "corrupt") return null;

    return {
      id: "dict-corrupt",
      type: "warning",
      message: health.message ?? "辞書データが破損しています。再ダウンロードしてください。",
      duration: 0, // keep until dismissed
      actions: [{ label: "再ダウンロード", onClick: startRedownload }],
    };
  },
};
