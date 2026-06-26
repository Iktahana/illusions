import { useEffect, useRef } from "react";
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
  /**
   * #1857: 次へ/前へ/結果クリックなど明示的なユーザーナビゲーションのたびに
   * インクリメントされるカウンター。このカウンターが変化した時のみ
   * TextSelection とスクロールを実行する。コンテンツ編集で matches が
   * 再計算されても navigationNonce は変わらないため、カーソル誤移動が起きない。
   */
  navigationNonce: number;
}

/**
 * 検索ハイライト適用の唯一の場所。SearchDialog と SearchResults が各自で
 * `searchDecorations` を dispatch していた double-writer 衝突を解消するため、
 * 両 UI から dispatch ロジックを引き上げてここへ集約する。
 *
 * 責務:
 *  1. `isEditorViewAlive` で破棄済み view をガード（#1507）
 *  2. 検索 UI が非表示 or 検索語が空 → decorations を空 dispatch してクリア
 *  3. それ以外 → 全マッチをハイライト（current は強調クラス）
 *  4. #1857: TextSelection とスクロールは navigationNonce が変化した時のみ実行
 *     （コンテンツ編集で matches が再計算されてもカーソル位置を上書きしない）
 */
export function useSearchHighlight({
  editorView,
  matches,
  currentMatchIndex,
  searchTerm,
  isSearchVisible,
  navigationNonce,
}: UseSearchHighlightParams): void {
  // navigationNonce が最後に処理されたときの値を追跡する。
  // 初期値を -1 にして最初の明示的ナビゲーションを確実に捕捉する。
  const lastNavigationNonceRef = useRef(-1);

  // Effect 1: デコレーション更新。matches/searchTerm/可視状態が変わるたびに実行。
  // TextSelection とスクロールは実行しない（#1857）。
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
  }, [editorView, matches, currentMatchIndex, searchTerm, isSearchVisible]);

  // Effect 2: 明示的ナビゲーション時のみ選択移動＋スクロール（#1857）。
  // navigationNonce が変化した時だけ実行される。コンテンツ編集で matches が
  // 再計算されても nonce は変わらないため、カーソルが誤位置へ飛ばない。
  // matches と currentMatchIndex は deps に含めるが、lastNavigationNonceRef
  // ガードにより nonce が変化した時のみ実際に処理される。
  useEffect(() => {
    if (navigationNonce === lastNavigationNonceRef.current) return;
    lastNavigationNonceRef.current = navigationNonce;

    if (!isEditorViewAlive(editorView)) return;

    const current = matches[currentMatchIndex];
    if (!current) return;

    try {
      editorView.dispatch(
        editorView.state.tr.setSelection(
          TextSelection.create(editorView.state.doc, current.from, current.from),
        ),
      );
      centerEditorPosition(editorView, current.from);
    } catch {
      // 破棄済み view ではスクロール不要
    }
  }, [navigationNonce, editorView, matches, currentMatchIndex]);
}
