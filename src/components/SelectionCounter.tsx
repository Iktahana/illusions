"use client";

import type { CSSProperties } from "react";
import { useMemo } from "react";

import type { EditorSelectionState } from "@/lib/editor-page/use-selection-tracking";

interface SelectionCounterProps {
  selectionState: EditorSelectionState;
  isVertical?: boolean;
  containerElement: HTMLDivElement | null;
}

export default function SelectionCounter({
  selectionState,
  isVertical = false,
  containerElement,
}: SelectionCounterProps) {
  const isVisible = selectionState.hasSelection && selectionState.selectionCount > 0;
  const displayCount = isVisible ? selectionState.selectionCount : 0;

  const style = useMemo<CSSProperties | null>(() => {
    const wrapper = containerElement?.parentElement;
    if (!containerElement || !wrapper) return null;

    const wrapperRect = wrapper.getBoundingClientRect();
    const padding = 16;

    if (isVertical) {
      const startRight = selectionState.startCoords?.right ?? selectionState.rangeRect?.right;
      const endRight = selectionState.endCoords?.right ?? selectionState.rangeRect?.right;
      const xRight = Math.max(
        startRight ?? wrapperRect.right - padding,
        endRight ?? wrapperRect.right - padding,
      );
      const relativeX = Math.max(
        padding,
        Math.min(wrapperRect.width - padding, xRight - wrapperRect.left),
      );

      return {
        position: "absolute",
        bottom: padding,
        left: relativeX,
        transform: "translateX(-100%)",
      };
    }

    const fallbackY = selectionState.endCoords?.top ?? selectionState.rangeRect?.top;
    const cursorY =
      typeof selectionState.pointerClientY === "number"
        ? selectionState.pointerClientY
        : (fallbackY ?? wrapperRect.top + wrapperRect.height / 2);
    const relativeY = Math.max(
      padding,
      Math.min(wrapperRect.height - padding, cursorY - wrapperRect.top),
    );

    return {
      position: "absolute",
      top: relativeY,
      right: padding,
      transform: "translateY(-50%)",
    };
  }, [
    containerElement,
    isVertical,
    selectionState.endCoords,
    selectionState.pointerClientY,
    selectionState.rangeRect,
    selectionState.startCoords,
  ]);

  if (!isVisible || displayCount === 0 || !style) {
    return null;
  }

  return (
    <div
      className={`z-30 px-2 py-1 text-sm text-foreground-tertiary pointer-events-none transition-opacity duration-300 whitespace-nowrap ${
        isVisible ? "opacity-100" : "opacity-0"
      }`}
      style={style}
    >
      <span className="font-semibold">{displayCount}</span>
      <span className="ml-1">文字</span>
    </div>
  );
}
