/**
 * NLP Client Factory
 * 
 * Automatically selects the appropriate NLP client based on environment:
 * - Electron: Uses ElectronNlpClient (IPC communication)
 * - Web: Uses WebNlpClient (HTTP API calls)
 */

import type { INlpClient } from './types';

let cachedClient: INlpClient | null = null;

/**
 * Get the appropriate NLP client for current environment
 * 
 * @returns Singleton NLP client instance
 */
export function getNlpClient(): INlpClient {
  if (cachedClient) {
    return cachedClient;
  }

  // Detect environment
  const isElectron = 
    typeof window !== 'undefined' && 
    window.electronAPI?.isElectron === true;

  let client: INlpClient;
  
  if (isElectron) {
    console.log('[NLP] Using Electron NLP Client (IPC)');
    // Lazy import to avoid bundling in web mode
    const { ElectronNlpClient } = require('./electron-nlp-client');
    client = new ElectronNlpClient();
  } else {
    console.log('[NLP] Using Web NLP Client (API)');
    // Lazy import
    const { WebNlpClient } = require('./web-nlp-client');
    client = new WebNlpClient();
  }

  cachedClient = client;
  return client;
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
export type { INlpClient, Token, WordEntry, TokenizeProgress } from './types';
