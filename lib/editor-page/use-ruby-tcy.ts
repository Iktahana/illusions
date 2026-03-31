import { useCallback, useRef } from "react";
import { Fragment } from "@milkdown/prose/model";
import type { EditorView } from "@milkdown/prose/view";

interface UseRubyTcyOptions {
  editorViewInstance: EditorView | null;
  setRubySelectedText: (text: string) => void;
  setShowRubyDialog: (show: boolean) => void;
}

export function useRubyTcy({
  editorViewInstance,
  setRubySelectedText,
  setShowRubyDialog,
}: UseRubyTcyOptions) {
  const rubySelectionRef = useRef<{ from: number; to: number } | null>(null);

  /** Open the Ruby dialog with current editor selection */
  const handleOpenRubyDialog = useCallback(() => {
    if (!editorViewInstance) return;
    const { state } = editorViewInstance;
    const { from, to } = state.selection;
    if (from === to) return; // No selection
    const text = state.doc.textBetween(from, to);
    if (!text.trim()) return;
    rubySelectionRef.current = { from, to };
    setRubySelectedText(text);
    setShowRubyDialog(true);
  }, [editorViewInstance, setRubySelectedText, setShowRubyDialog]);

  /** Apply Ruby markup by replacing the editor selection with ProseMirror nodes */
  const handleApplyRuby = useCallback(
    (rubyMarkup: string) => {
      if (!editorViewInstance) return;
      const sel = rubySelectionRef.current;
      if (!sel) return;
      const { state, dispatch } = editorViewInstance;
      const rubyNodeType = state.schema.nodes.ruby;
      if (!rubyNodeType) {
        // Fallback: insert as plain text if ruby node type is not available
        const tr = state.tr.insertText(rubyMarkup, sel.from, sel.to);
        dispatch(tr);
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
      const tr = state.tr.replaceWith(sel.from, sel.to, fragment);
      dispatch(tr);
      rubySelectionRef.current = null;
    },
    [editorViewInstance],
  );

  /** Wrap selected text with tcy syntax: ^text^ */
  const handleToggleTcy = useCallback(() => {
    if (!editorViewInstance) return;
    const { state, dispatch } = editorViewInstance;
    const { from, to } = state.selection;
    if (from === to) return;
    const text = state.doc.textBetween(from, to);
    if (!text.trim()) return;
    // Toggle: if already wrapped in ^...^, unwrap; otherwise wrap
    if (text.startsWith("^") && text.endsWith("^") && text.length >= 2) {
      const unwrapped = text.slice(1, -1);
      const tr = state.tr.insertText(unwrapped, from, to);
      dispatch(tr);
    } else {
      const tr = state.tr.insertText(`^${text}^`, from, to);
      dispatch(tr);
    }
  }, [editorViewInstance]);

  return {
    handleOpenRubyDialog,
    handleApplyRuby,
    handleToggleTcy,
  };
}
