/**
 * Regression test for SearchResults — issue #1507.
 *
 * When two files are open and the user switches tabs, the parent's
 * editorViewInstance briefly references the destroyed EditorView before
 * the new editor mounts. Dispatching on a destroyed view throws
 * "Context editorState not found" from Milkdown.
 *
 * The fix guards every dispatch site with isEditorViewAlive (checks
 * docView !== null, which ProseMirror sets to null on destroy) and wraps
 * the cleanup dispatch in try/catch as belt-and-suspenders.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import type { EditorView } from "@milkdown/prose/view";

vi.mock("@/lib/editor-page/center-editor-position", () => ({
  centerEditorPosition: vi.fn(),
}));

import SearchResults from "../SearchResults";

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
  vi.restoreAllMocks();
});

function makeDestroyedView(): EditorView {
  // Simulate a ProseMirror EditorView that has been destroyed: docView is
  // null, and any dispatch attempt throws like Milkdown does when the
  // editorState context is gone.
  const throwOnDispatch = () => {
    throw new Error('Context "editorState" not found, do you forget to inject it?');
  };
  return {
    docView: null,
    state: {
      tr: { setMeta: () => ({}) },
      doc: { textContent: "", textBetween: () => "", content: { size: 0 } },
    },
    dispatch: throwOnDispatch,
    focus: () => {},
  } as unknown as EditorView;
}

describe("SearchResults – destroyed editor view (#1507)", () => {
  it("does not throw when mounted with a destroyed editorView and empty search", () => {
    const destroyed = makeDestroyedView();
    expect(() => {
      act(() => {
        root.render(
          <SearchResults editorView={destroyed} onClose={() => {}} searchTerm="" matches={[]} />,
        );
      });
    }).not.toThrow();
  });

  it("does not throw when searchTerm changes to empty while view is destroyed", () => {
    const destroyed = makeDestroyedView();
    act(() => {
      root.render(
        <SearchResults
          editorView={destroyed}
          onClose={() => {}}
          searchTerm="foo"
          matches={[{ from: 1, to: 4 }]}
        />,
      );
    });
    // Re-render with empty searchTerm — triggers the cleanup dispatch branch
    // that previously crashed (SearchResults.tsx line 68 in the original bug).
    expect(() => {
      act(() => {
        root.render(
          <SearchResults editorView={destroyed} onClose={() => {}} searchTerm="" matches={[]} />,
        );
      });
    }).not.toThrow();
  });

  it("does not throw when editorView prop changes from alive to destroyed", () => {
    const destroyed = makeDestroyedView();
    act(() => {
      root.render(
        <SearchResults editorView={null} onClose={() => {}} searchTerm="foo" matches={[]} />,
      );
    });
    expect(() => {
      act(() => {
        root.render(
          <SearchResults editorView={destroyed} onClose={() => {}} searchTerm="foo" matches={[]} />,
        );
      });
    }).not.toThrow();
  });
});
