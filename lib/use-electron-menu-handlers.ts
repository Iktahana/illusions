"use client";

import { useEffect } from "react";
import { isElectronRenderer } from "./runtime-env";

/**
 * Electron メニューイベントのハンドラを登録する Hook
 * 
 * page.tsx で安全チェック付きの関数をバインドするために使用
 */
export function useElectronMenuHandlers(
  onMenuNew: () => void,
  onMenuOpen: () => Promise<void>
) {
  const isElectron = typeof window !== "undefined" && isElectronRenderer();

  // メニューの「新規作成」
  useEffect(() => {
    if (!isElectron || !window.electronAPI?.onMenuNew) return;

    const cleanup = window.electronAPI.onMenuNew(() => {
      onMenuNew();
    });

    return cleanup;
  }, [isElectron, onMenuNew]);

  // メニューの「開く」
  useEffect(() => {
    if (!isElectron || !window.electronAPI?.onMenuOpen) return;

    const cleanup = window.electronAPI.onMenuOpen(async () => {
      await onMenuOpen();
    });

    return cleanup;
  }, [isElectron, onMenuOpen]);
}
