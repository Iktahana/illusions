import { Plugin, PluginKey } from "@milkdown/prose/state";
import { DecorationSet } from "@milkdown/prose/view";

export const searchHighlightPluginKey = new PluginKey("searchHighlight");

export interface SearchHighlightState {
  decorations: DecorationSet;
}

export const searchHighlightPlugin = new Plugin<SearchHighlightState>({
  key: searchHighlightPluginKey,
  state: {
    init() {
      return { decorations: DecorationSet.empty };
    },
    apply(tr, value) {
      // 検索装飾の meta があるか確認
      const searchDecorations = tr.getMeta("searchDecorations");
      
      if (searchDecorations !== undefined) {
        // 装飾を更新
        if (searchDecorations.length === 0) {
          return { decorations: DecorationSet.empty };
        }
        return { decorations: DecorationSet.create(tr.doc, searchDecorations) };
      }
      
      // 既存の装飾を新しいドキュメントにマッピング
      return { decorations: value.decorations.map(tr.mapping, tr.doc) };
    },
  },
  props: {
    decorations(state) {
      return this.getState(state)?.decorations;
    },
  },
});
