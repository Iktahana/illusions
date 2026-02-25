import { AsyncMutex } from "../utils/async-mutex";
import { getStorageService } from "./storage-service";

import type { AppState } from "./storage-types";

/**
 * Mutex to serialize all persistAppState calls.
 * Prevents TOCTOU race conditions when multiple callers concurrently
 * fire-and-forget updates (e.g., `void persistAppState({ ... })`).
 *
 * persistAppStateの全呼び出しを直列化するミューテックス。
 * 複数の呼び出し元が同時にfire-and-forgetで更新する際の
 * TOCTOUレースコンディションを防止する。
 */
const persistMutex = new AsyncMutex();

export async function fetchAppState(): Promise<AppState | null> {
  const storage = getStorageService();
  await storage.initialize();
  return storage.loadAppState();
}

export async function persistAppState(updates: Partial<AppState>): Promise<AppState> {
  const release = await persistMutex.acquire();
  try {
    const storage = getStorageService();
    await storage.initialize();

    const existing = (await storage.loadAppState()) ?? {};
    const merged: AppState = {
      ...existing,
      ...updates,
    };

    await storage.saveAppState(merged);
    return merged;
  } finally {
    release();
  }
}
