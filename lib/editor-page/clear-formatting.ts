import { setBlockType, lift } from "@milkdown/prose/commands";
import { liftListItem } from "@milkdown/prose/schema-list";
import type { EditorView } from "@milkdown/prose/view";

/** lift 系コマンドを変化が無くなるまで反復実行する（多重ネスト対策）。上限付き。 */
function repeat(
  view: EditorView,
  command: (state: EditorView["state"], dispatch: EditorView["dispatch"]) => boolean,
): void {
  for (let i = 0; i < 16; i += 1) {
    if (!command(view.state, view.dispatch)) break;
  }
}

/**
 * 選択範囲を標準本文（段落・装飾なし）に戻す。
 *
 * Milkdown には単一の「書式解除」コマンドが無いため、ProseMirror を直接操作する。
 * 1) インラインマーク（太字・斜体・取り消し線・コード等）をすべて除去
 * 2) 見出し・コードブロック等のテキストブロックを標準段落へ変換
 * 3) リスト項目を段落へ引き上げ（list_item は generic lift では解除できないため専用コマンド）
 * 4) 引用などの残りのラッパーから段落を引き上げる
 *
 * 選択が空の場合は何もしない。
 */
export function clearFormatting(view: EditorView): void {
  if (view.state.selection.empty) return;

  // 1) インラインマークをすべて除去
  const { from, to } = view.state.selection;
  view.dispatch(view.state.tr.removeMark(from, to));

  // 2) テキストブロックを標準段落へ変換
  const paragraph = view.state.schema.nodes.paragraph;
  if (paragraph) {
    setBlockType(paragraph)(view.state, view.dispatch);
  }

  // 3) リスト項目を引き上げてリストから抜ける
  const listItem = view.state.schema.nodes.list_item;
  if (listItem) {
    repeat(view, liftListItem(listItem));
  }

  // 4) 引用などの残りのラッパーを解除
  repeat(view, lift);

  view.focus();
}
