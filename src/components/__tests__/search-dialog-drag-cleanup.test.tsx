/**
 * Regression tests for SearchDialog drag/portal lifecycle.
 *
 * Issue #1472: ensure
 *  - the dialog is portal-rendered to document.body (escape dockview's containing block)
 *  - listener and drag state do not leak after the dialog is closed
 *  - reopening recomputes anchor position from the current layout
 *
 * Uses jsdom + react-dom/client (no @testing-library/react in this project).
 * NOTE: React root is mounted on document.body so that synthetic event
 * delegation covers the portal target (which is also document.body).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import SearchDialog from "../SearchDialog";

// SearchDialog は controlled 化され、マッチ検出・ハイライトは親（useSearchHighlight）へ
// 移譲済み。ここでは drag/portal ライフサイクルのみを検証するため、検索 props は静的に渡す。

let root: Root;
let anchorEl: HTMLDivElement;

beforeEach(() => {
  // jsdom はレイアウト計算をしないため getBoundingClientRect を stub する anchor を用意
  anchorEl = document.createElement("div");
  anchorEl.setAttribute("data-test-anchor", "");
  anchorEl.getBoundingClientRect = () =>
    ({
      top: 64,
      right: 1000,
      left: 0,
      bottom: 600,
      width: 1000,
      height: 536,
      x: 0,
      y: 64,
      toJSON: () => ({}),
    }) as DOMRect;
  document.body.appendChild(anchorEl);

  // React root を document.body にマウントすることで portal 先と root container を一致させる。
  // これにより React 18/19 の event delegation が portal 内 native event を補足できる。
  root = createRoot(document.body);
  Object.defineProperty(window, "innerWidth", { value: 1440, configurable: true });
});

afterEach(() => {
  act(() => root.unmount());
  // body をクリーンに戻す（anchorEl 含めて削除）
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

function render(isOpen: boolean) {
  const anchorRef = { current: anchorEl };
  act(() => {
    root.render(
      <SearchDialog
        isOpen={isOpen}
        onClose={() => {}}
        searchTerm=""
        onSearchTermChange={() => {}}
        caseSensitive={false}
        onCaseSensitiveChange={() => {}}
        matches={[]}
        currentMatchIndex={0}
        onCurrentMatchIndexChange={() => {}}
        anchorRef={anchorRef}
      />,
    );
  });
}

function queryDialog(): HTMLDivElement | null {
  // createPortal(<div className="fixed ...">, document.body) は div を body 直下に置く
  return document.body.querySelector(":scope > div.fixed") as HTMLDivElement | null;
}

describe("SearchDialog – portal rendering", () => {
  it("renders the dialog as a direct child of document.body", () => {
    render(true);
    const dialog = queryDialog();
    expect(dialog).not.toBeNull();
    expect(dialog!.parentElement).toBe(document.body);
  });

  it("removes the portal node when isOpen toggles to false", () => {
    render(true);
    expect(queryDialog()).not.toBeNull();
    render(false);
    expect(queryDialog()).toBeNull();
  });

  it("applies z-[9999] class to escape dockview overlays", () => {
    render(true);
    const dialog = queryDialog();
    expect(dialog).not.toBeNull();
    expect(dialog!.className).toContain("z-[9999]");
  });
});

describe("SearchDialog – anchor position recomputation", () => {
  it("uses anchorPos for top after open (computed from anchor rect)", () => {
    render(true);
    const dialog = queryDialog();
    // anchor.top = 64, padding = 16 → top = 64 + 8 = 72
    expect(dialog!.style.top).toBe("72px");
  });

  it("recomputes initial position on reopen (no stale dragOffset)", () => {
    render(true);
    const dialogA = queryDialog();
    expect(dialogA).not.toBeNull();
    // close then reopen
    render(false);
    render(true);
    const dialogB = queryDialog();
    expect(dialogB).not.toBeNull();
    // left は dragOffset 由来なので reopen 後は空 (right で位置決め)
    expect(dialogB!.style.left).toBe("");
    // top は anchorPos.top (= 72px) 由来で再計算される
    expect(dialogB!.style.top).toBe("72px");
  });
});

describe("SearchDialog – drag listener cleanup", () => {
  it("registers mousemove/mouseup on mousedown and removes on mouseup", () => {
    const addSpy = vi.spyOn(document, "addEventListener");
    const removeSpy = vi.spyOn(document, "removeEventListener");
    render(true);
    const dialog = queryDialog();
    expect(dialog).not.toBeNull();

    // mousedown on the dialog frame (not on interactive elements).
    // React root は document.body にあるため、native mousedown は React の synthetic
    // event handler (onMouseDown) を発火する。
    act(() => {
      dialog!.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, clientX: 100, clientY: 100 }),
      );
    });
    const mousemoveAdds = addSpy.mock.calls.filter(([t]) => t === "mousemove").length;
    const mouseupAdds = addSpy.mock.calls.filter(([t]) => t === "mouseup").length;
    expect(mousemoveAdds).toBeGreaterThanOrEqual(1);
    expect(mouseupAdds).toBeGreaterThanOrEqual(1);

    act(() => {
      document.dispatchEvent(new MouseEvent("mouseup"));
    });
    const mousemoveRemoves = removeSpy.mock.calls.filter(([t]) => t === "mousemove").length;
    const mouseupRemoves = removeSpy.mock.calls.filter(([t]) => t === "mouseup").length;
    expect(mousemoveRemoves).toBeGreaterThanOrEqual(1);
    expect(mouseupRemoves).toBeGreaterThanOrEqual(1);
  });

  it("cleans up listeners on next mousemove if dialog closes mid-drag", () => {
    const removeSpy = vi.spyOn(document, "removeEventListener");
    render(true);
    const dialog = queryDialog();
    expect(dialog).not.toBeNull();

    // start drag
    act(() => {
      dialog!.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, clientX: 50, clientY: 50 }),
      );
    });

    // close without mouseup → useEffect sets isDragging.current = false
    render(false);

    // 次の mousemove で listener 自己撤去ロジックが発火する
    act(() => {
      document.dispatchEvent(new MouseEvent("mousemove", { clientX: 500, clientY: 500 }));
    });

    const mousemoveRemoves = removeSpy.mock.calls.filter(([t]) => t === "mousemove").length;
    expect(mousemoveRemoves).toBeGreaterThanOrEqual(1);
  });
});
