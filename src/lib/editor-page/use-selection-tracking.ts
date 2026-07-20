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

type IdleCallbackHandle = number;
type IdleCallbackDeadline = { didTimeout: boolean; timeRemaining: () => number };
type WindowWithIdleCallback = Window & {
  requestIdleCallback?: (
    callback: (deadline: IdleCallbackDeadline) => void,
    options?: { timeout?: number },
  ) => IdleCallbackHandle;
  cancelIdleCallback?: (handle: IdleCallbackHandle) => void;
};

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

const SELECTION_STATS_DEBOUNCE_MS = 120;
const SELECTION_STATS_IDLE_TIMEOUT_MS = 800;

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
  const lastComputedStatsRef = useRef<{
    doc: unknown;
    from: number;
    to: number;
    selectionCount: number;
    manuscriptCells: number;
    manuscriptPages: number;
  } | null>(null);
  const frameRef = useRef<number | null>(null);
  const statsDebounceRef = useRef<number | null>(null);
  const statsIdleRef = useRef<IdleCallbackHandle | null>(null);
  const statsJobIdRef = useRef(0);

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

  const clearScheduledStats = useCallback(() => {
    if (statsDebounceRef.current !== null) {
      window.clearTimeout(statsDebounceRef.current);
      statsDebounceRef.current = null;
    }
    if (statsIdleRef.current !== null) {
      const idleWindow = window as WindowWithIdleCallback;
      if (idleWindow.cancelIdleCallback) {
        idleWindow.cancelIdleCallback(statsIdleRef.current);
      } else {
        window.clearTimeout(statsIdleRef.current);
      }
      statsIdleRef.current = null;
    }
  }, []);

  const publishSelectionStats = useCallback(
    (
      view: EditorView,
      doc: unknown,
      from: number,
      to: number,
      selectionCount: number,
      manuscriptCells: number,
      manuscriptPages: number,
    ) => {
      lastComputedStatsRef.current = {
        doc,
        from,
        to,
        selectionCount,
        manuscriptCells,
        manuscriptPages,
      };

      setSelectionState((prev) => {
        if (prev.from !== from || prev.to !== to || !prev.hasSelection) return prev;
        const next = {
          ...prev,
          selectionCount,
          hasSelection: selectionCount > 0,
        };
        return sameSelectionState(prev, next) ? prev : next;
      });

      if (
        view.state.doc === doc &&
        view.state.selection.from === from &&
        view.state.selection.to === to &&
        (lastReportedCountRef.current !== selectionCount ||
          lastReportedCellsRef.current !== manuscriptCells)
      ) {
        lastReportedCountRef.current = selectionCount;
        lastReportedCellsRef.current = manuscriptCells;
        onSelectionChangeRef.current?.(selectionCount, manuscriptCells, manuscriptPages);
      }
    },
    [],
  );

  const scheduleSelectionStats = useCallback(
    (view: EditorView, from: number, to: number) => {
      const { doc } = view.state;
      const cachedStats = lastComputedStatsRef.current;
      if (
        cachedStats &&
        cachedStats.doc === doc &&
        cachedStats.from === from &&
        cachedStats.to === to
      ) {
        publishSelectionStats(
          view,
          doc,
          from,
          to,
          cachedStats.selectionCount,
          cachedStats.manuscriptCells,
          cachedStats.manuscriptPages,
        );
        return;
      }

      clearScheduledStats();
      const jobId = ++statsJobIdRef.current;
      statsDebounceRef.current = window.setTimeout(() => {
        statsDebounceRef.current = null;

        const run = () => {
          statsIdleRef.current = null;
          if (
            jobId !== statsJobIdRef.current ||
            view.state.doc !== doc ||
            view.state.selection.from !== from ||
            view.state.selection.to !== to
          ) {
            return;
          }

          const selectedText = doc.textBetween(from, to);
          // MDI 記法を含む可能性があるため extractVisibleText で記法を剥がしてからカウント
          const visibleText = extractVisibleText(selectedText);
          const selectionCount = countVisibleChars(visibleText);
          const manuscriptCells = countManuscriptCells(visibleText);
          const manuscriptPages = countManuscriptPages(manuscriptCells);
          publishSelectionStats(
            view,
            doc,
            from,
            to,
            selectionCount,
            manuscriptCells,
            manuscriptPages,
          );
        };

        const idleWindow = window as WindowWithIdleCallback;
        if (idleWindow.requestIdleCallback) {
          statsIdleRef.current = idleWindow.requestIdleCallback(run, {
            timeout: SELECTION_STATS_IDLE_TIMEOUT_MS,
          });
        } else {
          statsIdleRef.current = window.setTimeout(run, 0);
        }
      }, SELECTION_STATS_DEBOUNCE_MS);
    },
    [clearScheduledStats, publishSelectionStats],
  );

  const updateSelectionState = useCallback(() => {
    if (!editorViewInstance) {
      clearScheduledStats();
      statsJobIdRef.current += 1;
      if (lastReportedCountRef.current !== 0 || lastReportedCellsRef.current !== 0) {
        lastReportedCountRef.current = 0;
        lastReportedCellsRef.current = 0;
        lastComputedStatsRef.current = null;
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
      const cachedStats = lastComputedStatsRef.current;
      const hasCachedStats =
        cachedStats &&
        cachedStats.doc === state.doc &&
        cachedStats.from === selection.from &&
        cachedStats.to === selection.to;
      const range =
        domSelection && domSelection.rangeCount > 0
          ? domSelection.getRangeAt(0).getBoundingClientRect()
          : null;

      nextState = {
        hasSelection: true,
        selectionCount: hasCachedStats ? cachedStats.selectionCount : 0,
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
        !hasCachedStats &&
        (lastReportedCountRef.current !== 0 || lastReportedCellsRef.current !== 0)
      ) {
        lastReportedCountRef.current = 0;
        lastReportedCellsRef.current = 0;
        onSelectionChangeRef.current?.(0, 0, 0);
      }
      scheduleSelectionStats(editorViewInstance, selection.from, selection.to);
    } else if (lastReportedCountRef.current !== 0 || lastReportedCellsRef.current !== 0) {
      clearScheduledStats();
      statsJobIdRef.current += 1;
      lastReportedCountRef.current = 0;
      lastReportedCellsRef.current = 0;
      lastComputedStatsRef.current = null;
      onSelectionChangeRef.current?.(0, 0, 0);
    } else {
      clearScheduledStats();
      statsJobIdRef.current += 1;
    }

    reportSelectionRange(selection);
    setSelectionState((prev) => (sameSelectionState(prev, nextState) ? prev : nextState));
  }, [clearScheduledStats, editorViewInstance, reportSelectionRange, scheduleSelectionStats]);

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
      clearScheduledStats();
      statsJobIdRef.current += 1;
    };
  }, [clearScheduledStats, editorViewInstance, scheduleUpdate, scrollContainerRef]);

  return selectionState;
}
