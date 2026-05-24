/**
 * Tests for useRubyTcy hook – ref-based editorView access.
 *
 * Issue #1456: dialog failed to open when editorViewInstance was still null
 * at first context-menu click. Fix migrates to editorViewRef (MutableRefObject)
 * so the latest view is always read inside callbacks.
 *
 * We test via a minimal React render using createRoot + act (no @testing-library/react).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import type { MutableRefObject } from "react";
import type { EditorView } from "@milkdown/prose/view";

// Minimal EditorView mock factory
function makeView(from: number, to: number, text: string): EditorView {
  return {
    state: {
      selection: { from, to },
      doc: {
        textBetween: (_from: number, _to: number) => text,
      },
      schema: { nodes: {} },
      tr: {
        replaceWith: vi.fn().mockReturnThis(),
        insertText: vi.fn().mockReturnThis(),
      },
    },
    dispatch: vi.fn(),
  } as unknown as EditorView;
}

// Helper to create typed spy functions
function makeMocks() {
  const calls = {
    selectedText: [] as string[],
    showDialog: [] as boolean[],
  };
  function setRubySelectedText(text: string) {
    calls.selectedText.push(text);
  }
  function setShowRubyDialog(show: boolean) {
    calls.showDialog.push(show);
  }
  function reset() {
    calls.selectedText.length = 0;
    calls.showDialog.length = 0;
  }
  return { calls, setRubySelectedText, setShowRubyDialog, reset };
}

// ----- Pure logic extraction for unit testing -----

/**
 * Test shim that mirrors the REFACTORED useRubyTcy.handleOpenRubyDialog logic.
 */
function createHandleOpenRubyDialog(opts: {
  editorViewRef: MutableRefObject<EditorView | null>;
  setRubySelectedText: (text: string) => void;
  setShowRubyDialog: (show: boolean) => void;
}) {
  return function handleOpenRubyDialog() {
    const view = opts.editorViewRef.current;
    if (!view) return;
    try {
      const { from, to } = view.state.selection;
      if (from === to) return;
      const text = view.state.doc.textBetween(from, to);
      if (!text.trim()) return;
      opts.setRubySelectedText(text);
      opts.setShowRubyDialog(true);
    } catch {
      return;
    }
  };
}

describe("useRubyTcy – ref-based editorView access (TDD logic shim)", () => {
  let mocks: ReturnType<typeof makeMocks>;
  let editorViewRef: MutableRefObject<EditorView | null>;

  beforeEach(() => {
    mocks = makeMocks();
    editorViewRef = { current: null };
  });

  it("case 1: ref.current starts null then assigned – second invocation opens dialog", () => {
    const handleOpenRubyDialog = createHandleOpenRubyDialog({
      editorViewRef,
      setRubySelectedText: mocks.setRubySelectedText,
      setShowRubyDialog: mocks.setShowRubyDialog,
    });

    // First call: ref is null → dialog must NOT open
    handleOpenRubyDialog();
    expect(mocks.calls.showDialog).toHaveLength(0);

    // Assign view (simulates editor mount after first render)
    editorViewRef.current = makeView(0, 5, "テスト");

    // Second call: ref.current is now valid → dialog must open
    handleOpenRubyDialog();
    expect(mocks.calls.selectedText).toContain("テスト");
    expect(mocks.calls.showDialog).toContain(true);
  });

  it("case 2: handler reads latest selection from ref.current after selection changes", () => {
    editorViewRef.current = makeView(0, 3, "初期");

    const handleOpenRubyDialog = createHandleOpenRubyDialog({
      editorViewRef,
      setRubySelectedText: mocks.setRubySelectedText,
      setShowRubyDialog: mocks.setShowRubyDialog,
    });

    handleOpenRubyDialog();
    expect(mocks.calls.selectedText).toContain("初期");
    mocks.reset();

    // Replace with a new view that has a different selection
    editorViewRef.current = makeView(10, 15, "更新後");

    handleOpenRubyDialog();
    // Must read fresh selection from updated ref.current, NOT stale captured value
    expect(mocks.calls.selectedText).toContain("更新後");
    expect(mocks.calls.showDialog).toContain(true);
  });

  it("does not open dialog when selection is empty (from === to)", () => {
    editorViewRef.current = makeView(5, 5, "");

    const handleOpenRubyDialog = createHandleOpenRubyDialog({
      editorViewRef,
      setRubySelectedText: mocks.setRubySelectedText,
      setShowRubyDialog: mocks.setShowRubyDialog,
    });

    handleOpenRubyDialog();
    expect(mocks.calls.showDialog).toHaveLength(0);
  });

  it("does not open dialog when selected text is whitespace only", () => {
    editorViewRef.current = makeView(0, 3, "   ");

    const handleOpenRubyDialog = createHandleOpenRubyDialog({
      editorViewRef,
      setRubySelectedText: mocks.setRubySelectedText,
      setShowRubyDialog: mocks.setShowRubyDialog,
    });

    handleOpenRubyDialog();
    expect(mocks.calls.showDialog).toHaveLength(0);
  });

  it("swallows thrown errors from destroyed view (defensive)", () => {
    editorViewRef.current = {
      state: {
        get selection(): never {
          throw new Error("view is destroyed");
        },
      },
    } as unknown as EditorView;

    const handleOpenRubyDialog = createHandleOpenRubyDialog({
      editorViewRef,
      setRubySelectedText: mocks.setRubySelectedText,
      setShowRubyDialog: mocks.setShowRubyDialog,
    });

    expect(() => handleOpenRubyDialog()).not.toThrow();
    expect(mocks.calls.showDialog).toHaveLength(0);
  });
});

