"use client";

import { useState, useCallback, useRef } from "react";

/**
 * Result of the save callback passed to useUnsavedWarning (#1859).
 *
 * `allSaved` must be true only when every dirty buffer was actually written.
 * When false (a save was cancelled / failed / conflicted), the pending action
 * is NOT executed and the warning stays open — preventing silent data loss on
 * project switch.
 */
export interface UnsavedSaveResult {
  allSaved: boolean;
}

export interface UseUnsavedWarningReturn {
  showWarning: boolean;
  confirmBeforeAction: (action: () => void | Promise<void>) => Promise<void>;
  handleSave: () => Promise<void>;
  handleDiscard: () => void;
  handleCancel: () => void;
}

/**
 * 統一的未保存警告 Hook
 *
 * 使用方法：
 * 1. 保護が必要な操作前に confirmBeforeAction(action) を呼び出す
 * 2. 未保存の変更がある場合、ダイアログを表示
 * 3. ユーザー選択後、対応する操作を実行
 */
export function useUnsavedWarning(
  isDirty: boolean,
  /**
   * Save callback. Must save ALL dirty buffers (not just the active tab) and
   * report whether every one succeeded (#1859). A `void`-returning callback is
   * still accepted for backward compatibility; the absence of a result is
   * treated as success.
   */
  saveFile: () => Promise<UnsavedSaveResult | void>,
  _currentFileName: string | null,
): UseUnsavedWarningReturn {
  const [showWarning, setShowWarning] = useState(false);
  const pendingActionRef = useRef<(() => void | Promise<void>) | null>(null);

  /**
   * 確認後に操作を実行
   * 未保存の変更がある場合、ダイアログを表示；それ以外は直接実行
   */
  const confirmBeforeAction = useCallback(
    async (action: () => void | Promise<void>) => {
      // 未保存の変更がない場合、直接実行
      if (!isDirty) {
        await action();
        return;
      }

      // 新規ファイルで一度も保存されていない場合、必ず警告
      // または保存済みファイルだが修正がある場合も警告
      pendingActionRef.current = action;
      setShowWarning(true);
    },
    [isDirty],
  );

  /**
   * ユーザーが「保存」を選択
   */
  const handleSave = useCallback(async () => {
    try {
      // まず全ての未保存バッファを保存 (#1859)
      const result = await saveFile();

      // 保存がキャンセル/失敗した場合は操作を実行せず、ダイアログも閉じない。
      // (result が void の場合は後方互換のため成功扱い)
      if (result && result.allSaved === false) {
        return;
      }

      // 全保存成功後、待機中の操作を実行
      if (pendingActionRef.current) {
        await pendingActionRef.current();
        pendingActionRef.current = null;
      }
    } catch (error) {
      console.error("保存失敗:", error);
      // 保存失敗時は操作を実行せず、ダイアログを閉じない
      return;
    }

    setShowWarning(false);
  }, [saveFile]);

  /**
   * ユーザーが「保存しない」を選択
   */
  const handleDiscard = useCallback(() => {
    // 変更を破棄して、待機中の操作を直接実行
    if (pendingActionRef.current) {
      void pendingActionRef.current();
      pendingActionRef.current = null;
    }
    setShowWarning(false);
  }, []);

  /**
   * ユーザーが「キャンセル」を選択
   */
  const handleCancel = useCallback(() => {
    // 操作をキャンセルして、待機中のアクションをクリア
    pendingActionRef.current = null;
    setShowWarning(false);
  }, []);

  return {
    showWarning,
    confirmBeforeAction,
    handleSave,
    handleDiscard,
    handleCancel,
  };
}
