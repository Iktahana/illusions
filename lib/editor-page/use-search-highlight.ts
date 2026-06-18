import { useEffect } from "react";
import { Decoration, type EditorView } from "@milkdown/prose/view";
import { TextSelection } from "@milkdown/prose/state";
import { centerEditorPosition } from "@/lib/editor-page/center-editor-position";
import type { SearchMatch } from "@/lib/editor-page/find-search-matches";

/**
 * #1507: After a tab switch the parent's editorView reference may briefly point
 * at a destroyed EditorView (ProseMirror sets `docView` to null on destroy).
 * Dispatching on it routes through torn-down Milkdown plugins and throws
 * "Context editorState not found". This guard is the single chokepoint for that
 * check now that highlight dispatch is centralized here.
 */
export function isEditorViewAlive(view: EditorView | null): view is EditorView {
  return view !== null && (view as unknown as { docView: unknown }).docView !== null;
}

interface UseSearchHighlightParams {
  editorView: EditorView | null;
  matches: SearchMatch[];
  /** 強調表示する現在のマッチ index。範囲外なら現在強調なし。 */
  currentMatchIndex: number;
  searchTerm: string;
  /** いずれかの検索 UI（フローティング窓 or サイドパネル）が表示中か。
   *  false になったら（＝両方とも非表示）ハイライトを消す。 */
  isSearchVisible: boolean;
}

/**
 * 検索ハイライト適用の唯一の場所。SearchDialog と SearchResults が各自で
 * `searchDecorations` を dispatch していた double-writer 衝突を解消するため、
 * 両 UI から dispatch ロジックを引き上げてここへ集約する。
 *
 * 責務:
 *  1. `isEditorViewAlive` で破棄済み view をガード（#1507）
 *  2. 検索 UI が非表示 or 検索語が空 → decorations を空 dispatch してクリア
 *  3. それ以外 → 全マッチをハイライト（current は強調クラス）＋現在マッチへスクロール
 */
export function useSearchHighlight({
  editorView,
  matches,
  currentMatchIndex,
  searchTerm,
  isSearchVisible,
}: UseSearchHighlightParams): void {
  useEffect(() => {
    if (!isEditorViewAlive(editorView)) return;
    const { state, dispatch } = editorView;

    // 非表示時・検索語空時はハイライトを消す（要求2: 検索窓を閉じた／
    // 検索パネル非表示でハイライト除去）。
    if (!isSearchVisible || !searchTerm || matches.length === 0) {
      try {
        dispatch(state.tr.setMeta("searchDecorations", []));
      } catch {
        // view が dispatch 途中で破棄された場合のベストエフォート
      }
      return;
    }

    const decorations = matches.map((match, index) =>
      Decoration.inline(match.from, match.to, {
        class: index === currentMatchIndex ? "search-result-current" : "search-result",
      }),
    );

    try {
      dispatch(state.tr.setMeta("searchDecorations", decorations));
    } catch {
      // #1507: view が検索中に破棄された — decorations も一緒に消える
    }

    // 現在のマッチを画面中央へ。選択も移動して連続ナビを自然にする。
    const current = matches[currentMatchIndex];
    if (current) {
      try {
        const view = editorView;
        view.dispatch(
          view.state.tr.setSelection(
            TextSelection.create(view.state.doc, current.from, current.from),
          ),
        );
        centerEditorPosition(view, current.from);
      } catch {
        // 破棄済み view ではスクロール不要
      }
    }
  }, [editorView, matches, currentMatchIndex, searchTerm, isSearchVisible]);
}
