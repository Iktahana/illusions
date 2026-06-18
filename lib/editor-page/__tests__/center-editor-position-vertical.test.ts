import { describe, expect, it, vi } from "vitest";
import type { EditorView } from "@milkdown/prose/view";

import { centerEditorPosition } from "@/lib/editor-page/center-editor-position";

describe("centerEditorPosition in vertical writing", () => {
  it("centers the current match on the horizontal scroll axis", () => {
    const scrollTo = vi.fn();
    const container = document.createElement("div");
    container.style.overflowX = "auto";
    Object.assign(container, { scrollLeft: 200, scrollTop: 30, scrollTo });
    container.getBoundingClientRect = () =>
      ({ left: 10, right: 510, top: 20, bottom: 420, width: 500, height: 400 }) as DOMRect;
    container.className = "editor-scroll-container";
    const editorDom = document.createElement("div");
    container.appendChild(editorDom);
    document.body.appendChild(container);

    const view = {
      dom: editorDom,
      coordsAtPos: () => ({ left: 1000, right: 1020, top: 100, bottom: 120 }),
    } as unknown as EditorView;

    expect(centerEditorPosition(view, 5, "auto")).toBe(true);
    expect(scrollTo).toHaveBeenCalledWith({ left: 950, top: -80, behavior: "auto" });

    container.remove();
  });
});
