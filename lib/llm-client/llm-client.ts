/**
 * LLM Client Factory
 *
 * Returns a CloudLlmClient configured with the given provider config.
 * Works in all environments (Electron and web).
 */

import type { ILlmClient, LlmProviderConfig } from "./types";
import { CloudLlmClient } from "./cloud-llm-client";

let cachedClient: ILlmClient | null = null;

/**
 * Get the LLM client for the current provider config.
 *
 * Pass a config to update the active provider.
 * Call with no argument to get the current cached client (or a null-config client).
 *
 * @returns CloudLlmClient instance
 */
export function getLlmClient(config?: LlmProviderConfig | null): ILlmClient {
  if (config !== undefined) {
    cachedClient = new CloudLlmClient(config ?? null);
    return cachedClient;
  }

  if (cachedClient) {
    return cachedClient;
  }

  cachedClient = new CloudLlmClient(null);
  return cachedClient;
}

/**
 * Reset the cached client (useful for testing or after config changes).
 */
export function resetLlmClient(): void {
  cachedClient = null;
}