// ----- Integration: test the ACTUAL useRubyTcy hook via React render -----
// These tests verify the refactored hook accepts editorViewRef interface.

import { useRubyTcy } from "../use-ruby-tcy";

function UseRubyTcyWrapper({
  editorViewRef,
  mocks: m,
  triggerRef,
}: {
  editorViewRef: MutableRefObject<EditorView | null>;
  mocks: ReturnType<typeof makeMocks>;
  triggerRef: MutableRefObject<(() => void) | null>;
}) {
  const { handleOpenRubyDialog } = useRubyTcy({
    editorViewRef,
    setRubySelectedText: m.setRubySelectedText,
    setShowRubyDialog: m.setShowRubyDialog,
  });
  triggerRef.current = handleOpenRubyDialog;
  return null;
}

describe("useRubyTcy hook – actual implementation (ref-based interface)", () => {
  let root: Root;
  let container: HTMLDivElement;
  let mocks: ReturnType<typeof makeMocks>;
  let editorViewRef: MutableRefObject<EditorView | null>;
  let triggerRef: MutableRefObject<(() => void) | null>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mocks = makeMocks();
    editorViewRef = { current: null };
    triggerRef = { current: null };
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  function mountHook() {
    act(() => {
      root.render(
        React.createElement(UseRubyTcyWrapper, {
          editorViewRef,
          mocks,
          triggerRef,
        }),
      );
    });
  }

  it("hook: ref starts null → then assigned → dialog opens on second call", () => {
    mountHook();

    // First call with null ref
    act(() => {
      triggerRef.current?.();
    });
    expect(mocks.calls.showDialog).toHaveLength(0);

    // Set the view on the ref (no re-render needed for ref mutation)
    editorViewRef.current = makeView(0, 5, "フック統合");

    act(() => {
      triggerRef.current?.();
    });
    expect(mocks.calls.selectedText).toContain("フック統合");
    expect(mocks.calls.showDialog).toContain(true);
  });

  it("hook: reads updated selection from ref without requiring re-render", () => {
    editorViewRef.current = makeView(0, 3, "古い選択");
    mountHook();

    act(() => {
      triggerRef.current?.();
    });
    expect(mocks.calls.selectedText).toContain("古い選択");
    mocks.reset();

    // Update ref — no re-render
    editorViewRef.current = makeView(5, 10, "新しい選択");

    act(() => {
      triggerRef.current?.();
    });
    expect(mocks.calls.selectedText).toContain("新しい選択");
  });
});
