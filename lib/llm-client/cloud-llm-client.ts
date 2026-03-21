/**
 * Cloud LLM Client
 *
 * Implements ILlmClient by calling cloud AI provider APIs directly.
 * Works in both Electron (main process fetch) and web (browser fetch).
 * Supports OpenAI, Anthropic, and Google Gemini.
 */

import type { ILlmClient, LlmProviderConfig, LlmInferenceResult } from "./types";

const DEFAULT_MAX_TOKENS = 1024;

export class CloudLlmClient implements ILlmClient {
  private readonly _config: LlmProviderConfig | null;

  constructor(config: LlmProviderConfig | null) {
    this._config = config;
  }

  isAvailable(): boolean {
    return (
      this._config !== null &&
      this._config.apiKey !== "" &&
      this._config.model !== ""
    );
  }

  getProviderConfig(): LlmProviderConfig | null {
    return this._config;
  }

  async infer(
    prompt: string,
    options?: { signal?: AbortSignal; maxTokens?: number },
  ): Promise<LlmInferenceResult> {
    if (!this._config) {
      throw new Error("APIキーが設定されていません。設定画面でプロバイダーとAPIキーを設定してください。");
    }

    const maxTokens = options?.maxTokens ?? DEFAULT_MAX_TOKENS;

    switch (this._config.provider) {
      case "openai":
        return this._inferOpenAI(prompt, maxTokens, options?.signal);
      case "anthropic":
        return this._inferAnthropic(prompt, maxTokens, options?.signal);
      case "google":
        return this._inferGoogle(prompt, maxTokens, options?.signal);
    }
  }

  async inferBatch(
    prompts: string[],
    options?: { signal?: AbortSignal; maxTokens?: number },
  ): Promise<LlmInferenceResult[]> {
    if (prompts.length === 0) return [];
    return Promise.all(prompts.map((p) => this.infer(p, options)));
  }

  // --------------------------------------------------------------------------
  // Provider-specific implementations
  // --------------------------------------------------------------------------

  private async _inferOpenAI(
    prompt: string,
    maxTokens: number,
    signal?: AbortSignal,
  ): Promise<LlmInferenceResult> {
    const config = this._config!;
    let response: Response;

    try {
      response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: [{ role: "user", content: prompt }],
          max_completion_tokens: maxTokens,
        }),
        signal,
      });
    } catch {
      throw new Error("ネットワーク接続エラーが発生しました。インターネット接続を確認してください。");
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(
        `OpenAI APIエラー (${response.status}): ${_extractErrorMessage(errorBody)}`,
      );
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>;
      usage?: { completion_tokens?: number };
    };

    const text = data.choices[0]?.message?.content ?? "";
    const tokenCount = data.usage?.completion_tokens ?? 0;
    return { text, tokenCount };
  }

  private async _inferAnthropic(
    prompt: string,
    maxTokens: number,
    signal?: AbortSignal,
  ): Promise<LlmInferenceResult> {
    const config = this._config!;
    let response: Response;

    try {
      response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": config.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: maxTokens,
          messages: [{ role: "user", content: prompt }],
        }),
        signal,
      });
    } catch {
      throw new Error("ネットワーク接続エラーが発生しました。インターネット接続を確認してください。");
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(
        `Anthropic APIエラー (${response.status}): ${_extractErrorMessage(errorBody)}`,
      );
    }

    const data = await response.json() as {
      content: Array<{ type: string; text: string }>;
      usage?: { output_tokens?: number };
    };

    const text = data.content.find((c) => c.type === "text")?.text ?? "";
    const tokenCount = data.usage?.output_tokens ?? 0;
    return { text, tokenCount };
  }

  private async _inferGoogle(
    prompt: string,
    maxTokens: number,
    signal?: AbortSignal,
  ): Promise<LlmInferenceResult> {
    const config = this._config!;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;
    let response: Response;

    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: maxTokens },
        }),
        signal,
      });
    } catch {
      throw new Error("ネットワーク接続エラーが発生しました。インターネット接続を確認してください。");
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(
        `Google Gemini APIエラー (${response.status}): ${_extractErrorMessage(errorBody)}`,
      );
    }

    const data = await response.json() as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
      usageMetadata?: { candidatesTokenCount?: number };
    };

    const text =
      data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const tokenCount = data.usageMetadata?.candidatesTokenCount ?? 0;
    return { text, tokenCount };
  }
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function _extractErrorMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: string };
      message?: string;
    };
    return parsed.error?.message ?? parsed.message ?? body.slice(0, 200);
  } catch {
    return body.slice(0, 200);
  }
}
