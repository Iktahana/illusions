"use client";

import { useState, useCallback, useRef } from "react";

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
 * 使用方式：
 * 1. 在需要保護的操作前調用 confirmBeforeAction(action)
 * 2. 如果有未保存變更，會顯示對話框
 * 3. 用戶選擇後，執行對應的操作
 */
export function useUnsavedWarning(
  isDirty: boolean,
  saveFile: () => Promise<void>,
  currentFileName: string | null
): UseUnsavedWarningReturn {
  const [showWarning, setShowWarning] = useState(false);
  const pendingActionRef = useRef<(() => void | Promise<void>) | null>(null);

  /**
   * 確認後執行操作
   * 如果有未保存變更，顯示對話框；否則直接執行
   */
  const confirmBeforeAction = useCallback(
    async (action: () => void | Promise<void>) => {
      // 如果沒有未保存的變更，直接執行
      if (!isDirty) {
        await action();
        return;
      }

      // 如果是新文件且從未保存過，一定要警告
      // 或者有已保存的文件但有修改，也要警告
      pendingActionRef.current = action;
      setShowWarning(true);
    },
    [isDirty]
  );

  /**
   * 用戶選擇「保存」
   */
  const handleSave = useCallback(async () => {
    try {
      // 先保存文件
      await saveFile();
      
      // 保存成功後，執行待處理的操作
      if (pendingActionRef.current) {
        await pendingActionRef.current();
        pendingActionRef.current = null;
      }
    } catch (error) {
      console.error("保存失敗:", error);
      // 保存失敗時不執行操作，也不關閉對話框
      return;
    }
    
    setShowWarning(false);
  }, [saveFile]);

  /**
   * 用戶選擇「不保存」
   */
  const handleDiscard = useCallback(() => {
    // 丟棄變更，直接執行待處理的操作
    if (pendingActionRef.current) {
      void pendingActionRef.current();
      pendingActionRef.current = null;
    }
    setShowWarning(false);
  }, []);

  /**
   * 用戶選擇「取消」
   */
  const handleCancel = useCallback(() => {
    // 取消操作，清除待處理的動作
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
