import { liftTarget } from "@milkdown/prose/transform";
import type { EditorView } from "@milkdown/prose/view";
import { dispatchIfEditorViewAlive } from "@/shared/lib/editor-view-safety";

/**
 * 選択範囲を標準本文（段落・装飾なし）に戻す。
 *
 * 1) インラインマーク（太字・斜体等）をすべて除去
 * 2) 各ブロックを個別処理：見出し等のテキストブロックを段落へ変換し、
 *    引用・リスト等のラッパーから引き上げる
 *
 * 選択が空の場合は何もしない。
 *
 * 混在選択（見出し＋引用＋リスト＋段落）でも正しく動作するよう、
 * 選択全体に対して liftListItem/lift を一括適用する代わりに、
 * ノードを個別に走査して per-node の Transform 操作を行う。
 * 各操作は同一 transaction に集約し、dispatch は一度だけ。
 */
export function clearFormatting(view: EditorView): void {
  if (view.state.selection.empty) return;

  const { from, to } = view.state.selection;
  const { state } = view;
  const { schema } = state;
  const paragraph = schema.nodes.paragraph;
  const tr = state.tr;

  // 1) インラインマークをすべて除去（位置変化なし）
  tr.removeMark(from, to);

  // 2) ノードを個別に変換・引き上げ
  // オリジナル doc を走査し、tr.mapping / tr.doc で現在位置を追跡する。
  // TipTap の clearNodes と同様の per-node アプローチ。
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.isText) return;

    // テキストブロック（見出し・コードブロック等）を段落へ変換
    if (paragraph && node.isTextblock && node.type !== paragraph) {
      try {
        tr.setNodeMarkup(tr.mapping.map(pos), paragraph, {}, []);
      } catch {
        // 前の操作で位置が無効になった場合はスキップ
      }
    }

    // ラッパー（引用・リスト・リスト項目）から引き上げる
    try {
      const mappedPos = tr.mapping.map(pos);
      const mappedEnd = tr.mapping.map(pos + node.nodeSize);
      const $from = tr.doc.resolve(mappedPos);
      const $to = tr.doc.resolve(mappedEnd);
      const range = $from.blockRange($to);
      if (!range) return;

      const depth = liftTarget(range);
      if (depth != null) {
        tr.lift(range, depth);
      }
    } catch {
      // 前の lift で位置が変化した場合はスキップ
    }
  });

  dispatchIfEditorViewAlive(view, () => tr.scrollIntoView());
  view.focus();
}
