"use client";

import { useState, useEffect, useCallback } from "react";
import clsx from "clsx";

import { getLlmClient } from "@/lib/llm-client/llm-client";
import {
  LLM_MODEL_REGISTRY,
  DEFAULT_MODEL_ID,
  getModelEntry,
} from "@/lib/llm-client/model-registry";
import type { LlmModelInfo, LlmModelStatus } from "@/lib/llm-client/types";

interface LlmSettingsProps {
  llmEnabled: boolean;
  onLlmEnabledChange?: (value: boolean) => void;
  llmModelId: string;
  onLlmModelIdChange?: (modelId: string) => void;
}

/** Format byte count as human-readable string */
function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) {
    return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  }
  return `${(bytes / 1_000_000).toFixed(0)} MB`;
}

/** Resolve status label and color for badge display */
function getStatusBadge(status: LlmModelStatus): { label: string; className: string } {
  switch (status) {
    case "not-downloaded":
      return { label: "未ダウンロード", className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" };
    case "downloading":
      return { label: "ダウンロード中...", className: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" };
    case "ready":
      return { label: "ダウンロード済み", className: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" };
    case "loading":
      return { label: "読み込み中...", className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300" };
    case "loaded":
      return { label: "使用中", className: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" };
    case "error":
      return { label: "エラー", className: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" };
  }
}

export function LlmSettings({
  llmEnabled,
  onLlmEnabledChange,
  llmModelId,
  onLlmModelIdChange,
}: LlmSettingsProps): React.ReactElement {
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [modelStatuses, setModelStatuses] = useState<Map<string, LlmModelInfo>>(new Map());
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [storageUsed, setStorageUsed] = useState<number>(0);
  const [toggleMessage, setToggleMessage] = useState<string | null>(null);

  const selectedEntry = getModelEntry(llmModelId);
  const selectedStatus = modelStatuses.get(llmModelId);

  /** Fetch model statuses from LLM client */
  const refreshModelStatuses = useCallback(async () => {
    try {
      const client = getLlmClient();
      const models = await client.getModels();
      const statusMap = new Map<string, LlmModelInfo>();
      for (const model of models) {
        statusMap.set(model.id, model);
      }
      setModelStatuses(statusMap);
    } catch {
      // Silently fail — statuses remain empty
    }
  }, []);

  /** Fetch storage usage */
  const refreshStorageUsage = useCallback(async () => {
    try {
      const client = getLlmClient();
      const usage = await client.getStorageUsage();
      setStorageUsed(usage.used);
    } catch {
      // Silently fail
    }
  }, []);

  // Check availability and fetch initial data on mount
  useEffect(() => {
    const client = getLlmClient();
    setIsAvailable(client.isAvailable());

    if (client.isAvailable()) {
      void refreshModelStatuses();
      void refreshStorageUsage();
    }
  }, [refreshModelStatuses, refreshStorageUsage]);

  // Clear toggle message after a delay
  useEffect(() => {
    if (toggleMessage) {
      const timer = setTimeout(() => setToggleMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toggleMessage]);

  /** Handle master toggle */
  const handleToggle = useCallback(() => {
    if (llmEnabled) {
      // Turning off — always allowed
      onLlmEnabledChange?.(false);
      return;
    }

    // Turning on — check model is downloaded
    const status = modelStatuses.get(llmModelId);
    if (!status || status.status === "not-downloaded") {
      setToggleMessage("先にモデルをダウンロードしてください");
      return;
    }

    onLlmEnabledChange?.(true);
  }, [llmEnabled, llmModelId, modelStatuses, onLlmEnabledChange]);

  /** Handle model download */
  const handleDownload = useCallback(async () => {
    if (isDownloading) return;

    setIsDownloading(true);
    setDownloadProgress(0);

    try {
      const client = getLlmClient();
      await client.downloadModel(llmModelId, (progress) => {
        setDownloadProgress(progress);
      });
      await refreshModelStatuses();
      await refreshStorageUsage();
    } catch {
      // Error is tracked via model status
    } finally {
      setIsDownloading(false);
      setDownloadProgress(null);
    }
  }, [isDownloading, llmModelId, refreshModelStatuses, refreshStorageUsage]);

  /** Handle model deletion */
  const handleDelete = useCallback(async () => {
    const confirmed = window.confirm(
      "このモデルを削除しますか？再度使用するにはダウンロードが必要です。"
    );
    if (!confirmed) return;

    // Auto-disable L3 if deleting the active model
    if (llmEnabled) {
      onLlmEnabledChange?.(false);
    }

    try {
      const client = getLlmClient();
      await client.deleteModel(llmModelId);
      await refreshModelStatuses();
      await refreshStorageUsage();
    } catch {
      // Error is tracked via model status
    }
  }, [llmEnabled, llmModelId, onLlmEnabledChange, refreshModelStatuses, refreshStorageUsage]);

  // If still checking availability
  if (isAvailable === null) {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-sm font-medium text-foreground">AI機能</h3>
          <p className="text-xs text-foreground-tertiary mt-0.5">
            読み込み中...
          </p>
        </div>
      </div>
    );
  }

  const isModelDownloaded =
    selectedStatus?.status === "ready" ||
    selectedStatus?.status === "loaded" ||
    selectedStatus?.status === "loading";

  const canToggleOn = isModelDownloaded;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-sm font-medium text-foreground">AI機能</h3>
        <p className="text-xs text-foreground-tertiary mt-0.5">
          ローカルLLMを使用した高度な校正機能です。
        </p>
      </div>

      {/* Unavailable banner */}
      {!isAvailable && (
        <div className="rounded-lg border border-yellow-300 bg-yellow-50 dark:border-yellow-700 dark:bg-yellow-900/20 px-4 py-3">
          <p className="text-sm text-yellow-800 dark:text-yellow-200">
            この機能はデスクトップアプリでのみ利用可能です。
          </p>
        </div>
      )}

      {/* All controls — disabled when not available */}
      <div
        className={clsx(
          "space-y-6",
          !isAvailable && "opacity-50 pointer-events-none"
        )}
      >
        {/* Master toggle */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-foreground">
              AI機能を有効にする
            </h3>
            <p className="text-xs text-foreground-tertiary mt-0.5">
              有効にすると、選択したモデルがメモリに読み込まれます。無効にすると、モデルはメモリから解放されます。
            </p>
          </div>
          <button
            role="switch"
            aria-checked={llmEnabled}
            onClick={handleToggle}
            className={clsx(
              "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
              llmEnabled ? "bg-accent" : "bg-foreground-muted",
              !canToggleOn && !llmEnabled && "opacity-60"
            )}
          >
            <span
              className={clsx(
                "inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm",
                llmEnabled ? "translate-x-6" : "translate-x-1"
              )}
            />
          </button>
        </div>

        {/* Toggle message */}
        {toggleMessage && (
          <p className="text-xs text-yellow-600 dark:text-yellow-400">
            {toggleMessage}
          </p>
        )}

        {/* Model selector section */}
        <div className="pt-4 border-t border-border">
          <label className="block text-sm font-medium text-foreground mb-2">
            モデル選択
          </label>
          <select
            value={llmModelId}
            onChange={(e) => onLlmModelIdChange?.(e.target.value)}
            disabled={llmEnabled}
            className={clsx(
              "w-full px-3 py-2 border border-border-secondary rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-accent",
              llmEnabled && "opacity-50 cursor-not-allowed"
            )}
          >
            {LLM_MODEL_REGISTRY.map((model) => (
              <option key={model.id} value={model.id}>
                {model.nameJa} — {formatBytes(model.size)}
                {model.recommended ? "（推奨）" : ""}
              </option>
            ))}
          </select>
          {llmEnabled && (
            <p className="text-xs text-foreground-tertiary mt-1">
              モデルを変更するにはAI機能を無効にしてください
            </p>
          )}
        </div>

        {/* Model status and actions */}
        {selectedEntry && (
          <div className="pt-4 border-t border-border space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-foreground">
                モデル状態
              </h4>
              {selectedStatus && (
                <span
                  className={clsx(
                    "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                    getStatusBadge(selectedStatus.status).className
                  )}
                >
                  {getStatusBadge(selectedStatus.status).label}
                </span>
              )}
              {!selectedStatus && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                  未ダウンロード
                </span>
              )}
            </div>

            {/* Download progress bar */}
            {isDownloading && downloadProgress !== null && (
              <div className="space-y-1">
                <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(Math.round(downloadProgress), 100)}%` }}
                  />
                </div>
                <p className="text-xs text-foreground-tertiary text-right">
                  {Math.min(Math.round(downloadProgress), 100)}%
                </p>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              {(!selectedStatus || selectedStatus.status === "not-downloaded") && (
                <button
                  onClick={() => void handleDownload()}
                  disabled={isDownloading}
                  className={clsx(
                    "px-3 py-1.5 text-xs font-medium rounded-lg transition-colors",
                    isDownloading
                      ? "bg-gray-200 text-gray-400 dark:bg-gray-700 dark:text-gray-500 cursor-not-allowed"
                      : "bg-accent text-accent-foreground hover:bg-accent-hover"
                  )}
                >
                  {isDownloading ? "ダウンロード中..." : "ダウンロード"}
                </button>
              )}

              {isModelDownloaded && !llmEnabled && (
                <button
                  onClick={() => void handleDelete()}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  削除
                </button>
              )}
            </div>

            {/* Model error */}
            {selectedStatus?.status === "error" && selectedStatus.error && (
              <p className="text-xs text-red-600 dark:text-red-400">
                {selectedStatus.error}
              </p>
            )}

            {/* Model info */}
            <div className="text-xs text-foreground-tertiary space-y-1">
              <p>サイズ: 約 {formatBytes(selectedEntry.size)}</p>
              <p>量子化: {selectedEntry.quantization}</p>
              <p>必要メモリ: {selectedEntry.minRamMb} MB</p>
            </div>
          </div>
        )}

        {/* Storage usage */}
        <div className="pt-4 border-t border-border">
          <h4 className="text-sm font-medium text-foreground mb-2">
            ストレージ使用量
          </h4>
          <p className="text-xs text-foreground-tertiary">
            使用容量: {formatBytes(storageUsed)}
          </p>
        </div>
      </div>
    </div>
  );
}
