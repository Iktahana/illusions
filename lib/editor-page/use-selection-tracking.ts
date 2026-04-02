import { useCallback, useEffect, useRef, useState } from "react";

import type { EditorView } from "@milkdown/prose/view";

interface UseSelectionTrackingOptions {
  /** The current ProseMirror EditorView instance. */
  editorViewInstance: EditorView | null;
  /** Called with the non-whitespace character count of the current selection (0 when nothing is selected). */
  onSelectionChange?: (charCount: number) => void;
}

interface UseSelectionTrackingResult {
  /** Whether the editor currently has a non-empty text selection. */
  hasSelection: boolean;
}

/**
 * Tracks the editor's text selection and reports the selected character count.
 *
 * Attaches mouseup/keyup/selectionchange listeners to the ProseMirror DOM and
 * batches updates to the next animation frame to avoid excessive re-renders.
 */
export function useSelectionTracking({
  editorViewInstance,
  onSelectionChange,
}: UseSelectionTrackingOptions): UseSelectionTrackingResult {
  const [hasSelection, setHasSelection] = useState(false);

  // コールバック参照（レンダリングのたびにエフェクトを再登録しないように）
  const onSelectionChangeRef = useRef(onSelectionChange);
  useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange;
  }, [onSelectionChange]);

  // 選択文字数を更新する（editorViewInstance が変わったときだけ再生成）
  const updateSelectionCount = useCallback(() => {
    if (!editorViewInstance) return;
    const { state } = editorViewInstance;
    const { selection } = state;
    const { from, to } = selection;

    // 選択がない場合は 0
    if (from === to) {
      setHasSelection(false);
      onSelectionChangeRef.current?.(0);
      return;
    }

    // 選択文字列の文字数を数える（空白は除外）
    const selectedText = state.doc.textBetween(from, to);
    const count = selectedText.replace(/\s/g, "").length;
    setHasSelection(count > 0);
    onSelectionChangeRef.current?.(count);
  }, [editorViewInstance]);

  // 選択変更のスケジューリング（同一フレーム内の重複更新を抑制）
  const frameRef = useRef<number | null>(null);
  const scheduleUpdate = useCallback(() => {
    if (frameRef.current !== null) {
      return;
    }
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      updateSelectionCount();
    });
  }, [updateSelectionCount]);

  // 選択範囲の変更を追跡する
  useEffect(() => {
    if (!editorViewInstance) return;

    const editorDom = editorViewInstance.dom;

    editorDom.addEventListener("mouseup", scheduleUpdate);
    editorDom.addEventListener("keyup", scheduleUpdate);
    document.addEventListener("selectionchange", scheduleUpdate);

    // 初期値
    scheduleUpdate();

    return () => {
      editorDom.removeEventListener("mouseup", scheduleUpdate);
      editorDom.removeEventListener("keyup", scheduleUpdate);
      document.removeEventListener("selectionchange", scheduleUpdate);
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [editorViewInstance, scheduleUpdate]);

  return { hasSelection };
}
