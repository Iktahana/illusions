/**
 * Regression test for the #1878 follow-up data-corruption bug.
 *
 * #1878 fixed undo-history loss on tab switch by keeping NovelEditor instances
 * mounted across tab switches (no remount; dockview keeps inactive panes mounted
 * via portals). That broke an assumption in MilkdownEditor: the flush-registration
 * effect was keyed on `[flushContent]` only and read `registerFlush` through a ref,
 * so it ran ONLY at mount/unmount. When a pane toggled active <-> inactive, its
 * `registerFlush` prop flipped (active = real registrar, inactive = undefined) but
 * the effect did NOT re-run. Consequently `flushActiveEditorRef` kept pointing at
 * whichever editor was active AT MOUNT, not the currently active pane. After
 * switching A -> B and editing B, saving B serialized A's doc and overwrote B.
 *
 * Fix (components/editor/MilkdownEditor.tsx): include `registerFlush` in the
 * effect deps so registration FOLLOWS the active pane — register `flushContent`
 * when active, clear (`null`) when becoming inactive — and the parent's stable
 * `registerFlush` callback means it re-runs exactly on active-state transitions.
 *
 * This test drives the REAL effect logic (createRoot + act, repo pattern) wired
 * exactly like app/page.tsx (`registerFlush` writes a shared `flushActiveEditorRef`)
 * and EditorLayout (`registerFlush={isActivePanel ? real : undefined}`). It asserts
 * that after an A -> B active-pane switch, the shared ref serializes B's document,
 * NOT A's. The deliberately STALE variant (deps `[flushContent]` + ref indirection)
 * is included to prove this test fails against the pre-fix wiring.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import React, { useEffect, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ---------------------------------------------------------------------------
// Harness: the single shared "active editor flush" slot, wired exactly like
// app/page.tsx (`flushActiveEditorRef` + the stable `registerFlush` callback).
// ---------------------------------------------------------------------------

type Flush = (() => string | null) | null;

interface Harness {
  flushActiveEditorRef: { current: Flush };
  /** Stable registrar, same shape as app/page.tsx's useCallback([]) version. */
  registerFlush: (flush: Flush) => void;
}

function makeHarness(): Harness {
  const flushActiveEditorRef: { current: Flush } = { current: null };
  // Stable across renders (mirrors useCallback([]) in app/page.tsx).
  const registerFlush = (flush: Flush): void => {
    flushActiveEditorRef.current = flush;
  };
  return { flushActiveEditorRef, registerFlush };
}

// ---------------------------------------------------------------------------
// FIXED pane: mirrors MilkdownEditor's effect after the #1878 follow-up fix —
// registerFlush is read directly and is a dep, so the effect follows active state.
// ---------------------------------------------------------------------------

function FixedPane({
  registerFlush,
  content,
}: {
  registerFlush?: (flush: Flush) => void;
  content: string;
}): null {
  // `flushContent` is stable per pane (useCallback over a stable serializer).
  const contentRef = useRef(content);
  contentRef.current = content;
  const flushContent = useRef<() => string | null>(() => contentRef.current).current;

  useEffect(() => {
    registerFlush?.(flushContent);
    return () => {
      registerFlush?.(null);
    };
  }, [registerFlush, flushContent]);

  return null;
}

// ---------------------------------------------------------------------------
// STALE pane: mirrors the PRE-FIX effect (deps [flushContent] only + ref read).
// Kept to prove the test catches the regression.
// ---------------------------------------------------------------------------

function StalePane({
  registerFlush,
  content,
}: {
  registerFlush?: (flush: Flush) => void;
  content: string;
}): null {
  const contentRef = useRef(content);
  contentRef.current = content;
  const flushContent = useRef<() => string | null>(() => contentRef.current).current;

  const registerFlushRef = useRef(registerFlush);
  registerFlushRef.current = registerFlush;
  useEffect(() => {
    registerFlushRef.current?.(flushContent);
    return () => {
      registerFlushRef.current?.(null);
    };
  }, [flushContent]);

  return null;
}

// Two panes A and B, only the active one gets the real registrar (EditorLayout).
function TwoPaneLayout({
  Pane,
  registerFlush,
  activePane,
}: {
  Pane: typeof FixedPane;
  registerFlush: (flush: Flush) => void;
  activePane: "A" | "B";
}): React.ReactElement {
  return (
    <>
      <Pane registerFlush={activePane === "A" ? registerFlush : undefined} content="A の本文" />
      <Pane registerFlush={activePane === "B" ? registerFlush : undefined} content="B の本文" />
    </>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("flush registration follows the active pane (#1878 regression)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("serializes the NEW active pane (B) after an A -> B switch — fixed wiring", () => {
    const h = makeHarness();

    act(() => {
      root.render(
        <TwoPaneLayout Pane={FixedPane} registerFlush={h.registerFlush} activePane="A" />,
      );
    });
    // Initially A is active.
    expect(h.flushActiveEditorRef.current?.()).toBe("A の本文");

    // Switch active pane A -> B (tab switch; both stay mounted).
    act(() => {
      root.render(
        <TwoPaneLayout Pane={FixedPane} registerFlush={h.registerFlush} activePane="B" />,
      );
    });

    // The shared flush must now serialize B's document, NOT A's.
    expect(h.flushActiveEditorRef.current?.()).toBe("B の本文");
  });

  it("switching back B -> A re-registers A", () => {
    const h = makeHarness();

    act(() => {
      root.render(
        <TwoPaneLayout Pane={FixedPane} registerFlush={h.registerFlush} activePane="A" />,
      );
    });
    act(() => {
      root.render(
        <TwoPaneLayout Pane={FixedPane} registerFlush={h.registerFlush} activePane="B" />,
      );
    });
    act(() => {
      root.render(
        <TwoPaneLayout Pane={FixedPane} registerFlush={h.registerFlush} activePane="A" />,
      );
    });

    expect(h.flushActiveEditorRef.current?.()).toBe("A の本文");
  });

  it("PRE-FIX wiring leaks A's content after switching to B (proves the test catches it)", () => {
    const h = makeHarness();

    act(() => {
      root.render(
        <TwoPaneLayout Pane={StalePane} registerFlush={h.registerFlush} activePane="A" />,
      );
    });
    act(() => {
      root.render(
        <TwoPaneLayout Pane={StalePane} registerFlush={h.registerFlush} activePane="B" />,
      );
    });

    // The stale effect never re-ran, so the shared ref still points at A — the bug.
    expect(h.flushActiveEditorRef.current?.()).toBe("A の本文");
    expect(h.flushActiveEditorRef.current?.()).not.toBe("B の本文");
  });
});
