import { Plugin } from "@milkdown/prose/state";
import type { EditorView } from "@milkdown/prose/view";
import type { EditorInteractionStore } from "./store";

/**
 * ProseMirror-owned selection bridge. It observes editor transactions and the
 * geometry events that can move a selection without changing the document.
 */
export function createSelectionBridgePlugin(interaction: EditorInteractionStore): Plugin {
  return new Plugin({
    view: (view: EditorView) => {
      const refreshGeometry = (): void => interaction.refreshGeometry();
      const refreshSelection = (): void => interaction.update();
      view.dom.addEventListener("pointerup", refreshSelection);
      view.dom.addEventListener("scroll", refreshGeometry, true);
      window.addEventListener("resize", refreshGeometry);
      return {
        update: refreshSelection,
        destroy: () => {
          view.dom.removeEventListener("pointerup", refreshSelection);
          view.dom.removeEventListener("scroll", refreshGeometry, true);
          window.removeEventListener("resize", refreshGeometry);
          interaction.detach();
        },
      };
    },
    props: {
      handleDOMEvents: {
        focus: () => {
          interaction.update();
          return false;
        },
        blur: () => {
          interaction.update();
          return false;
        },
        compositionstart: () => {
          interaction.setComposing(true);
          return false;
        },
        compositionend: () => {
          interaction.setComposing(false);
          return false;
        },
      },
    },
  });
}
