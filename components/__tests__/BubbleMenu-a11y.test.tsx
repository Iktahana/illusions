/**
 * Regression test for BubbleMenu accessibility bug (#1855).
 *
 * When there is no text selection the BubbleMenu must NOT appear in the DOM —
 * it was previously rendered offscreen with opacity-0/pointer-events-none, which
 * left all format buttons in the Tab order and accessibility tree.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import React, { createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import BubbleMenu from "../BubbleMenu";
import type { EditorSelectionState } from "@/lib/editor-page/use-selection-tracking";

let root: Root;

const noSelection: EditorSelectionState = {
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

const withSelection: EditorSelectionState = {
  hasSelection: true,
  selectionCount: 5,
  isCollapsed: false,
  from: 10,
  to: 15,
  startCoords: { top: 100, left: 100, right: 200, bottom: 120 },
  endCoords: { top: 100, left: 200, right: 300, bottom: 120 },
  rangeRect: { top: 100, left: 100, right: 300, bottom: 120 },
  pointerClientY: 110,
};

beforeEach(() => {
  root = createRoot(document.body);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
});

function renderBubble(selectionState: EditorSelectionState) {
  const scrollRef = createRef<HTMLDivElement | null>() as React.RefObject<HTMLDivElement | null>;
  act(() => {
    root.render(
      <BubbleMenu
        selectionState={selectionState}
        scrollContainerRef={scrollRef}
        onFormat={() => {}}
      />,
    );
  });
}

describe("BubbleMenu アクセシビリティ (#1855)", () => {
  it("テキスト未選択時、フォーマットボタンが DOM に存在しない", () => {
    renderBubble(noSelection);

    // No buttons must be in the DOM when there is no selection
    const buttons = document.body.querySelectorAll("button");
    expect(buttons.length).toBe(0);
  });

  it("テキスト未選択時、太字ボタンが見つからない", () => {
    renderBubble(noSelection);

    const boldBtn = Array.from(document.body.querySelectorAll("button")).find(
      (el) => el.getAttribute("title") === "太字",
    );
    expect(boldBtn).toBeUndefined();
  });

  it("テキスト選択時、フォーマットボタンが DOM に存在する", () => {
    renderBubble(withSelection);

    const buttons = document.body.querySelectorAll("button");
    expect(buttons.length).toBeGreaterThan(0);
  });

  it("テキスト選択時、太字ボタンが見つかる", () => {
    renderBubble(withSelection);

    const boldBtn = Array.from(document.body.querySelectorAll("button")).find(
      (el) => el.getAttribute("title") === "太字",
    );
    expect(boldBtn).toBeDefined();
  });

  it("選択解除後、ボタンが DOM から除去される", async () => {
    const scrollRef = createRef<HTMLDivElement | null>() as React.RefObject<HTMLDivElement | null>;

    // First render with selection
    await act(async () => {
      root.render(
        <BubbleMenu
          selectionState={withSelection}
          scrollContainerRef={scrollRef}
          onFormat={() => {}}
        />,
      );
    });

    let buttons = document.body.querySelectorAll("button");
    expect(buttons.length).toBeGreaterThan(0);

    // Then render without selection
    await act(async () => {
      root.render(
        <BubbleMenu
          selectionState={noSelection}
          scrollContainerRef={scrollRef}
          onFormat={() => {}}
        />,
      );
    });

    buttons = document.body.querySelectorAll("button");
    expect(buttons.length).toBe(0);
  });
});
