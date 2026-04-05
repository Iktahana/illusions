"use client";

import { useState, useCallback, useEffect } from "react";
import { Eye, EyeOff, CheckCircle, XCircle, Loader2 } from "lucide-react";

import { useAiApiSettings } from "@/contexts/EditorSettingsContext";
import { testAiConnection } from "@/lib/ai/ai-client";
import { fetchAppState } from "@/lib/storage/app-state-manager";
import { isElectronRenderer } from "@/lib/utils/runtime-env";

type TestStatus = "idle" | "testing" | "success" | "error";

export default function AiApiSettingsTab() {
  const {
    aiBaseUrl,
    aiModelId,
    onAiApiKeyChange,
    onAiBaseUrlChange,
    onAiModelIdChange,
  } = useAiApiSettings();

  // API key is managed in local state only — not exposed through context.
  // Loaded from AppState on mount; changes are persisted via the handler.
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [testStatus, setTestStatus] = useState<TestStatus>("idle");
  const [testMessage, setTestMessage] = useState("");

  const isElectron = isElectronRenderer();

  // Load persisted API key on mount
  useEffect(() => {
    void fetchAppState()
      .then((state) => {
        if (typeof state?.aiApiKey === "string") {
          setApiKey(state.aiApiKey);
        }
      })
      .catch(() => {
        // Ignore load errors — key remains empty
      });
  }, []);

  const handleApiKeyChange = useCallback(
    (value: string) => {
      setApiKey(value);
      onAiApiKeyChange(value);
    },
    [onAiApiKeyChange],
  );

  const handleTestConnection = useCallback(async () => {
    if (!apiKey) {
      setTestStatus("error");
      setTestMessage("APIキーが設定されていません。");
      return;
    }

    setTestStatus("testing");
    setTestMessage("");

    try {
      const count = await testAiConnection({
        apiKey,
        baseUrl: aiBaseUrl || undefined,
        modelId: aiModelId,
      });
      setTestStatus("success");
      setTestMessage(`接続成功 — ${count}個のモデルが利用可能です。`);
    } catch (e) {
      setTestStatus("error");
      setTestMessage(
        e instanceof Error ? `接続失敗: ${e.message}` : "接続失敗: 不明なエラー",
      );
    }
  }, [apiKey, aiBaseUrl, aiModelId]);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-medium text-foreground">AI API設定</h3>
        <p className="mt-1 text-sm text-foreground-secondary">
          オンラインAIサービスへの接続設定です。OpenAI互換のAPIエンドポイントに対応しています。
        </p>
      </div>

      {!isElectron && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4">
          <p className="text-sm text-yellow-600 dark:text-yellow-400">
            Web版ではAPIキーがブラウザに公開されるため、AI API機能はデスクトップ版のみご利用いただけます。
          </p>
        </div>
      )}

      <div className="space-y-4">
        {/* API Endpoint */}
        <div>
          <label
            htmlFor="ai-base-url"
            className="block text-sm font-medium text-foreground"
          >
            APIエンドポイント
          </label>
          <input
            id="ai-base-url"
            type="text"
            value={aiBaseUrl}
            onChange={(e) => onAiBaseUrlChange(e.target.value)}
            placeholder="https://api.openai.com/v1"
            disabled={!isElectron}
            className="mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-foreground-tertiary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <p className="mt-1 text-xs text-foreground-tertiary">
            独自のAI Gatewayを使用する場合はURLを変更してください。空欄の場合はOpenAIに接続します。
          </p>
        </div>

        {/* API Key */}
        <div>
          <label
            htmlFor="ai-api-key"
            className="block text-sm font-medium text-foreground"
          >
            APIキー
          </label>
          <div className="relative mt-1">
            <input
              id="ai-api-key"
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => handleApiKeyChange(e.target.value)}
              placeholder="sk-..."
              disabled={!isElectron}
              className="block w-full rounded-lg border border-border bg-background px-3 py-2 pr-10 text-sm text-foreground placeholder:text-foreground-tertiary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <button
              type="button"
              onClick={() => setShowKey((prev) => !prev)}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-foreground-tertiary hover:text-foreground-secondary"
              aria-label={showKey ? "APIキーを非表示" : "APIキーを表示"}
            >
              {showKey ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        {/* Model ID */}
        <div>
          <label
            htmlFor="ai-model-id"
            className="block text-sm font-medium text-foreground"
          >
            モデルID
          </label>
          <input
            id="ai-model-id"
            type="text"
            value={aiModelId}
            onChange={(e) => onAiModelIdChange(e.target.value)}
            placeholder="gpt-4o-mini"
            disabled={!isElectron}
            className="mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-foreground-tertiary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <p className="mt-1 text-xs text-foreground-tertiary">
            使用するAIモデルのIDを指定します（例: gpt-4o, gpt-4o-mini, claude-sonnet-4-6）。
          </p>
        </div>

        {/* Connection Test */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void handleTestConnection()}
            disabled={!isElectron || !apiKey || testStatus === "testing"}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {testStatus === "testing" && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            接続テスト
          </button>

          {testStatus === "success" && (
            <span className="inline-flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
              <CheckCircle className="h-4 w-4" />
              {testMessage}
            </span>
          )}
          {testStatus === "error" && (
            <span className="inline-flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
              <XCircle className="h-4 w-4" />
              {testMessage}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
