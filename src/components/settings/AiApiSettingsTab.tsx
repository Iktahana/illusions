"use client";

import { useState, useCallback, useEffect } from "react";
import { Eye, EyeOff, CheckCircle, XCircle, Loader2 } from "lucide-react";

import { useAiApiSettings } from "@/contexts/EditorSettingsContext";
import { testAiConnection } from "@/lib/ai/ai-client";
import { fetchAppState } from "@/lib/storage/app-state-manager";
import { isElectronRenderer } from "@/lib/utils/runtime-env";
import { SettingsField, SettingsSection } from "./primitives";

type TestStatus = "idle" | "testing" | "success" | "error";

const BASE_INPUT_CLASS =
  "block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-foreground-tertiary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed";

export default function AiApiSettingsTab() {
  const { aiBaseUrl, aiModelId, onAiApiKeyChange, onAiBaseUrlChange, onAiModelIdChange } =
    useAiApiSettings();

  // API key is managed in local state only — not exposed through context.
  // Loaded from AppState on mount; changes are persisted via the handler.
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [testStatus, setTestStatus] = useState<TestStatus>("idle");
  const [testMessage, setTestMessage] = useState("");

  const isElectron = isElectronRenderer();

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
      setTestMessage(e instanceof Error ? `接続失敗: ${e.message}` : "接続失敗: 不明なエラー");
    }
  }, [apiKey, aiBaseUrl, aiModelId]);

  return (
    <SettingsSection
      title="AI API 設定"
      description="オンライン AI サービスへの接続設定です。OpenAI 互換の API エンドポイントに対応しています。"
    >
      {!isElectron && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4">
          <p className="text-sm text-yellow-600 dark:text-yellow-400">
            Web 版では API キーがブラウザに公開されるため、AI API
            機能はデスクトップ版のみご利用いただけます。
          </p>
        </div>
      )}

      <SettingsField
        label="API エンドポイント"
        description="独自の AI Gateway を使用する場合は URL を変更してください。空欄の場合は OpenAI に接続します。"
        htmlFor="ai-base-url"
      >
        <input
          id="ai-base-url"
          type="text"
          value={aiBaseUrl}
          onChange={(e) => onAiBaseUrlChange(e.target.value)}
          placeholder="https://api.openai.com/v1"
          disabled={!isElectron}
          className={BASE_INPUT_CLASS}
        />
      </SettingsField>

      <SettingsField label="API キー" htmlFor="ai-api-key">
        <div className="relative">
          <input
            id="ai-api-key"
            type={showKey ? "text" : "password"}
            value={apiKey}
            onChange={(e) => handleApiKeyChange(e.target.value)}
            placeholder="sk-..."
            disabled={!isElectron}
            className={`${BASE_INPUT_CLASS} pr-10`}
          />
          <button
            type="button"
            onClick={() => setShowKey((prev) => !prev)}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-foreground-tertiary hover:text-foreground-secondary"
            aria-label={showKey ? "API キーを非表示" : "API キーを表示"}
          >
            {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </SettingsField>

      <SettingsField
        label="モデル ID"
        description="使用する AI モデルの ID を指定します（例: gpt-4o, gpt-4o-mini, claude-sonnet-4-6）。"
        htmlFor="ai-model-id"
      >
        <input
          id="ai-model-id"
          type="text"
          value={aiModelId}
          onChange={(e) => onAiModelIdChange(e.target.value)}
          placeholder="gpt-4o-mini"
          disabled={!isElectron}
          className={BASE_INPUT_CLASS}
        />
      </SettingsField>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void handleTestConnection()}
          disabled={!isElectron || !apiKey || testStatus === "testing"}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {testStatus === "testing" && <Loader2 className="h-4 w-4 animate-spin" />}
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
    </SettingsSection>
  );
}
