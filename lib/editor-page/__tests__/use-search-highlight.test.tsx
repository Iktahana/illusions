/**
 * Tests for useSearchHighlight — the single source of search-highlight dispatch.
 *
 * Covers the two behaviors introduced when SearchDialog / SearchResults were
 * made controlled and stopped writing `searchDecorations` themselves:
 *  1. Visibility gate: when no search UI is visible (or the term is empty /
 *     there are no matches), decorations are cleared (empty dispatch).
 *  2. Active highlight: when a search UI is visible with matches, the full set
 *     is dispatched, current match emphasized.
 *  3. #1507: a destroyed EditorView never throws.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import type { EditorView } from "@milkdown/prose/view";

// centerEditorPosition / TextSelection touch real ProseMirror layout — stub them.
vi.mock("@/lib/editor-page/center-editor-position", () => ({
  centerEditorPosition: vi.fn(),
}));
vi.mock("@milkdown/prose/state", () => ({
  TextSelection: { create: vi.fn(() => ({})) },
}));

import { useSearchHighlight } from "../use-search-highlight";
import type { SearchMatch } from "../find-search-matches";

interface DispatchedMeta {
  key: string;
  value: unknown;
}

function makeView(alive: boolean): { view: EditorView; metas: DispatchedMeta[] } {
  const metas: DispatchedMeta[] = [];
  const tr = {
    setMeta(key: string, value: unknown) {
      metas.push({ key, value });
      return tr;
    },
    setSelection() {
      return tr;
    },
  };
  const view = {
    docView: alive ? {} : null,
    state: { tr, doc: {} },
    dispatch: vi.fn(),
    focus: vi.fn(),
  } as unknown as EditorView;
  return { view, metas };
}

function decorationsDispatched(metas: DispatchedMeta[]): unknown[] | undefined {
  const entry = metas.filter((m) => m.key === "searchDecorations").pop();
  return entry?.value as unknown[] | undefined;
}

function Harness(props: {
  view: EditorView | null;
  matches: SearchMatch[];
  currentMatchIndex: number;
  searchTerm: string;
  isSearchVisible: boolean;
}) {
  useSearchHighlight({
    editorView: props.view,
    matches: props.matches,
    currentMatchIndex: props.currentMatchIndex,
    searchTerm: props.searchTerm,
    isSearchVisible: props.isSearchVisible,
  });
  return null;
}

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

describe("useSearchHighlight – visibility gate (要求2)", () => {
  it("clears decorations (empty dispatch) when no search UI is visible", () => {
    const { view, metas } = makeView(true);
    act(() => {
      root.render(
        <Harness
          view={view}
          matches={[{ from: 1, to: 2 }]}
          currentMatchIndex={0}
          searchTerm="foo"
          isSearchVisible={false}
        />,
      );
    });
    expect(decorationsDispatched(metas)).toEqual([]);
  });

  it("clears decorations when the term is empty even if visible", () => {
    const { view, metas } = makeView(true);
    act(() => {
      root.render(
        <Harness
          view={view}
          matches={[]}
          currentMatchIndex={0}
          searchTerm=""
          isSearchVisible={true}
        />,
      );
    });
    expect(decorationsDispatched(metas)).toEqual([]);
  });

  it("dispatches the full match set when visible with matches", () => {
    const { view, metas } = makeView(true);
    act(() => {
      root.render(
        <Harness
          view={view}
          matches={[
            { from: 1, to: 2 },
            { from: 5, to: 6 },
          ]}
          currentMatchIndex={1}
          searchTerm="foo"
          isSearchVisible={true}
        />,
      );
    });
    const dispatched = decorationsDispatched(metas);
    expect(dispatched).toHaveLength(2);
  });
});

describe("useSearchHighlight – destroyed view (#1507)", () => {
  it("does not throw when the editorView is destroyed", () => {
    const { view } = makeView(false /* docView = null */);
    expect(() => {
      act(() => {
        root.render(
          <Harness
            view={view}
            matches={[{ from: 1, to: 2 }]}
            currentMatchIndex={0}
            searchTerm="foo"
            isSearchVisible={true}
          />,
        );
      });
    }).not.toThrow();
  });
});
