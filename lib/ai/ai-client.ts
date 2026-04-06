/**
 * AI Client — singleton factory + OpenAI SDK wrapper.
 *
 * Follows the same pattern as getNlpClient() in lib/nlp-client/nlp-client.ts.
 *
 * Usage:
 *   configureAiClient({ apiKey, modelId });  // called by use-ai-settings hook
 *   const client = getAiClient();
 *   if (client.isConfigured()) { ... }
 */

import OpenAI from "openai";

import type {
  AiClientConfig,
  AiChatMessage,
  ExtractedCharacter,
  IAiClient,
  LintValidationResult,
  RewriteSuggestion,
} from "./types";
import type { LintIssue } from "@/lib/linting/types";

// ---------------------------------------------------------------------------
// Singleton state
// ---------------------------------------------------------------------------

let currentConfig: AiClientConfig | null = null;
let cachedClient: IAiClient | null = null;

/**
 * Push configuration from the settings layer.
 * Invalidates the cached client when config changes.
 */
export function configureAiClient(config: AiClientConfig): void {
  const changed =
    currentConfig?.apiKey !== config.apiKey ||
    currentConfig?.baseUrl !== config.baseUrl ||
    currentConfig?.modelId !== config.modelId;

  currentConfig = config;
  if (changed) {
    cachedClient = null;
  }
}

/**
 * Get the AI client singleton.
 * Returns an UnconfiguredAiClient if no API key has been set.
 */
export function getAiClient(): IAiClient {
  if (cachedClient) {
    return cachedClient;
  }

  if (currentConfig?.apiKey) {
    cachedClient = new AiClient(currentConfig);
  } else {
    cachedClient = new UnconfiguredAiClient();
  }

  return cachedClient;
}

/**
 * Reset the cached client (useful for testing or when settings change)
 */
export function resetAiClient(): void {
  cachedClient = null;
  currentConfig = null;
}

/**
 * Test connectivity using the given config without affecting the singleton.
 * Calls /models to verify the API key and endpoint are valid.
 *
 * @returns Number of available models on success
 * @throws Error with descriptive message on failure
 */
export async function testAiConnection(config: AiClientConfig): Promise<number> {
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl || "https://api.openai.com/v1",
    dangerouslyAllowBrowser: true,
  });
  const models = await client.models.list();
  return models.data.length;
}

// Re-export types for convenience
export type {
  IAiClient,
  AiClientConfig,
  AiChatMessage,
  LintValidationResult,
  RewriteSuggestion,
  ExtractedCharacter,
} from "./types";

// ---------------------------------------------------------------------------
// UnconfiguredAiClient — stub returned when no API key is set
// ---------------------------------------------------------------------------

class UnconfiguredAiClient implements IAiClient {
  isConfigured(): boolean {
    return false;
  }

  validateLintIssues(): Promise<LintValidationResult[]> {
    return Promise.reject(
      new Error("AI client is not configured. Please set an API key in Settings > AI API."),
    );
  }

  suggestRewrite(): Promise<RewriteSuggestion> {
    return Promise.reject(
      new Error("AI client is not configured. Please set an API key in Settings > AI API."),
    );
  }

  extractCharacters(): Promise<ExtractedCharacter[]> {
    return Promise.reject(
      new Error("AI client is not configured. Please set an API key in Settings > AI API."),
    );
  }

   
  async *streamChat(): AsyncIterable<string> {
    throw new Error("AI client is not configured. Please set an API key in Settings > AI API.");
  }
}

// ---------------------------------------------------------------------------
// AiClient — OpenAI SDK wrapper with domain methods
// ---------------------------------------------------------------------------

class AiClient implements IAiClient {
  private readonly openai: OpenAI;
  private readonly modelId: string;

  constructor(config: AiClientConfig) {
    this.openai = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl || "https://api.openai.com/v1",
      dangerouslyAllowBrowser: true,
    });
    this.modelId = config.modelId;
  }

  isConfigured(): boolean {
    return true;
  }

  async validateLintIssues(
    text: string,
    issues: LintIssue[],
    signal?: AbortSignal,
  ): Promise<LintValidationResult[]> {
    const issueDescriptions = issues
      .map((issue, i) => {
        const snippet = text.slice(issue.from, issue.to);
        return `${i + 1}. [${issue.ruleId}] "${snippet}" — ${issue.message}`;
      })
      .join("\n");

    const response = await this.openai.chat.completions.create(
      {
        model: this.modelId,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              "You are a Japanese text proofreading assistant.",
              "Given the original text and a list of detected lint issues, determine whether each issue is genuine or a false positive.",
              'Respond with a JSON object: { "results": [{ "index": number, "isGenuine": boolean, "reasoning": string }] }',
              "Consider context, literary style, and intentional stylistic choices when evaluating.",
            ].join("\n"),
          },
          {
            role: "user",
            content: `Original text:\n${text}\n\nDetected issues:\n${issueDescriptions}`,
          },
        ],
      },
      { signal },
    );

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return [];
    }

    const parsed = JSON.parse(content) as {
      results: Array<{ index: number; isGenuine: boolean; reasoning: string }>;
    };

    return parsed.results.map((r) => ({
      issueRuleId: issues[r.index - 1]?.ruleId ?? "unknown",
      isGenuine: r.isGenuine,
      reasoning: r.reasoning,
    }));
  }

  async suggestRewrite(
    text: string,
    instruction?: string,
    signal?: AbortSignal,
  ): Promise<RewriteSuggestion> {
    const systemPrompt = [
      "You are a Japanese novel writing assistant.",
      "Suggest an improved version of the given text while preserving the author's voice and intent.",
      instruction ? `Additional instruction: ${instruction}` : "",
      'Respond with a JSON object: { "original": string, "suggestion": string, "explanation": string }',
      "The explanation should be in Japanese.",
    ]
      .filter(Boolean)
      .join("\n");

    const response = await this.openai.chat.completions.create(
      {
        model: this.modelId,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
      },
      { signal },
    );

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return { original: text, suggestion: text, explanation: "" };
    }

    return JSON.parse(content) as RewriteSuggestion;
  }

  async extractCharacters(
    text: string,
    existingNames?: string[],
    signal?: AbortSignal,
  ): Promise<ExtractedCharacter[]> {
    const existingNote = existingNames?.length
      ? `\nAlready known characters (avoid duplicates): ${existingNames.join(", ")}`
      : "";

    const response = await this.openai.chat.completions.create(
      {
        model: this.modelId,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              "You are a Japanese novel analysis assistant.",
              "Extract character information from the given text.",
              'Respond with a JSON object: { "characters": [{ "name": string, "aliases": string[], "description": string }] }',
              "Use Japanese for all descriptions.",
              existingNote,
            ]
              .filter(Boolean)
              .join("\n"),
          },
          { role: "user", content: text },
        ],
      },
      { signal },
    );

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return [];
    }

    const parsed = JSON.parse(content) as { characters: ExtractedCharacter[] };
    return parsed.characters;
  }

  async *streamChat(messages: AiChatMessage[], signal?: AbortSignal): AsyncIterable<string> {
    const stream = await this.openai.chat.completions.create(
      {
        model: this.modelId,
        messages,
        stream: true,
      },
      { signal },
    );

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        yield delta;
      }
    }
  }
}
