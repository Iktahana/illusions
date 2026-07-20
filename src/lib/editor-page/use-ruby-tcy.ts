import { useCallback, useRef } from "react";
import type { MutableRefObject } from "react";
import { Fragment } from "@milkdown/prose/model";
import type { EditorView } from "@milkdown/prose/view";
import { dispatchIfEditorViewAlive } from "@/shared/lib/editor-view-safety";

interface UseRubyTcyOptions {
  editorViewRef: MutableRefObject<EditorView | null>;
  setRubySelectedText: (text: string) => void;
  setShowRubyDialog: (show: boolean) => void;
}

export function useRubyTcy({
  editorViewRef,
  setRubySelectedText,
  setShowRubyDialog,
}: UseRubyTcyOptions) {
  const rubySelectionRef = useRef<{ from: number; to: number } | null>(null);

  /** Open the Ruby dialog with current editor selection */
  const handleOpenRubyDialog = useCallback(() => {
    const view = editorViewRef.current;
    if (!view) return;
    try {
      const { from, to } = view.state.selection;
      if (from === to) return; // No selection
      const text = view.state.doc.textBetween(from, to);
      if (!text.trim()) return;
      rubySelectionRef.current = { from, to };
      setRubySelectedText(text);
      setShowRubyDialog(true);
    } catch {
      // Defensive: view may be torn down during unmount/remount
      return;
    }
    // editorViewRef is a stable ref object; including it here satisfies the React Compiler
    // without causing extra re-renders (ref identity never changes)
  }, [editorViewRef, setRubySelectedText, setShowRubyDialog]);

  /** Apply Ruby markup by replacing the editor selection with ProseMirror nodes */
  const handleApplyRuby = useCallback(
    (rubyMarkup: string) => {
      const view = editorViewRef.current;
      if (!view) return;
      const sel = rubySelectionRef.current;
      if (!sel) return;
      const { state } = view;
      const rubyNodeType = state.schema.nodes.ruby;
      if (!rubyNodeType) {
        // Fallback: insert as plain text if ruby node type is not available
        dispatchIfEditorViewAlive(view, (aliveView) =>
          aliveView.state.tr.insertText(rubyMarkup, sel.from, sel.to),
        );
        rubySelectionRef.current = null;
        return;
      }
      // Parse ruby markup: mixed text and {base|reading} segments
      const RUBY_RE = /\{([^|]+)\|([^}]+)\}/g;
      const nodes: import("@milkdown/prose/model").Node[] = [];
      let lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = RUBY_RE.exec(rubyMarkup)) !== null) {
        if (m.index > lastIndex) {
          nodes.push(state.schema.text(rubyMarkup.slice(lastIndex, m.index)));
        }
        nodes.push(rubyNodeType.create({ base: m[1], text: m[2] }));
        lastIndex = m.index + m[0].length;
      }
      if (lastIndex < rubyMarkup.length) {
        nodes.push(state.schema.text(rubyMarkup.slice(lastIndex)));
      }
      const fragment = Fragment.from(nodes);
      dispatchIfEditorViewAlive(view, (aliveView) =>
        aliveView.state.tr.replaceWith(sel.from, sel.to, fragment),
      );
      rubySelectionRef.current = null;
    },
    // editorViewRef is a stable ref object; including it here satisfies the React Compiler
    [editorViewRef],
  );

  /** Wrap selected text with tcy syntax: ^text^ */
  const handleToggleTcy = useCallback(() => {
    const view = editorViewRef.current;
    if (!view) return;
    const { state } = view;
    const { from, to } = state.selection;
    if (from === to) return;
    const text = state.doc.textBetween(from, to);
    if (!text.trim()) return;
    // Toggle: if already wrapped in ^...^, unwrap; otherwise wrap
    if (text.startsWith("^") && text.endsWith("^") && text.length >= 2) {
      const unwrapped = text.slice(1, -1);
      dispatchIfEditorViewAlive(view, (aliveView) =>
        aliveView.state.tr.insertText(unwrapped, from, to),
      );
    } else {
      dispatchIfEditorViewAlive(view, (aliveView) =>
        aliveView.state.tr.insertText(`^${text}^`, from, to),
      );
    }
    // editorViewRef is a stable ref object; including it here satisfies the React Compiler
  }, [editorViewRef]);

  return {
    handleOpenRubyDialog,
    handleApplyRuby,
    handleToggleTcy,
  };
}
