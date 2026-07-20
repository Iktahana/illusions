/**
 * Regression test for #1567 (S3) — MilkdownEditor view-polling effect.
 *
 * Two problems:
 *   1. Editor.tsx passed an inline arrow as `onEditorViewReady`, and the
 *      polling effect lists it in its deps — the effect restarted on EVERY
 *      render. Fixed by stabilizing the prop with useCallback in Editor.tsx.
 *   2. The polling chain (setTimeout retries) had no unmount guard: a retry
 *      already scheduled when the effect tore down could fire afterwards and
 *      call setState / the ready callback after unmount.
 *
 * MilkdownEditor itself cannot be mounted in jsdom (heavy Milkdown deps), so
 * this test exercises a minimal mirror of the polling effect's exact shape —
 * same pattern as `active-panel-focus-skip-setActive.test.tsx` (#1457).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

interface PollerProps {
  /** Mirrors `get()` + `editor.ctx.get(editorViewCtx)` — null while not ready. */
  getView: () => { id: string } | null;
  onReady: (view: { id: string }) => void;
}

/** Minimal mirror of MilkdownEditor's view-polling effect (post-fix shape). */
function ViewPoller({ getView, onReady }: PollerProps): null {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 10;

    const tryGetEditorView = () => {
      if (cancelled) return;
      attempts++;
      try {
        const view = getView();
        if (view) {
          onReady(view);
          return;
        }
      } catch {
        // まだ準備中
      }
      if (attempts < maxAttempts) {
        timer = setTimeout(tryGetEditorView, 100);
      }
    };

    timer = setTimeout(tryGetEditorView, 100);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [getView, onReady]);
  return null;
}

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.useRealTimers();
});

describe("#1567 — view-polling effect unmount guard", () => {
  it("delivers the view once it becomes available while mounted", () => {
    const view = { id: "v1" };
    let ready: { id: string } | null = null;
    const getView = vi.fn(() => ready);
    const onReady = vi.fn();

    act(() => {
      root.render(<ViewPoller getView={getView} onReady={onReady} />);
    });

    // Not ready on the first two polls, then ready.
    act(() => {
      vi.advanceTimersByTime(250);
    });
    ready = view;
    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(onReady).toHaveBeenCalledTimes(1);
    expect(onReady).toHaveBeenCalledWith(view);
  });

  it("does NOT invoke the ready callback after unmount (cancel guard)", () => {
    const getView = vi.fn(() => ({ id: "v1" }));
    const onReady = vi.fn();

    act(() => {
      root.render(<ViewPoller getView={getView} onReady={onReady} />);
    });

    // Unmount before the first poll fires, then let any stray timers run.
    act(() => {
      root.unmount();
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(onReady).not.toHaveBeenCalled();
    expect(getView).not.toHaveBeenCalled();
  });

  it("stops the retry chain when the effect re-runs (no zombie pollers)", () => {
    const onReadyA = vi.fn();
    const onReadyB = vi.fn();
    const neverReady = () => null;
    const readyView = { id: "v2" };

    act(() => {
      root.render(<ViewPoller getView={neverReady} onReady={onReadyA} />);
    });
    act(() => {
      vi.advanceTimersByTime(250);
    });

    // Effect deps change → old chain must be cancelled, new chain takes over.
    act(() => {
      root.render(<ViewPoller getView={() => readyView} onReady={onReadyB} />);
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(onReadyA).not.toHaveBeenCalled();
    expect(onReadyB).toHaveBeenCalledTimes(1);
    expect(onReadyB).toHaveBeenCalledWith(readyView);
  });
});
