/**
 * Regression test for SearchDialog anchor wiring (#1504).
 *
 * Verifies that when an anchorRef is provided, the dialog is positioned
 * relative to the anchor element's bounding rect (i.e. the focused
 * editor pane's search button), not the viewport fallback (top: 64, right: 16).
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import React, { useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import SearchDialog from "../SearchDialog";

let root: Root;
let anchorEl: HTMLButtonElement;

const ANCHOR_RECT = {
  top: 50,
  right: 800, // anchor button's right edge inside a focused dockview pane
  left: 780,
  bottom: 80,
  width: 20,
  height: 30,
  x: 780,
  y: 50,
  toJSON: () => ({}),
};

beforeEach(() => {
  anchorEl = document.createElement("button");
  anchorEl.setAttribute("data-test-anchor", "");
  anchorEl.getBoundingClientRect = () => ANCHOR_RECT as DOMRect;
  document.body.appendChild(anchorEl);

  root = createRoot(document.body);
  Object.defineProperty(window, "innerWidth", { value: 1440, configurable: true });
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
});

function Wrapper({ withAnchor, isOpen }: { withAnchor: boolean; isOpen: boolean }) {
  const ref = useRef<HTMLButtonElement | null>(anchorEl);
  return (
    <SearchDialog
      editorView={null}
      isOpen={isOpen}
      onClose={() => {}}
      anchorRef={withAnchor ? ref : undefined}
    />
  );
}

describe("SearchDialog – anchor wiring (#1504)", () => {
  it("positions dialog relative to the anchor element when anchorRef is provided", async () => {
    await act(async () => {
      root.render(<Wrapper withAnchor={true} isOpen={true} />);
    });

    // The portal target is document.body. Find the dialog by its searchInput.
    // SearchDialog renders an input with placeholder containing "検索".
    const dialog = Array.from(document.querySelectorAll("div")).find((el) =>
      el.querySelector('input[placeholder*="検索"]'),
    ) as HTMLDivElement | undefined;
    // Walk up to the positioned outer dialog container (has inline `top`/`right`).
    expect(dialog).toBeDefined();

    // The outermost dialog wrapper has inline style with top + right.
    // SearchDialog uses Tailwind `fixed` class, not inline position style.
    // The inline `style` contains top + right values from posStyle.
    const positioned = Array.from(document.body.querySelectorAll("div")).find(
      (el) => el.className.includes("fixed") && el.style.top !== "" && el.style.right !== "",
    );
    expect(positioned).toBeDefined();

    // top should match anchor.top; right should be derived from
    // window.innerWidth - anchor.right + padding (clamped). For our values:
    //   window.innerWidth=1440, anchor.right=800 → right ≈ 1440 - 800 = 640
    // The exact value comes from computeAnchorPos's clamp logic; we only
    // assert it is NOT the viewport fallback {top:64, right:16}.
    expect(positioned!.style.top).not.toBe("64px");
    expect(positioned!.style.right).not.toBe("16px");
    // Numerical sanity: top should be near anchor top (50)
    expect(parseInt(positioned!.style.top, 10)).toBeGreaterThanOrEqual(0);
    expect(parseInt(positioned!.style.top, 10)).toBeLessThanOrEqual(60);
  });

  it("falls back to viewport corner when anchorRef is omitted", async () => {
    await act(async () => {
      root.render(<Wrapper withAnchor={false} isOpen={true} />);
    });

    // SearchDialog uses Tailwind `fixed` class, not inline position style.
    // The inline `style` contains top + right values from posStyle.
    const positioned = Array.from(document.body.querySelectorAll("div")).find(
      (el) => el.className.includes("fixed") && el.style.top !== "" && el.style.right !== "",
    );
    expect(positioned).toBeDefined();
    // Fallback: SearchDialog.tsx uses { top: 64, right: 16 } when no anchor.
    expect(positioned!.style.top).toBe("64px");
    expect(positioned!.style.right).toBe("16px");
  });
});
