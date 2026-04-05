"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, RefreshCw, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { useDictSettingsContext } from "@/contexts/EditorSettingsContext";
import type { DictDownloadStatus } from "@/lib/dict/dict-types";

interface UpdateInfo {
  latestVersion?: string;
  installedVersion?: string;
  updateAvailable?: boolean;
  error?: string;
}

function isElectron(): boolean {
  return (
    typeof window !== "undefined" &&
    !!(window as Window & { electronAPI?: unknown }).electronAPI
  );
}

interface DictAPI {
  getStatus: () => Promise<{ status: DictDownloadStatus; installedVersion?: string }>;
  checkUpdate: () => Promise<UpdateInfo>;
  download: () => Promise<{ success: boolean; version?: string; error?: string }>;
  onDownloadProgress: (cb: (data: { progress: number }) => void) => () => void;
}

function getDict(): DictAPI | null {
  return (
    (window as Window & { electronAPI?: { dict?: DictAPI } }).electronAPI?.dict ?? null
  );
}

export default function DictSettingsTab() {
  const {
    dictAutoCheckUpdates,
    dictAutoDownload,
    dictInstalledVersion,
    dictLastCheckedAt,
    onDictAutoCheckUpdatesChange,
    onDictAutoDownloadChange,
    onDictInstalledVersionChange,
    onDictLastCheckedAtChange,
  } = useDictSettingsContext();

  const [dbStatus, setDbStatus] = useState<DictDownloadStatus>("not-installed");
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [checkResult, setCheckResult] = useState<UpdateInfo | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load status on mount
  useEffect(() => {
    if (!isElectron()) return;

    const dict = getDict();
    if (!dict) return;

    dict
      .getStatus()
      .then((s) => {
        setDbStatus(s.status);
        if (s.installedVersion && !dictInstalledVersion) {
          onDictInstalledVersionChange(s.installedVersion);
        }
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCheckUpdate = useCallback(async () => {
    const dict = getDict();
    if (!dict) return;

    setIsChecking(true);
    setError(null);
    try {
      const info = await dict.checkUpdate();
      setCheckResult(info);
      onDictLastCheckedAtChange(new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新確認に失敗しました");
    } finally {
      setIsChecking(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDownload = useCallback(async () => {
    const dict = getDict();
    if (!dict) return;

    setIsDownloading(true);
    setDownloadProgress(0);
    setError(null);

    const cleanup = dict.onDownloadProgress(({ progress }) => {
      setDownloadProgress(progress);
    });

    try {
      const result = await dict.download();
      if (result.success) {
        setDbStatus("installed");
        if (result.version) {
          onDictInstalledVersionChange(result.version);
        }
        setCheckResult(null);
      } else {
        setError(result.error ?? "ダウンロードに失敗しました");
        setDbStatus("error");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "ダウンロードに失敗しました");
      setDbStatus("error");
    } finally {
      cleanup();
      setIsDownloading(false);
      setDownloadProgress(null);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const formatDate = (iso: string | undefined) => {
    if (!iso) return null;
    try {
      return new Date(iso).toLocaleDateString("ja-JP", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  const isInstalled = dbStatus === "installed";
  const updateAvailable = checkResult?.updateAvailable ?? false;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-foreground mb-1">辞典データ</h3>
        <p className="text-sm text-foreground-secondary">
          illusions辞典データベース（日本語語彙・読み・品詞・類義語）
        </p>
      </div>

      {/* Status card */}
      <div className="bg-background-elevated border border-border rounded-lg p-4 space-y-3">
        {/* Install state */}
        <div className="flex items-center gap-2">
          {isInstalled ? (
            <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-foreground-tertiary flex-shrink-0" />
          )}
          <span className="text-sm text-foreground">
            {isInstalled ? "インストール済み" : "未インストール"}
          </span>
        </div>

        {/* Version */}
        {dictInstalledVersion && (
          <div className="text-xs text-foreground-secondary">
            バージョン: {dictInstalledVersion}
          </div>
        )}

        {/* Latest version info */}
        {checkResult?.latestVersion && (
          <div className="text-xs text-foreground-secondary">
            最新バージョン: {checkResult.latestVersion}
            {updateAvailable && (
              <span className="ml-2 text-warning font-medium">更新あり</span>
            )}
            {!updateAvailable && isInstalled && (
              <span className="ml-2 text-success">最新版です</span>
            )}
          </div>
        )}

        {/* Last checked */}
        {dictLastCheckedAt && (
          <div className="text-xs text-foreground-tertiary">
            最終確認: {formatDate(dictLastCheckedAt)}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="text-xs text-danger">{error}</div>
        )}

        {/* Download progress */}
        {isDownloading && downloadProgress !== null && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-foreground-secondary">
              <span>{downloadProgress < 95 ? "ダウンロード中..." : "展開中..."}</span>
              <span>{downloadProgress}%</span>
            </div>
            <div className="w-full bg-background rounded-full h-1.5">
              <div
                className="bg-accent h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${downloadProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Action buttons */}
        {isElectron() && (
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => void handleCheckUpdate()}
              disabled={isChecking || isDownloading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-background border border-border rounded hover:bg-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isChecking ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3" />
              )}
              今すぐ確認
            </button>

            {(!isInstalled || updateAvailable) && (
              <button
                onClick={() => void handleDownload()}
                disabled={isDownloading || isChecking}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-accent text-accent-foreground rounded hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDownloading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Download className="w-3 h-3" />
                )}
                {isInstalled ? "更新" : "ダウンロード"}
              </button>
            )}
          </div>
        )}

        {!isElectron() && (
          <p className="text-xs text-foreground-tertiary">
            辞典データはデスクトップ版でのみ利用できます。
          </p>
        )}
      </div>

      {/* Update settings */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">アップデート設定</h3>
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={dictAutoCheckUpdates}
              onChange={(e) => onDictAutoCheckUpdatesChange(e.target.checked)}
              className="w-4 h-4 rounded accent-accent"
            />
            <div>
              <div className="text-sm text-foreground">起動時に更新を確認する</div>
              <div className="text-xs text-foreground-secondary">
                アプリ起動時に自動で新バージョンを確認します
              </div>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={dictAutoDownload}
              onChange={(e) => onDictAutoDownloadChange(e.target.checked)}
              className="w-4 h-4 rounded accent-accent"
            />
            <div>
              <div className="text-sm text-foreground">自動ダウンロード</div>
              <div className="text-xs text-foreground-secondary">
                新バージョンが見つかった場合に自動でダウンロードします（約 526 MB）
              </div>
            </div>
          </label>
        </div>
      </div>
    </div>
  );
}
