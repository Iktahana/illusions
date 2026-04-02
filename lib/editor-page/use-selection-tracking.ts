import type { RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { EditorView } from "@milkdown/prose/view";

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

interface UseSelectionTrackingOptions {
  editorViewInstance: EditorView | null;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  onSelectionChange?: (charCount: number) => void;
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
}: UseSelectionTrackingOptions): EditorSelectionState {
  const [selectionState, setSelectionState] = useState<EditorSelectionState>(EMPTY_SELECTION_STATE);
  const selectionStateRef = useRef(selectionState);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const lastPointerYRef = useRef<number | null>(null);
  const lastReportedCountRef = useRef(0);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    selectionStateRef.current = selectionState;
  }, [selectionState]);

  useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange;
  }, [onSelectionChange]);

  const updateSelectionState = useCallback(() => {
    if (!editorViewInstance) {
      if (lastReportedCountRef.current !== 0) {
        lastReportedCountRef.current = 0;
        onSelectionChangeRef.current?.(0);
      }
      setSelectionState((prev) =>
        sameSelectionState(prev, EMPTY_SELECTION_STATE) ? prev : EMPTY_SELECTION_STATE,
      );
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
      const selectionCount = selectedText.replace(/\s/g, "").length;
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
    }

    if (lastReportedCountRef.current !== nextState.selectionCount) {
      lastReportedCountRef.current = nextState.selectionCount;
      onSelectionChangeRef.current?.(nextState.selectionCount);
    }

    setSelectionState((prev) => (sameSelectionState(prev, nextState) ? prev : nextState));
  }, [editorViewInstance]);

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
