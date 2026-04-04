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
      // 検索ハイライト用 meta を確認する
      const searchDecorations = tr.getMeta("searchDecorations");

      if (searchDecorations !== undefined) {
        // デコレーションを更新する
        if (searchDecorations.length === 0) {
          return { decorations: DecorationSet.empty };
        }
        return { decorations: DecorationSet.create(tr.doc, searchDecorations) };
      }

      // 既存のデコレーションを新しいドキュメントにマッピングする
      return { decorations: value.decorations.map(tr.mapping, tr.doc) };
    },
  },
  props: {
    decorations(state) {
      return this.getState(state)?.decorations;
    },
  },
});
