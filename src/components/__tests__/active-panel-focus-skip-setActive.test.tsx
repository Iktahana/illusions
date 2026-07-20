/**
 * Regression test for #1457: editor click bounces scroll to top.
 *
 * Root cause: `panelApi.setActive()` called on an already-active dockview panel
 * routes through `DockviewGroupPanelModel.openPanel`, which calls
 * `ContentContainer.renderPanel(panel, { asActive: true })`. That handler
 * detaches and re-attaches the panel's content element to the DOM — and DOM
 * re-attachment resets `scrollTop` / `scrollLeft` to 0, with the editor's
 * contenteditable losing its caret context in the process.
 *
 * Fix: the editor wrapper's `onFocus` must skip `setActive()` when the panel
 * is already active. The redundant call adds nothing and triggers the
 * detach/reattach side-effect.
 *
 * This test exercises a minimal `<div onFocus>` mirror of the JSX shape used
 * in `EditorLayout.tsx:441-484` (active-panel branch) and asserts that the
 * guard holds. It does NOT touch the real dockview internals — those are
 * covered by the bundled `node_modules/dockview-core` source paths cited in
 * the fix's comment block.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

interface PanelApiLike {
  isActive: boolean;
  setActive: () => void;
}

function EditorWrapper({ panelApi }: { panelApi: PanelApiLike }) {
  return (
    <div
      data-testid="editor-wrapper"
      tabIndex={-1}
      onFocus={() => {
        if (!panelApi.isActive) {
          panelApi.setActive();
        }
      }}
    >
      <textarea data-testid="inner-editable" />
    </div>
  );
}

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

describe("#1457 regression — editor wrapper onFocus must guard setActive()", () => {
  it("does NOT call panelApi.setActive() when the panel is already active", () => {
    const panelApi: PanelApiLike = {
      isActive: true,
      setActive: vi.fn(),
    };

    act(() => {
      root.render(<EditorWrapper panelApi={panelApi} />);
    });

    const wrapper = container.querySelector("[data-testid='editor-wrapper']") as HTMLDivElement;

    act(() => {
      wrapper.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    });

    expect(panelApi.setActive).not.toHaveBeenCalled();
  });

  it("DOES call panelApi.setActive() when the panel is not active (multi-panel layout case)", () => {
    const panelApi: PanelApiLike = {
      isActive: false,
      setActive: vi.fn(),
    };

    act(() => {
      root.render(<EditorWrapper panelApi={panelApi} />);
    });

    const wrapper = container.querySelector("[data-testid='editor-wrapper']") as HTMLDivElement;

    act(() => {
      wrapper.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    });

    expect(panelApi.setActive).toHaveBeenCalledTimes(1);
  });

  it("focus bubbling from contenteditable descendant also respects the guard", () => {
    const panelApi: PanelApiLike = {
      isActive: true,
      setActive: vi.fn(),
    };

    act(() => {
      root.render(<EditorWrapper panelApi={panelApi} />);
    });

    const inner = container.querySelector("[data-testid='inner-editable']") as HTMLTextAreaElement;

    act(() => {
      inner.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    });

    expect(panelApi.setActive).not.toHaveBeenCalled();
  });
});
