import { AsyncMutex } from "../utils/async-mutex";
import { getStorageService } from "./storage-service";

import type { AppState, WindowState } from "./storage-types";

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

// ---------------------------------------------------------------------------
// Per-window state (tabs + dockview layout scoped by window key)
// ---------------------------------------------------------------------------

/**
 * Separate mutex for window state writes to prevent TOCTOU races when
 * multiple debounced flushes overlap on the same window key.
 */
const windowStateMutex = new AsyncMutex();

/**
 * Persist window-scoped state (tabs, dockview layout) keyed by a stable
 * window identifier derived from the project root path or opened file path.
 * Uses the generic kv_store so each window has an isolated record.
 *
 * ウィンドウ固有の状態（タブ・レイアウト）をプロジェクトルートパスなどを
 * もとにした安定キーで保存する。kv_store を使用して各ウィンドウが独立した
 * レコードを持つようにし、マルチウィンドウ間での上書きを防ぐ。
 *
 * @param windowKey - Stable, path-derived key for this window (e.g. project root path).
 * @param updates   - Partial WindowState fields to merge into the existing record.
 */
export async function persistWindowState(
  windowKey: string,
  updates: Partial<WindowState>,
): Promise<void> {
  const release = await windowStateMutex.acquire();
  try {
    const storage = getStorageService();
    await storage.initialize();
    const key = `window_state:${windowKey}`;
    const existing = await storage.getItem(key);
    let parsed: WindowState = {};
    if (existing) {
      try {
        parsed = JSON.parse(existing) as WindowState;
      } catch {
        // Corrupted data — overwrite with fresh state
      }
    }
    const merged: WindowState = { ...parsed, ...updates };
    await storage.setItem(key, JSON.stringify(merged));
  } finally {
    release();
  }
}

/**
 * Load window-scoped state for the given window key.
 * Falls back to the global AppState's openTabs / dockviewLayout fields
 * so that existing single-window sessions migrate transparently.
 *
 * 指定されたウィンドウキーのウィンドウ状態を読み込む。
 * kv_store にデータがない場合はグローバルの AppState からマイグレーション
 * フォールバックを行い、既存のシングルウィンドウセッションが透過的に移行できる
 * ようにする。
 *
 * @param windowKey - Stable, path-derived key for this window.
 * @returns WindowState or null if nothing is stored.
 */
export async function fetchWindowState(windowKey: string): Promise<WindowState | null> {
  const storage = getStorageService();
  await storage.initialize();
  const key = `window_state:${windowKey}`;
  const data = await storage.getItem(key);
  if (data) {
    try {
      return JSON.parse(data) as WindowState;
    } catch {
      // Corrupted data — fall through to migration fallback
    }
  }
  // Migration fallback: existing sessions stored tabs/layout in global AppState.
  const appState = await storage.loadAppState();
  if (appState?.openTabs || appState?.dockviewLayout) {
    return {
      openTabs: appState.openTabs,
      dockviewLayout: appState.dockviewLayout,
    };
  }
  return null;
}
