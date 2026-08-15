import { Plugin, PluginKey } from "@milkdown/prose/state";
import { DecorationSet, type Decoration } from "@milkdown/prose/view";

export const speechHighlightPluginKey = new PluginKey<DecorationSet>("speechHighlight");

export const SPEECH_DECORATIONS_META = "speechDecorations";

/**
 * Renderer decoration state for the current speech session.
 *
 * The controller may only publish decorations that belong to the attached
 * EditorView generation. Lifecycle invalidation is handled by the interaction
 * layer; this plugin only maps still-current decorations through transactions.
 */
export const speechHighlightPlugin = new Plugin<DecorationSet>({
  key: speechHighlightPluginKey,
  state: {
    init: () => DecorationSet.empty,
    apply(transaction, current) {
      const decorations = transaction.getMeta(SPEECH_DECORATIONS_META) as
        readonly Decoration[] | undefined;
      if (decorations !== undefined) {
        return decorations.length === 0
          ? DecorationSet.empty
          : DecorationSet.create(transaction.doc, [...decorations]);
      }
      return current.map(transaction.mapping, transaction.doc);
    },
  },
  props: {
    decorations(state) {
      return speechHighlightPluginKey.getState(state) ?? DecorationSet.empty;
    },
  },
});
