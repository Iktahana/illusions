import { Plugin, PluginKey } from "@milkdown/prose/state";
import { Decoration, DecorationSet } from "@milkdown/prose/view";

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
      // 檢查是否有搜索裝飾的 meta
      const searchDecorations = tr.getMeta("searchDecorations");
      
      if (searchDecorations !== undefined) {
        // 更新裝飾
        if (searchDecorations.length === 0) {
          return { decorations: DecorationSet.empty };
        }
        return { decorations: DecorationSet.create(tr.doc, searchDecorations) };
      }
      
      // 映射現有裝飾到新文檔
      return { decorations: value.decorations.map(tr.mapping, tr.doc) };
    },
  },
  props: {
    decorations(state) {
      return this.getState(state)?.decorations;
    },
  },
});
