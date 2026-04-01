"use client";

import type { RefObject } from "react";
import { useEffect, useState } from "react";
import { EditorView } from "@milkdown/prose/view";

interface SelectionCounterProps {
  editorView: EditorView;
  isVertical?: boolean;
  containerRef: RefObject<HTMLDivElement | null>;
}

export default function SelectionCounter({
  editorView,
  isVertical = false,
  containerRef,
}: SelectionCounterProps) {
  const [selectionCount, setSelectionCount] = useState<number>(0);
  const [isVisible, setIsVisible] = useState<boolean>(false);
  const [position, setPosition] = useState<{
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
  }>({ top: 0, right: 0 });

  useEffect(() => {
    if (!editorView) return;

    const updateSelectionCount = (event?: MouseEvent | Event) => {
      const { state } = editorView;
      const { selection } = state;
      const { from, to } = selection;

      // 表示位置を更新する
      const container = containerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();

        // キーボード選択時は選択末尾の座標をフォールバックに使う
        const fallbackCoords =
          !(event instanceof MouseEvent) && from !== to ? editorView.coordsAtPos(to) : null;

        if (isVertical) {
          // 縦書き: エディタの一番下に配置
          const xPos =
            event instanceof MouseEvent
              ? event.clientX
              : (fallbackCoords?.left ?? rect.left + rect.width / 2);
          setPosition({
            bottom: window.innerHeight - rect.bottom + 16,
            left: xPos,
          });
        } else {
          // 横書き: エディタの一番右に配置
          const yPos =
            event instanceof MouseEvent
              ? event.clientY
              : (fallbackCoords?.top ?? rect.top + rect.height / 2);
          setPosition({
            top: yPos,
            right: window.innerWidth - rect.right + 16,
          });
        }
      }

      // 選択がない場合は非表示
      if (from === to) {
        setIsVisible(false);
        // フェードアウトのため、少し遅らせてカウントを消す
        setTimeout(() => setSelectionCount(0), 300);
        return;
      }

      // 選択文字列を取得
      const selectedText = state.doc.textBetween(from, to);

      // 文字数を数える（空白除外。アプリのカウント方法に合わせる）
      const count = selectedText.replace(/\s/g, "").length;
      setSelectionCount(count);
      setIsVisible(true);
    };

    // 選択変更を購読
    const editorDom = editorView.dom;

    const handleMouseUp = (e: MouseEvent) => {
      // 選択確定を待つ
      setTimeout(() => updateSelectionCount(e), 10);
    };

    const handleKeyUp = () => {
      // キーボード選択は直近の位置を使う
      setTimeout(() => updateSelectionCount(), 10);
    };

    const handleSelectionChange = () => {
      // ネイティブの selectionchange（ドラッグ/三連クリック等）を扱う
      setTimeout(() => updateSelectionCount(), 10);
    };

    editorDom.addEventListener("mouseup", handleMouseUp);
    editorDom.addEventListener("keyup", handleKeyUp);
    document.addEventListener("selectionchange", handleSelectionChange);

    // 初期値
    updateSelectionCount();

    return () => {
      editorDom.removeEventListener("mouseup", handleMouseUp);
      editorDom.removeEventListener("keyup", handleKeyUp);
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, [editorView, isVertical, containerRef]);

  // 選択がない場合は描画しない
  if (selectionCount === 0 && !isVisible) {
    return null;
  }

  return (
    <div
      className={`fixed z-30 px-2 py-1 text-sm text-foreground-tertiary pointer-events-none transition-opacity duration-300 ${
        isVisible ? "opacity-100" : "opacity-0"
      }`}
      style={{
        top: position.top !== undefined ? `${position.top}px` : undefined,
        right: position.right !== undefined ? `${position.right}px` : undefined,
        bottom: position.bottom !== undefined ? `${position.bottom}px` : undefined,
        left: position.left !== undefined ? `${position.left}px` : undefined,
      }}
    >
      <span className="font-semibold">{selectionCount}</span>
      <span className="ml-1">文字</span>
    </div>
  );
}
