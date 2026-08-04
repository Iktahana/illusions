import { TextSelection, type EditorState } from "@milkdown/prose/state";
import type { EditorView } from "@milkdown/prose/view";

import { dispatchIfEditorViewAlive } from "@/shared/lib/editor-view-safety";

/**
 * Return the text selected in the editor, if there is any usable text.
 *
 * `undefined` deliberately differs from an empty string: callers must retain
 * the existing query when a node/empty selection has no text to search for.
 */
export function selectedEditorTextForSearch(state: EditorState): string | undefined {
  const { selection, doc } = state;
  if (selection.empty) return undefined;

  const text = doc.textBetween(selection.from, selection.to, "\n");
  return text || undefined;
}

/**
 * Snapshot the selected text and collapse the native editor selection before a
 * search UI takes focus.
 *
 * The text is read first, so Cmd+F and the context-menu search action retain
 * the original range while the focused control receives a collapsed caret.
 */
export function takeEditorSelectionForSearch(view: EditorView | null): string | undefined {
  if (!view) return undefined;

  const text = selectedEditorTextForSearch(view.state);
  const { selection } = view.state;

  // Cmd+F only needs to transfer text selections. Leave node selections alone:
  // forcing a TextSelection at an arbitrary node boundary is not always valid.
  if (!selection.empty && selection instanceof TextSelection) {
    const caret = selection.to;
    dispatchIfEditorViewAlive(view, (aliveView) =>
      aliveView.state.tr.setSelection(TextSelection.create(aliveView.state.doc, caret)),
    );
  }

  return text;
}
