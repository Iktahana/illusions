/**
 * LLM Client Factory
 *
 * Automatically selects the appropriate LLM client based on environment:
 * - Electron: Uses ElectronLlmClient (IPC communication)
 * - Web: Uses WebLlmClient (stub, not available)
 */

import type { ILlmClient } from "./types";
import { ElectronLlmClient } from "./electron-llm-client";
import { WebLlmClient } from "./web-llm-client";

let cachedClient: ILlmClient | null = null;

/**
 * Get the appropriate LLM client for current environment
 *
 * @returns Singleton LLM client instance
 */
export function getLlmClient(): ILlmClient {
  if (cachedClient) {
    return cachedClient;
  }

  // Detect environment
  const isElectron =
    typeof window !== "undefined" &&
    window.electronAPI?.isElectron === true;

  let client: ILlmClient;

  if (isElectron) {
    client = new ElectronLlmClient();
  } else {
    client = new WebLlmClient();
  }

  cachedClient = client;
  return client;
}

/**
 * Reset the cached client (useful for testing)
 */
export function resetLlmClient(): void {
  cachedClient = null;
}
