"use client";

import { useEffect } from "react";
import { isElectronRenderer } from "../utils/runtime-env";

/**
 * Electron メニューイベントのハンドラを登録する Hook
 *
 * page.tsx で安全チェック付きの関数をバインドするために使用
 */
export function useElectronMenuHandlers(onMenuNew: () => void, onMenuOpen: () => Promise<void>) {
  const isElectron = typeof window !== "undefined" && isElectronRenderer();

  // メニューの「新規作成」
  useEffect(() => {
    if (!isElectron || !window.electronAPI?.onMenuNew) return;

    const cleanup = window.electronAPI.onMenuNew(() => {
      onMenuNew();
    });

    return cleanup;
  }, [isElectron, onMenuNew]);

  // Phase 3: onMenuOpen listener 削除。Phase 8 で再導入する。
  // onMenuOpen 引数は signature 維持のため残置。
  void onMenuOpen;
}
