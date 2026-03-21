"use client";

import { useState, useEffect, useCallback } from "react";
import clsx from "clsx";

import { getLlmClient } from "@/lib/llm-client/llm-client";
import type { LlmProvider } from "@/lib/llm-client/types";

// ---------------------------------------------------------------------------
// Provider/model catalogue
// ---------------------------------------------------------------------------

interface ModelOption {
  id: string;
  label: string;
  recommended?: boolean;
}

interface ProviderOption {
  id: LlmProvider;
  label: string;
  keyPlaceholder: string;
  models: ModelOption[];
}

const PROVIDERS: ProviderOption[] = [
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    keyPlaceholder: "sk-ant-...",
    models: [
      { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", recommended: true },
      { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
    ],
  },
  {
    id: "openai",
    label: "OpenAI (GPT)",
    keyPlaceholder: "sk-...",
    models: [
      { id: "gpt-4o-mini", label: "GPT-4o mini", recommended: true },
      { id: "gpt-4o", label: "GPT-4o" },
    ],
  },
  {
    id: "google",
    label: "Google (Gemini)",
    keyPlaceholder: "AIza...",
    models: [
      { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", recommended: true },
      { id: "gemini-2.0-pro", label: "Gemini 2.0 Pro" },
    ],
  },
];

type ConnectionStatus = "unconfigured" | "configured" | "testing" | "ok" | "error";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface LlmSettingsProps {
  llmEnabled: boolean;
  onLlmEnabledChange?: (value: boolean) => void;
  characterExtractionBatchSize?: number;
  onCharacterExtractionBatchSizeChange?: (value: number) => void;
  characterExtractionConcurrency?: number;
  onCharacterExtractionConcurrencyChange?: (value: number) => void;
}

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

interface StoredProviderConfig {
  provider: LlmProvider;
  model: string;
  apiKey: string;
}

/** Load provider config from Electron IPC or sessionStorage (web) */
async function loadStoredConfig(): Promise<StoredProviderConfig | null> {
  if (typeof window !== "undefined" && window.electronAPI?.llm?.loadProviderConfig) {
    const result = await window.electronAPI.llm.loadProviderConfig();
    return result as StoredProviderConfig | null;
  }
  const raw = sessionStorage.getItem("llm-provider-config");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredProviderConfig;
  } catch {
    return null;
  }
}

/** Save provider config to Electron IPC or sessionStorage (web) */
async function saveStoredConfig(config: StoredProviderConfig): Promise<void> {
  if (typeof window !== "undefined" && window.electronAPI?.llm?.saveProviderConfig) {
    await window.electronAPI.llm.saveProviderConfig(config);
    return;
  }
  sessionStorage.setItem("llm-provider-config", JSON.stringify(config));
}

/** Delete stored config */
async function deleteStoredConfig(): Promise<void> {
  if (typeof window !== "undefined" && window.electronAPI?.llm?.deleteProviderConfig) {
    await window.electronAPI.llm.deleteProviderConfig();
    return;
  }
  sessionStorage.removeItem("llm-provider-config");
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LlmSettings({
  llmEnabled,
  onLlmEnabledChange,
  characterExtractionBatchSize,
  onCharacterExtractionBatchSizeChange,
  characterExtractionConcurrency,
  onCharacterExtractionConcurrencyChange,
}: LlmSettingsProps): React.ReactElement {
  const [selectedProvider, setSelectedProvider] = useState<LlmProvider>("anthropic");
  const [selectedModel, setSelectedModel] = useState("claude-haiku-4-5-20251001");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [status, setStatus] = useState<ConnectionStatus>("unconfigured");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const providerOpt = PROVIDERS.find((p) => p.id === selectedProvider) ?? PROVIDERS[0];

  // Load stored config on mount
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const stored = await loadStoredConfig();
      if (!mounted || !stored) return;
      setSelectedProvider(stored.provider);
      setSelectedModel(stored.model);
      setApiKeyInput(stored.apiKey);
      getLlmClient({ provider: stored.provider, model: stored.model, apiKey: stored.apiKey });
      setStatus("configured");
    };
    void load();
    return () => { mounted = false; };
  }, []);

  const handleProviderChange = useCallback((provider: LlmProvider) => {
    setSelectedProvider(provider);
    const newProvider = PROVIDERS.find((p) => p.id === provider);
    const defaultModel =
      newProvider?.models.find((m) => m.recommended)?.id ??
      newProvider?.models[0]?.id ??
      "";
    setSelectedModel(defaultModel);
    setStatus("unconfigured");
    setStatusMessage(null);
  }, []);

  const handleSaveAndTest = useCallback(async () => {
    if (!apiKeyInput.trim()) {
      setStatusMessage("APIキーを入力してください。");
      return;
    }
    setStatus("testing");
    setStatusMessage(null);
    const config: StoredProviderConfig = {
      provider: selectedProvider,
      model: selectedModel,
      apiKey: apiKeyInput.trim(),
    };
    try {
      const client = getLlmClient(config);
      await client.infer("テスト", { maxTokens: 5 });
      await saveStoredConfig(config);
      setStatus("ok");
      setStatusMessage("接続に成功しました。");
    } catch (e) {
      setStatus("error");
      const msg = e instanceof Error ? e.message : String(e);
      setStatusMessage(`接続エラー: ${msg}`);
    }
  }, [selectedProvider, selectedModel, apiKeyInput]);

  const handleDeleteConfig = useCallback(async () => {
    const confirmed = window.confirm("APIキーの設定を削除しますか？");
    if (!confirmed) return;
    await deleteStoredConfig();
    getLlmClient(null);
    setApiKeyInput("");
    setStatus("unconfigured");
    setStatusMessage(null);
    onLlmEnabledChange?.(false);
  }, [onLlmEnabledChange]);

  const statusBadgeClass = clsx(
    "text-xs px-2 py-0.5 rounded-full font-medium",
    status === "ok" && "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    status === "error" && "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    status === "testing" && "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    (status === "unconfigured" || status === "configured") &&
      "bg-foreground-muted text-foreground-tertiary",
  );

  const statusLabel =
    status === "ok" ? "接続済み" :
    status === "error" ? "エラー" :
    status === "testing" ? "テスト中..." :
    status === "configured" ? "設定済み" :
    "未設定";

  return (
    <div className="space-y-6">
      {/* Master toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-foreground">AI校正を有効にする</h3>
          <p className="text-xs text-foreground-tertiary mt-0.5">
            クラウドAIを使用して校正の精度を向上させます
          </p>
        </div>
        <button
          role="switch"
          aria-checked={llmEnabled}
          onClick={() => onLlmEnabledChange?.(!llmEnabled)}
          className={clsx(
            "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
            llmEnabled ? "bg-accent" : "bg-foreground-muted",
          )}
        >
          <span
            className={clsx(
              "inline-block h-4 w-4 transform rounded-full transition-transform shadow-sm",
              llmEnabled ? "translate-x-6 bg-accent-foreground" : "translate-x-1 bg-white",
            )}
          />
        </button>
      </div>

      {/* Provider configuration */}
      <div className="pt-4 border-t border-border space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-foreground">プロバイダー設定</h3>
          <span className={statusBadgeClass}>{statusLabel}</span>
        </div>

        <div>
          <label className="block text-xs text-foreground-secondary mb-1">AIプロバイダー</label>
          <select
            value={selectedProvider}
            onChange={(e) => handleProviderChange(e.target.value as LlmProvider)}
            className="w-full px-3 py-2 border border-border-secondary rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          >
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-foreground-secondary mb-1">モデル</label>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="w-full px-3 py-2 border border-border-secondary rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          >
            {providerOpt.models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}{m.recommended ? "（推奨）" : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-foreground-secondary mb-1">APIキー</label>
          <input
            type="password"
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            placeholder={providerOpt.keyPlaceholder}
            className="w-full px-3 py-2 border border-border-secondary rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-accent font-mono"
            autoComplete="off"
          />
        </div>

        {statusMessage && (
          <p className={clsx(
            "text-xs",
            status === "ok"
              ? "text-green-600 dark:text-green-400"
              : "text-red-600 dark:text-red-400",
          )}>
            {statusMessage}
          </p>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => void handleSaveAndTest()}
            disabled={status === "testing"}
            className={clsx(
              "flex-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors",
              status === "testing"
                ? "bg-foreground-muted text-foreground-tertiary cursor-not-allowed"
                : "bg-accent text-accent-foreground hover:bg-accent-hover",
            )}
          >
            {status === "testing" ? "テスト中..." : "保存・テスト"}
          </button>
          {(status === "ok" || status === "configured") && (
            <button
              onClick={() => void handleDeleteConfig()}
              className="px-3 py-1.5 text-xs font-medium rounded-lg text-red-600 dark:text-red-400 hover:underline transition-colors"
            >
              削除
            </button>
          )}
        </div>
      </div>

      {/* Character extraction settings */}
      <div className="pt-4 border-t border-border space-y-4">
        <h3 className="text-sm font-medium text-foreground">人物抽出設定</h3>

        <div className={clsx(!llmEnabled && "opacity-60")}>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-foreground-secondary">バッチサイズ</label>
            <span className="text-xs text-foreground-tertiary">{characterExtractionBatchSize ?? 3}</span>
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
          <p className="text-xs text-foreground-tertiary mt-1">1回のAI呼び出しで処理する段落数</p>
        </div>

        <div className={clsx(!llmEnabled && "opacity-60")}>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-foreground-secondary">並列数</label>
            <span className="text-xs text-foreground-tertiary">{characterExtractionConcurrency ?? 4}</span>
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
          <p className="text-xs text-foreground-tertiary mt-1">同時に実行するAI推論の数</p>
        </div>
      </div>
    </div>
  );
}
