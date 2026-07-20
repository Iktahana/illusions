import type { Transaction } from "@milkdown/prose/state";
import type { EditorView } from "@milkdown/prose/view";

/**
 * ProseMirror sets `docView` to null during EditorView.destroy(). React can
 * still hold that view briefly while tab/editor teardown finishes.
 */
export function isEditorViewAlive(view: EditorView | null): view is EditorView {
  return view !== null && (view as unknown as { docView?: unknown }).docView !== null;
}

export function isEditorViewTeardownError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('Context "editorState" not found') ||
    message.includes("Context editorState not found") ||
    message.includes("reading 'nextSibling'")
  );
}

export function dispatchIfEditorViewAlive(
  view: EditorView | null,
  createTransaction: (view: EditorView) => Transaction,
): boolean {
  if (!isEditorViewAlive(view)) return false;

  try {
    const transaction = createTransaction(view);
    if (!isEditorViewAlive(view)) return false;
    view.dispatch(transaction);
    return true;
  } catch (error) {
    if (isEditorViewTeardownError(error)) return false;
    throw error;
  }
}
