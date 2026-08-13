/**
 * NLP Client Factory
 *
 * Provides the Electron renderer NLP client backed by IPC.
 */

import type { INlpClient } from "./types";
import { ElectronNlpClient } from "@/platform/electron-renderer/nlp-client";

let cachedClient: INlpClient | null = null;

/**
 * Get the Electron NLP client.
 *
 * @returns Singleton NLP client instance
 */
export function getNlpClient(): INlpClient {
  if (cachedClient) {
    return cachedClient;
  }

  cachedClient = new ElectronNlpClient();
  return cachedClient;
}

/**
 * Reset the cached client (useful for testing)
 */
export function resetNlpClient(): void {
  cachedClient = null;
}

// Ensure we always have a client
export { getNlpClient as default };

// Re-export types for convenience
export type { INlpClient, Token, WordEntry, TokenizeProgress } from "./types";
