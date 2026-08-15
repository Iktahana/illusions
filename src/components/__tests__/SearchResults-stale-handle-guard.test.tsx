(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

import type { EditorInteractionHandle, EditorSearchToken } from "@/lib/editor-interaction";
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

function render(overrides: Partial<React.ComponentProps<typeof SearchResults>> = {}) {
  const staleHandle: EditorInteractionHandle = {
    getSnapshot: () =>
      ({
        editorId: "editor-a",
        generation: 2,
        ready: true,
        active: true,
        focused: true,
        composing: false,
        documentFormat: "markdown",
        capabilities: {
          markdown: true,
          gfm: true,
          mdi: false,
          ruby: false,
          tcy: false,
        },
        selection: {
          kind: "caret",
          from: 1,
          to: 1,
          text: "",
          anchor: null,
          head: null,
          rect: null,
          revision: 0,
          token: { editorId: "editor-a", generation: 2, selectionRevision: 0 },
        },
        availability: {
          "edit.undo": true,
          "edit.redo": true,
          "edit.cut": true,
          "edit.copy": true,
          "edit.paste": true,
          "edit.selectAll": true,
          "format.strong": true,
          "format.emphasis": true,
          "format.strikethrough": true,
          "format.heading": true,
          "format.blockquote": true,
          "format.bulletList": true,
          "format.orderedList": true,
          "format.inlineCode": true,
          "format.clear": true,
          "view.toggleWritingMode": true,
        },
      }) as ReturnType<EditorInteractionHandle["getSnapshot"]>,
    subscribe: () => () => {},
    execute: () => ({ status: "unavailable" }),
    createPosHighlightRequest: () => null,
    syncPosHighlightPresentation: () => {},
    prepareSearchSelection: () => undefined,
    querySearch: () => ({
      token: { editorId: "editor-a", generation: 2, contentRevision: 5 },
      matches: [],
    }),
    syncSearchPresentation: () => {},
    replaceSearch: vi.fn(() => ({ status: "stale" as const })),
  };

  const currentSearchToken: EditorSearchToken = {
    editorId: "editor-a",
    generation: 1,
    contentRevision: 4,
  };

  act(() => {
    root.render(
      <SearchResults
        searchTerm="東京"
        onSearchTermChange={() => {}}
        caseSensitive={false}
        onCaseSensitiveChange={() => {}}
        matches={[{ from: 1, to: 3, text: "東京", contextBefore: "前", contextAfter: "後" }]}
        currentMatchIndex={0}
        onCurrentMatchIndexChange={() => {}}
        onClose={() => {}}
        searchInteractionHandle={staleHandle}
        currentSearchToken={currentSearchToken}
        {...overrides}
      />,
    );
  });

  return staleHandle;
}

describe("SearchResults stale interaction guard", () => {
  it("does not throw when replacement runs against a stale search token", () => {
    const handle = render();
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    const replaceInput = Array.from(container.querySelectorAll("input")).find(
      (input) => (input as HTMLInputElement).placeholder === "置換後...",
    ) as HTMLInputElement | undefined;
    expect(replaceInput).toBeDefined();

    act(() => {
      nativeInputValueSetter?.call(replaceInput!, "大阪");
      replaceInput!.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const replaceButton = Array.from(container.querySelectorAll("button"))
      .filter((button) => button.textContent?.trim() === "置換")
      .at(-1);

    expect(() => act(() => replaceButton?.click())).not.toThrow();
    expect(handle.replaceSearch).toHaveBeenCalled();
  });
});
