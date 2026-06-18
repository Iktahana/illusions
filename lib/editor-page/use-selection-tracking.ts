import type { RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { EditorView } from "@milkdown/prose/view";

import {
  extractVisibleText,
  countVisibleChars,
  countManuscriptCells,
  countManuscriptPages,
} from "@/lib/editor-page/text-statistics";

export interface ViewportRect {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

export interface EditorSelectionState {
  hasSelection: boolean;
  selectionCount: number;
  isCollapsed: boolean;
  from: number;
  to: number;
  startCoords: ViewportRect | null;
  endCoords: ViewportRect | null;
  rangeRect: ViewportRect | null;
  pointerClientY: number | null;
}

export interface SelectionSearchRange {
  from: number;
  to: number;
}

interface UseSelectionTrackingOptions {
  editorViewInstance: EditorView | null;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  onSelectionChange?: (charCount: number, manuscriptCells: number, manuscriptPages: number) => void;
  onSelectionRangeChange?: (range: SelectionSearchRange | null) => void;
}

const EMPTY_SELECTION_STATE: EditorSelectionState = {
  hasSelection: false,
  selectionCount: 0,
  isCollapsed: true,
  from: 0,
  to: 0,
  startCoords: null,
  endCoords: null,
  rangeRect: null,
  pointerClientY: null,
};

function toViewportRect(rect: {
  top: number;
  left: number;
  right: number;
  bottom: number;
}): ViewportRect {
  return {
    top: rect.top,
    left: rect.left,
    right: rect.right,
    bottom: rect.bottom,
  };
}

function sameRect(a: ViewportRect | null, b: ViewportRect | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.top === b.top && a.left === b.left && a.right === b.right && a.bottom === b.bottom;
}

function sameSelectionState(a: EditorSelectionState, b: EditorSelectionState): boolean {
  return (
    a.hasSelection === b.hasSelection &&
    a.selectionCount === b.selectionCount &&
    a.isCollapsed === b.isCollapsed &&
    a.from === b.from &&
    a.to === b.to &&
    a.pointerClientY === b.pointerClientY &&
    sameRect(a.startCoords, b.startCoords) &&
    sameRect(a.endCoords, b.endCoords) &&
    sameRect(a.rangeRect, b.rangeRect)
  );
}

export function getEditorSelectionSearchRange(selection: {
  empty: boolean;
  from: number;
  to: number;
}): SelectionSearchRange | null {
  return !selection.empty && selection.from < selection.to
    ? { from: selection.from, to: selection.to }
    : null;
}

function safeCoordsAtPos(editorViewInstance: EditorView, pos: number): ViewportRect | null {
  try {
    return toViewportRect(editorViewInstance.coordsAtPos(pos));
  } catch {
    return null;
  }
}

function selectionBelongsToEditor(selection: Selection | null, editorDom: HTMLElement): boolean {
  if (!selection || selection.rangeCount === 0) return false;
  const { anchorNode, focusNode } = selection;
  return (
    !!anchorNode && !!focusNode && editorDom.contains(anchorNode) && editorDom.contains(focusNode)
  );
}

export function useSelectionTracking({
  editorViewInstance,
  scrollContainerRef,
  onSelectionChange,
  onSelectionRangeChange,
}: UseSelectionTrackingOptions): EditorSelectionState {
  const [selectionState, setSelectionState] = useState<EditorSelectionState>(EMPTY_SELECTION_STATE);
  const selectionStateRef = useRef(selectionState);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const onSelectionRangeChangeRef = useRef(onSelectionRangeChange);
  const lastReportedRangeRef = useRef<SelectionSearchRange | null>(null);
  const lastPointerYRef = useRef<number | null>(null);
  const lastReportedCountRef = useRef(0);
  // 原稿用紙マス数も保持する。可視文字数が同じでも禁則処理でマス数は変わり得るため、
  // 範囲を選び直したときに古い値が残らないよう、マス数の変化でも callback を発火させる。
  const lastReportedCellsRef = useRef(0);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    selectionStateRef.current = selectionState;
  }, [selectionState]);

  useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange;
  }, [onSelectionChange]);

  useEffect(() => {
    onSelectionRangeChangeRef.current = onSelectionRangeChange;
  }, [onSelectionRangeChange]);

  const reportSelectionRange = useCallback(
    (selection: { empty: boolean; from: number; to: number }) => {
      const range = getEditorSelectionSearchRange(selection);
      const previous = lastReportedRangeRef.current;
      if (previous?.from === range?.from && previous?.to === range?.to) return;
      lastReportedRangeRef.current = range;
      onSelectionRangeChangeRef.current?.(range);
    },
    [],
  );

  const updateSelectionState = useCallback(() => {
    if (!editorViewInstance) {
      if (lastReportedCountRef.current !== 0 || lastReportedCellsRef.current !== 0) {
        lastReportedCountRef.current = 0;
        lastReportedCellsRef.current = 0;
        onSelectionChangeRef.current?.(0, 0, 0);
      }
      setSelectionState((prev) =>
        sameSelectionState(prev, EMPTY_SELECTION_STATE) ? prev : EMPTY_SELECTION_STATE,
      );
      reportSelectionRange({ empty: true, from: 0, to: 0 });
      return;
    }

    const { state, dom } = editorViewInstance;
    const { selection } = state;
    const domSelection = document.getSelection();
    const belongsToEditor = selectionBelongsToEditor(domSelection, dom);

    let nextState = {
      ...EMPTY_SELECTION_STATE,
      from: selection.from,
      to: selection.to,
      pointerClientY: lastPointerYRef.current,
    };

    if (!selection.empty && belongsToEditor) {
      const selectedText = state.doc.textBetween(selection.from, selection.to);
      // MDI 記法を含む可能性があるため extractVisibleText で記法を剥がしてからカウント
      const visibleText = extractVisibleText(selectedText);
      const selectionCount = countVisibleChars(visibleText);
      const selectionManuscriptCells = countManuscriptCells(visibleText);
      const selectionManuscriptPages = countManuscriptPages(selectionManuscriptCells);
      const range =
        domSelection && domSelection.rangeCount > 0
          ? domSelection.getRangeAt(0).getBoundingClientRect()
          : null;

      nextState = {
        hasSelection: selectionCount > 0,
        selectionCount,
        isCollapsed: false,
        from: selection.from,
        to: selection.to,
        startCoords: safeCoordsAtPos(editorViewInstance, selection.from),
        endCoords: safeCoordsAtPos(editorViewInstance, selection.to),
        rangeRect:
          range && !(range.width === 0 && range.height === 0) ? toViewportRect(range) : null,
        pointerClientY: lastPointerYRef.current,
      };

      if (
        lastReportedCountRef.current !== selectionCount ||
        lastReportedCellsRef.current !== selectionManuscriptCells
      ) {
        lastReportedCountRef.current = selectionCount;
        lastReportedCellsRef.current = selectionManuscriptCells;
        onSelectionChangeRef.current?.(
          selectionCount,
          selectionManuscriptCells,
          selectionManuscriptPages,
        );
      }
    } else if (lastReportedCountRef.current !== 0 || lastReportedCellsRef.current !== 0) {
      lastReportedCountRef.current = 0;
      lastReportedCellsRef.current = 0;
      onSelectionChangeRef.current?.(0, 0, 0);
    }

    reportSelectionRange(selection);
    setSelectionState((prev) => (sameSelectionState(prev, nextState) ? prev : nextState));
  }, [editorViewInstance, reportSelectionRange]);

  const scheduleUpdate = useCallback(
    (pointerClientY?: number | null) => {
      if (typeof pointerClientY === "number") {
        lastPointerYRef.current = pointerClientY;
      } else if (pointerClientY === null) {
        lastPointerYRef.current = null;
      }

      if (frameRef.current !== null) {
        return;
      }

      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        updateSelectionState();
      });
    },
    [updateSelectionState],
  );

  useEffect(() => {
    if (!editorViewInstance) {
      scheduleUpdate(null);
      return;
    }

    const editorDom = editorViewInstance.dom;
    const scrollContainer = scrollContainerRef.current;

    const handleMouseMove = (event: MouseEvent) => {
      if ((event.buttons & 1) === 1) {
        scheduleUpdate(event.clientY);
      }
    };

    const handleMouseUp = (event: MouseEvent) => {
      scheduleUpdate(event.clientY);
    };

    const handleKeyUp = () => {
      scheduleUpdate();
    };

    const handleSelectionChange = () => {
      const domSelection = document.getSelection();
      const belongsToEditor = selectionBelongsToEditor(domSelection, editorDom);
      if (!belongsToEditor && !selectionStateRef.current.hasSelection) {
        return;
      }
      scheduleUpdate();
    };

    const handleViewportMove = () => {
      if (selectionStateRef.current.hasSelection) {
        scheduleUpdate();
      }
    };

    editorDom.addEventListener("mousemove", handleMouseMove);
    editorDom.addEventListener("mouseup", handleMouseUp);
    editorDom.addEventListener("keyup", handleKeyUp);
    document.addEventListener("selectionchange", handleSelectionChange);
    scrollContainer?.addEventListener("scroll", handleViewportMove, { passive: true });
    window.addEventListener("resize", handleViewportMove);

    scheduleUpdate();

    return () => {
      editorDom.removeEventListener("mousemove", handleMouseMove);
      editorDom.removeEventListener("mouseup", handleMouseUp);
      editorDom.removeEventListener("keyup", handleKeyUp);
      document.removeEventListener("selectionchange", handleSelectionChange);
      scrollContainer?.removeEventListener("scroll", handleViewportMove);
      window.removeEventListener("resize", handleViewportMove);
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [editorViewInstance, scheduleUpdate, scrollContainerRef]);

  return selectionState;
}
