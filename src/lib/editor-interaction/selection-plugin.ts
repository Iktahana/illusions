import { Plugin, type EditorState } from "@milkdown/prose/state";
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
      const publishTransaction = (currentView: EditorView, previousState: EditorState): void => {
        // Milkdown may ask plugin views to update while React is reconciling
        // even when ProseMirror state is unchanged. Publishing for those
        // no-op updates makes an external-store subscriber render the editor
        // again and creates a React/ProseMirror feedback loop.
        if (
          previousState.doc === currentView.state.doc &&
          previousState.selection.eq(currentView.state.selection)
        )
          return;
        const docChanged =
          typeof previousState.doc?.eq === "function"
            ? !previousState.doc.eq(currentView.state.doc)
            : previousState.doc !== currentView.state.doc;
        interaction.update({ docChanged });
      };
      view.dom.addEventListener("pointerup", refreshSelection);
      view.dom.addEventListener("scroll", refreshGeometry, true);
      window.addEventListener("resize", refreshGeometry);
      return {
        update: publishTransaction,
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
          // Focus ownership affects availability/visual state but does not make
          // the captured selection stale. Native menus temporarily blur the
          // renderer and must still be able to use the token they opened with.
          interaction.refreshGeometry();
          return false;
        },
        blur: () => {
          interaction.refreshGeometry();
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
