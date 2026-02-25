"use client";

import { useState, useEffect, useCallback } from "react";
import clsx from "clsx";

import { getLlmClient } from "@/lib/llm-client/llm-client";
import {
  LLM_MODEL_REGISTRY,
  getModelEntry,
} from "@/lib/llm-client/model-registry";
import type { LlmModelInfo } from "@/lib/llm-client/types";

interface LlmSettingsProps {
  llmEnabled: boolean;
  onLlmEnabledChange?: (value: boolean) => void;
  llmModelId: string;
  onLlmModelIdChange?: (modelId: string) => void;
  llmIdlingStop?: boolean;
  onLlmIdlingStopChange?: (value: boolean) => void;
  characterExtractionBatchSize?: number;
  onCharacterExtractionBatchSizeChange?: (value: number) => void;
  characterExtractionConcurrency?: number;
  onCharacterExtractionConcurrencyChange?: (value: number) => void;
}

/** Format byte count as human-readable string */
function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) {
    return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  }
  return `${(bytes / 1_000_000).toFixed(0)} MB`;
}

export function LlmSettings({
  llmEnabled,
  onLlmEnabledChange,
  llmModelId,
  onLlmModelIdChange,
  llmIdlingStop,
  onLlmIdlingStopChange,
  characterExtractionBatchSize,
  onCharacterExtractionBatchSizeChange,
  characterExtractionConcurrency,
  onCharacterExtractionConcurrencyChange,
}: LlmSettingsProps): React.ReactElement {
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [modelStatuses, setModelStatuses] = useState<Map<string, LlmModelInfo>>(new Map());
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
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

  // Check availability and fetch initial data on mount
  useEffect(() => {
    const client = getLlmClient();
    setIsAvailable(client.isAvailable());

    if (client.isAvailable()) {
      void refreshModelStatuses();
    }
  }, [refreshModelStatuses]);

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
    } catch {
      // Error is tracked via model status
    } finally {
      setIsDownloading(false);
      setDownloadProgress(null);
    }
  }, [isDownloading, llmModelId, refreshModelStatuses]);

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
    } catch {
      // Error is tracked via model status
    }
  }, [llmEnabled, llmModelId, onLlmEnabledChange, refreshModelStatuses]);

  // If still checking availability
  if (isAvailable === null) {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-sm font-medium text-foreground">AI校正</h3>
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
              AI校正を有効にする
            </h3>
            <p className="text-xs text-foreground-tertiary mt-0.5">
              ローカルLLMを使用して校正の精度を向上させます
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

        {/* Idling stop toggle */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-foreground">
              AIアイドリングストップ
            </h3>
            <p className="text-xs text-foreground-tertiary mt-0.5">
              しばらく使わないとき、パソコンが重くならないようAIを自動で休ませます
            </p>
          </div>
          <button
            role="switch"
            aria-checked={llmIdlingStop ?? true}
            onClick={() => onLlmIdlingStopChange?.(!llmIdlingStop)}
            className={clsx(
              "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
              (llmIdlingStop ?? true) ? "bg-accent" : "bg-foreground-muted",
              !llmEnabled && "opacity-60"
            )}
            disabled={!llmEnabled}
          >
            <span
              className={clsx(
                "inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm",
                (llmIdlingStop ?? true) ? "translate-x-6" : "translate-x-1"
              )}
            />
          </button>
        </div>

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
              モデルを変更するにはAI校正を無効にしてください
            </p>
          )}
        </div>

        {/* Downloaded models */}
        {selectedEntry && (
          <div className="pt-4 border-t border-border space-y-4">
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

            {/* Not downloaded — show download button or unavailable badge */}
            {(!selectedStatus || selectedStatus.status === "not-downloaded") && !isDownloading && (
              selectedEntry.url === "" ? (
                <span className="px-3 py-1.5 text-xs font-medium rounded-lg bg-foreground-muted text-foreground-tertiary">
                  準備中
                </span>
              ) : (
                <button
                  onClick={() => void handleDownload()}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-accent text-accent-foreground hover:bg-accent-hover transition-colors"
                >
                  ダウンロード
                </button>
              )
            )}

            {/* Downloaded — show model name + delete */}
            {isModelDownloaded && (
              <div>
                <h4 className="text-sm font-medium text-foreground mb-2">
                  ダウンロード済みモデル
                </h4>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground-secondary">
                    {selectedEntry.nameJa} — {formatBytes(selectedEntry.size)}
                  </span>
                  <button
                    onClick={() => void handleDelete()}
                    className="text-xs text-red-600 dark:text-red-400 hover:underline transition-colors"
                  >
                    削除
                  </button>
                </div>
              </div>
            )}

            {/* Model error */}
            {selectedStatus?.status === "error" && selectedStatus.error && (
              <p className="text-xs text-red-600 dark:text-red-400">
                {selectedStatus.error}
              </p>
            )}

            {/* Model info */}
            <div className="text-xs text-foreground-tertiary space-y-1">
              {selectedEntry.descriptionJa && (
                <p>{selectedEntry.descriptionJa}</p>
              )}
              <p>サイズ: 約 {formatBytes(selectedEntry.size)}</p>
              <p>量子化: {selectedEntry.quantization}</p>
              <p>必要メモリ: {selectedEntry.minRamMb} MB</p>
            </div>
          </div>
        )}

        {/* Character extraction settings */}
        <div className="pt-4 border-t border-border space-y-4">
          <h3 className="text-sm font-medium text-foreground">人物抽出設定</h3>

          {/* Batch size slider */}
          <div className={clsx(!llmEnabled && "opacity-60")}>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-foreground-secondary">
                バッチサイズ
              </label>
              <span className="text-xs text-foreground-tertiary">
                {characterExtractionBatchSize ?? 3}
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              value={characterExtractionBatchSize ?? 3}
              onChange={(e) => onCharacterExtractionBatchSizeChange?.(Number(e.target.value))}
              disabled={!llmEnabled}
              className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full appearance-none cursor-pointer accent-accent"
            />
            <p className="text-xs text-foreground-tertiary mt-1">
              1回のAI呼び出しで処理する段落数
            </p>
          </div>

          {/* Concurrency slider */}
          <div className={clsx(!llmEnabled && "opacity-60")}>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-foreground-secondary">
                並列数
              </label>
              <span className="text-xs text-foreground-tertiary">
                {characterExtractionConcurrency ?? 4}
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={8}
              value={characterExtractionConcurrency ?? 4}
              onChange={(e) => onCharacterExtractionConcurrencyChange?.(Number(e.target.value))}
              disabled={!llmEnabled}
              className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full appearance-none cursor-pointer accent-accent"
            />
            <p className="text-xs text-foreground-tertiary mt-1">
              同時に実行するAI推論の数
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
