"use client";

import { useCallback, useEffect } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import type { EditorView } from "@milkdown/prose/view";
import { dispatchIfEditorViewAlive } from "@/shared/lib/editor-view-safety";

interface UseEditorLifecycleParams {
  flushTabState: () => Promise<void>;
  flushLayoutState: () => Promise<void>;
  skipAutoRestore: boolean;
  isElectron: boolean;
  handleOpenAsProject: (projectPath: string, initialFile: string) => Promise<void>;
  tabLoadSystemFile: (path: string, content: string) => void;
  incrementEditorKey: () => void;
  wasAutoRecovered?: boolean;
  dismissedRecovery: boolean;
  recoveryExiting: boolean;
  setDismissedRecovery: Dispatch<SetStateAction<boolean>>;
  setRecoveryExiting: Dispatch<SetStateAction<boolean>>;
  /**
   * #1966 H-5/H-6: true while the user has a pending 「このバッファを使用」/「破棄」
   * choice. The recovery banner must stay visible (no auto-fadeout) until resolved.
   */
  recoveryActionPending?: boolean;
  editorViewInstance: EditorView | null;
  contentRef: MutableRefObject<string>;
  setContent: (content: string) => void;
}

interface UseEditorLifecycleResult {
  handlePasteAsPlaintext: () => Promise<void>;
  handleInsertText: (text: string) => void;
  handleChapterClick: (anchorId: string) => void;
}

export function useEditorLifecycle({
  flushTabState,
  flushLayoutState,
  skipAutoRestore,
  isElectron,
  handleOpenAsProject,
  tabLoadSystemFile,
  incrementEditorKey,
  wasAutoRecovered,
  dismissedRecovery,
  recoveryExiting,
  setDismissedRecovery,
  setRecoveryExiting,
  recoveryActionPending,
  editorViewInstance,
  contentRef,
  setContent,
}: UseEditorLifecycleParams): UseEditorLifecycleResult {
  useEffect(() => {
    const handleBeforeUnload = () => {
      void flushTabState();
      void flushLayoutState();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [flushTabState, flushLayoutState]);

  useEffect(() => {
    if (skipAutoRestore && typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      let changed = false;

      if (params.has("welcome")) {
        params.delete("welcome");
        changed = true;
      }
      if (params.has("pending-file")) {
        params.delete("pending-file");
        changed = true;
      }

      if (changed) {
        const cleanUrl = window.location.pathname + (params.toString() ? `?${params}` : "");
        window.history.replaceState({}, "", cleanUrl);
      }
    }
  }, [skipAutoRestore]);

  // Phase 3: getPendingFile 経路は削除。Phase 8 で再導入する。

  useEffect(() => {
    // #1966 H-5/H-6: バッファ選択待ちの間は自動フェードアウトしない（ユーザーの
    // 明示的な「使用 / 破棄」操作を待つ）。
    if (wasAutoRecovered && !dismissedRecovery && !recoveryExiting && !recoveryActionPending) {
      const fadeoutTimer = setTimeout(() => {
        setRecoveryExiting(true);
      }, 5000);

      return () => clearTimeout(fadeoutTimer);
    }

    if (recoveryExiting) {
      const dismissTimer = setTimeout(() => {
        setDismissedRecovery(true);
      }, 300);

      return () => clearTimeout(dismissTimer);
    }
  }, [
    wasAutoRecovered,
    dismissedRecovery,
    recoveryExiting,
    recoveryActionPending,
    setDismissedRecovery,
    setRecoveryExiting,
  ]);

  const insertTextAtSelectionOrAppend = useCallback(
    (text: string) => {
      if (editorViewInstance) {
        dispatchIfEditorViewAlive(editorViewInstance, (view) => {
          const { from, to } = view.state.selection;
          return view.state.tr.insertText(text, from, to);
        });
      } else {
        const currentContent = contentRef.current;
        const newContent = currentContent ? `${currentContent}\n\n${text}` : text;
        setContent(newContent);
        incrementEditorKey();
      }
    },
    [editorViewInstance, contentRef, setContent, incrementEditorKey],
  );

  const handlePasteAsPlaintext = useCallback(async () => {
    try {
      let text: string | null = null;

      if (isElectron && typeof window !== "undefined" && window.electronAPI) {
        if (navigator.clipboard && navigator.clipboard.readText) {
          text = await navigator.clipboard.readText();
        }
      } else {
        if (navigator.clipboard && navigator.clipboard.readText) {
          text = await navigator.clipboard.readText();
        }
      }

      if (text) {
        insertTextAtSelectionOrAppend(text);
      }
    } catch (error) {
      console.error("Failed to paste as plaintext:", error);
    }
  }, [insertTextAtSelectionOrAppend, isElectron]);

  const handleInsertText = useCallback(
    (text: string) => {
      insertTextAtSelectionOrAppend(text);
    },
    [insertTextAtSelectionOrAppend],
  );

  const handleChapterClick = useCallback((anchorId: string) => {
    if (!anchorId) return;

    const target = document.getElementById(anchorId) as HTMLElement | null;
    if (!target) return;

    target.scrollIntoView({ behavior: "smooth", block: "start" });
    target.focus();
  }, []);

  return {
    handlePasteAsPlaintext,
    handleInsertText,
    handleChapterClick,
  };
}
