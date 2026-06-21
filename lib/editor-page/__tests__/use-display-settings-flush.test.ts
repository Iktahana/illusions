/**
 * Regression test for #1885: display-setting changes (e.g. font scale, line
 * height) that trigger an editor remount must flush the live ProseMirror
 * content before calling incrementEditorKey().
 *
 * Root cause: the Milkdown plugin-listener debounces its onChange call by
 * 200 ms. If a setting handler calls incrementEditorKey() directly, the editor
 * unmounts before the debounce fires, so the last typed characters are lost.
 *
 * Fix (app/page.tsx): useEditorSettings receives incrementEditorKeyWithFlush
 * instead of bare incrementEditorKey. The wrapper calls
 * flushActiveEditorRef.current?.() first, which synchronously serialises the
 * live ProseMirror doc and calls setContent() before the remount.
 *
 * This test unit-tests the handler ordering with a mock flush ref and a mock
 * increment function. A full editor-remount integration test is impractical
 * without a real browser runtime (#1896 tracks UI-test verification).
 */

import { describe, it, expect, vi } from "vitest";

// ---------------------------------------------------------------------------
// Helper: replicate the incrementEditorKeyWithFlush factory from page.tsx
// ---------------------------------------------------------------------------

/**
 * Mirrors the logic from app/page.tsx:
 *
 *   const incrementEditorKeyWithFlush = useCallback(() => {
 *     flushActiveEditorRef.current?.();
 *     incrementEditorKey();
 *   }, [incrementEditorKey]);
 */
function makeIncrementWithFlush(
  flushRef: { current: (() => string | null) | null },
  increment: () => void,
): () => void {
  return () => {
    flushRef.current?.();
    increment();
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("incrementEditorKeyWithFlush (#1885)", () => {
  it("calls flush before incrementEditorKey", () => {
    const callOrder: string[] = [];

    const flushRef: { current: (() => string | null) | null } = {
      current: () => {
        callOrder.push("flush");
        return "flushed content";
      },
    };
    const increment = vi.fn(() => {
      callOrder.push("increment");
    });

    const incrementWithFlush = makeIncrementWithFlush(flushRef, increment);
    incrementWithFlush();

    expect(callOrder).toEqual(["flush", "increment"]);
    expect(increment).toHaveBeenCalledOnce();
  });

  it("still calls incrementEditorKey when no flush is registered (null ref)", () => {
    const flushRef: { current: (() => string | null) | null } = { current: null };
    const increment = vi.fn();

    const incrementWithFlush = makeIncrementWithFlush(flushRef, increment);
    incrementWithFlush();

    expect(increment).toHaveBeenCalledOnce();
  });

  it("does not call a stale flush after the editor unmounts (ref cleared to null)", () => {
    const flush = vi.fn(() => null);
    const flushRef: { current: (() => string | null) | null } = { current: flush };
    const increment = vi.fn();

    const incrementWithFlush = makeIncrementWithFlush(flushRef, increment);

    // Simulate editor unmount clearing the ref (MilkdownEditor's cleanup)
    flushRef.current = null;

    incrementWithFlush();

    expect(flush).not.toHaveBeenCalled();
    expect(increment).toHaveBeenCalledOnce();
  });

  it("captures the content returned by flush before remounting", () => {
    const LIVE_CONTENT = "最新のコンテンツ";
    let capturedContent: string | null = null;

    const flushRef: { current: (() => string | null) | null } = {
      current: () => {
        capturedContent = LIVE_CONTENT;
        return LIVE_CONTENT;
      },
    };
    const increment = vi.fn();

    const incrementWithFlush = makeIncrementWithFlush(flushRef, increment);
    incrementWithFlush();

    // flush must have written content before increment triggers remount
    expect(capturedContent).toBe(LIVE_CONTENT);
    expect(increment).toHaveBeenCalledOnce();
  });
});
