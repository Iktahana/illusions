import { Plugin, PluginKey } from "@milkdown/prose/state";
import { DecorationSet } from "@milkdown/prose/view";

export const speechHighlightPluginKey = new PluginKey("speechHighlight");

export const speechHighlightPlugin = new Plugin({
  key: speechHighlightPluginKey,
  state: {
    init() {
      return { decorations: DecorationSet.empty };
    },
    apply(tr, value) {
      const d = tr.getMeta("speechDecorations");
      if (d !== undefined) {
        return {
          decorations:
            d.length === 0
              ? DecorationSet.empty
              : DecorationSet.create(tr.doc, d),
        };
      }
      return { decorations: value.decorations.map(tr.mapping, tr.doc) };
    },
  },
  props: {
    decorations(state) {
      return this.getState(state)?.decorations;
    },
  },
});
