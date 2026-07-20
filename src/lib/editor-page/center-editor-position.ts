import type { EditorView } from "@milkdown/prose/view";
import { findScrollContainer } from "@/packages/milkdown-plugin-japanese-novel/shared/paragraph-helpers";

export function centerEditorPosition(
  editorView: EditorView,
  pos: number,
  behavior: ScrollBehavior = "smooth",
): boolean {
  try {
    const coords = editorView.coordsAtPos(pos);
    const scrollContainer = findScrollContainer(editorView.dom as HTMLElement);
    const containerRect = scrollContainer.getBoundingClientRect();
    const targetCenterX = (coords.left + coords.right) / 2 - containerRect.left;
    const targetCenterY = (coords.top + coords.bottom) / 2 - containerRect.top;

    scrollContainer.scrollTo({
      left: scrollContainer.scrollLeft + targetCenterX - containerRect.width / 2,
      top: scrollContainer.scrollTop + targetCenterY - containerRect.height / 2,
      behavior,
    });

    return true;
  } catch {
    try {
      const domResult = editorView.domAtPos(pos);
      const target =
        domResult.node instanceof HTMLElement ? domResult.node : domResult.node.parentElement;
      target?.scrollIntoView({ behavior, block: "center", inline: "center" });
      return !!target;
    } catch {
      return false;
    }
  }
}
