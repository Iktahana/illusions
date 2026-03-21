/** Available cloud AI providers */
export type LlmProvider = "openai" | "anthropic" | "google";

/** Configuration for a cloud LLM provider */
export interface LlmProviderConfig {
  provider: LlmProvider;
  /** Model identifier, e.g. "gpt-4o-mini", "claude-haiku-4-5-20251001", "gemini-2.0-flash" */
  model: string;
  /** API key for the provider */
  apiKey: string;
}

/** Result of a single LLM inference call */
export interface LlmInferenceResult {
  text: string;
  tokenCount: number;
}

/**
 * Cloud LLM client interface.
 *
 * All inference is done via cloud APIs — no local model lifecycle management.
 * Clients are always "available" as long as a valid provider config is set.
 */
export interface ILlmClient {
  /** Returns true if a provider config with API key is set */
  isAvailable(): boolean;

  /** Returns the current provider config, or null if not configured */
  getProviderConfig(): LlmProviderConfig | null;

  /**
   * Run a single inference call.
   * Throws with a Japanese error message on network or API errors.
   */
  infer(
    prompt: string,
    options?: { signal?: AbortSignal; maxTokens?: number },
  ): Promise<LlmInferenceResult>;

  /**
   * Run multiple inference calls in parallel via Promise.all.
   * Throws with a Japanese error message on network or API errors.
   */
  inferBatch(
    prompts: string[],
    options?: { signal?: AbortSignal; maxTokens?: number },
  ): Promise<LlmInferenceResult[]>;
}
