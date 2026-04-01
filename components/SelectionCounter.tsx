"use client";

import type { RefObject } from "react";
import { useEffect, useState } from "react";
import { EditorView } from "@milkdown/prose/view";

interface SelectionCounterProps {
  editorView: EditorView;
  isVertical?: boolean;
  containerRef: RefObject<HTMLDivElement | null>;
}

/**
 * 選択文字数バッジ。
 *
 * Editor の外枠 wrapper（position: relative）の子として描画し、
 * position: absolute で配置する。
 *
 * - 横書き: 外枠の右端に貼り付け、Y はマウスカーソル位置に合わせる
 * - 縦書き: 外枠の下端に貼り付け、X はセレクション右端列に合わせる
 */
export default function SelectionCounter({
  editorView,
  isVertical = false,
  containerRef,
}: SelectionCounterProps) {
  const [selectionCount, setSelectionCount] = useState<number>(0);
  const [isVisible, setIsVisible] = useState<boolean>(false);
  const [style, setStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    if (!editorView) return;

    const updateSelectionCount = (event?: MouseEvent | Event) => {
      const { state } = editorView;
      const { selection } = state;
      const { from, to } = selection;

      // 位置を計算する
      // 親要素（Editor 外枠 wrapper, position: relative）を基準にする
      const container = containerRef.current;
      const wrapper = container?.parentElement;
      if (wrapper) {
        const wrapperRect = wrapper.getBoundingClientRect();
        const padding = 16;

        // キーボード選択時は選択末尾の座標をフォールバックに使う
        const fallbackCoords =
          !(event instanceof MouseEvent) && from !== to ? editorView.coordsAtPos(to) : null;

        if (isVertical) {
          // 縦書き: 外枠の下端に固定、X はセレクション右端列に合わせる
          let xRight = wrapperRect.right - padding;
          if (from !== to) {
            try {
              const startCoords = editorView.coordsAtPos(from);
              const endCoords = editorView.coordsAtPos(to);
              xRight = Math.max(startCoords.right, endCoords.right);
            } catch {
              xRight = fallbackCoords?.right ?? xRight;
            }
          }
          // viewport 座標を wrapper 相対に変換
          const relativeX = Math.max(
            padding,
            Math.min(wrapperRect.width - padding, xRight - wrapperRect.left),
          );
          setStyle({
            position: "absolute",
            bottom: padding,
            left: relativeX,
            transform: "translateX(-100%)",
          });
        } else {
          // 横書き: 外枠の右端に貼り付け、Y はマウス位置に合わせる
          let cursorY: number;
          if (event instanceof MouseEvent) {
            cursorY = event.clientY;
          } else if (fallbackCoords) {
            cursorY = fallbackCoords.top;
          } else {
            cursorY = wrapperRect.top + wrapperRect.height / 2;
          }
          // viewport 座標を wrapper 相対に変換し、wrapper 内にクランプ
          const relativeY = Math.max(
            padding,
            Math.min(wrapperRect.height - padding, cursorY - wrapperRect.top),
          );
          setStyle({
            position: "absolute",
            top: relativeY,
            right: padding,
            transform: "translateY(-50%)",
          });
        }
      }

      // 選択がない場合は非表示
      if (from === to) {
        setIsVisible(false);
        setTimeout(() => setSelectionCount(0), 300);
        return;
      }

      const selectedText = state.doc.textBetween(from, to);
      const count = selectedText.replace(/\s/g, "").length;
      setSelectionCount(count);
      setIsVisible(true);
    };

    const editorDom = editorView.dom;

    // マウス位置を常に追跡（selectionchange 時にも使えるように）
    let lastMouseEvent: MouseEvent | null = null;

    const handleMouseMove = (e: MouseEvent) => {
      lastMouseEvent = e;
    };

    const handleMouseUp = (e: MouseEvent) => {
      lastMouseEvent = e;
      setTimeout(() => updateSelectionCount(e), 10);
    };

    const handleKeyUp = () => {
      setTimeout(() => updateSelectionCount(), 10);
    };

    const handleSelectionChange = () => {
      setTimeout(() => updateSelectionCount(lastMouseEvent ?? undefined), 10);
    };

    editorDom.addEventListener("mousemove", handleMouseMove);
    editorDom.addEventListener("mouseup", handleMouseUp);
    editorDom.addEventListener("keyup", handleKeyUp);
    document.addEventListener("selectionchange", handleSelectionChange);

    updateSelectionCount();

    return () => {
      editorDom.removeEventListener("mousemove", handleMouseMove);
      editorDom.removeEventListener("mouseup", handleMouseUp);
      editorDom.removeEventListener("keyup", handleKeyUp);
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, [editorView, isVertical, containerRef]);

  if (selectionCount === 0 && !isVisible) {
    return null;
  }

  return (
    <div
      className={`z-30 px-2 py-1 text-sm text-foreground-tertiary pointer-events-none transition-opacity duration-300 whitespace-nowrap ${
        isVisible ? "opacity-100" : "opacity-0"
      }`}
      style={style}
    >
      <span className="font-semibold">{selectionCount}</span>
      <span className="ml-1">文字</span>
    </div>
  );
}
