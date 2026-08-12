import { useCallback, useRef } from "react";
import type { MutableRefObject } from "react";
import { Fragment } from "@milkdown/prose/model";
import { toggleMark } from "@milkdown/prose/commands";
import type { EditorView } from "@milkdown/prose/view";
import { dispatchIfEditorViewAlive } from "@/shared/lib/editor-view-safety";
import { trackUsageEvent } from "@/lib/analytics/usage-events";

export interface RubyApplicationSegment {
  base: string;
  ruby?: string;
}

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

  /** Replace the saved selection with structured Ruby nodes from the MDI plugin. */
  const handleApplyRuby = useCallback(
    (segments: readonly RubyApplicationSegment[]) => {
      const view = editorViewRef.current;
      if (!view) return;
      const sel = rubySelectionRef.current;
      if (!sel) return;
      const { state } = view;
      const rubyNodeType = state.schema.nodes.mdiRuby;
      if (!rubyNodeType) {
        rubySelectionRef.current = null;
        return;
      }
      const nodes = segments.map((segment) =>
        segment.ruby
          ? rubyNodeType.create({ base: segment.base, ruby: segment.ruby })
          : state.schema.text(segment.base),
      );
      const fragment = Fragment.from(nodes);
      const applied = dispatchIfEditorViewAlive(view, (aliveView) =>
        aliveView.state.tr.replaceWith(sel.from, sel.to, fragment),
      );
      if (applied) {
        trackUsageEvent("editor_format_applied", { format: "ruby", operation: "apply" });
      }
      rubySelectionRef.current = null;
    },
    // editorViewRef is a stable ref object; including it here satisfies the React Compiler
    [editorViewRef],
  );

  /** Toggle the semantic TCY mark without constructing MDI delimiters. */
  const handleToggleTcy = useCallback(() => {
    const view = editorViewRef.current;
    if (!view) return;
    const { state } = view;
    const { from, to } = state.selection;
    if (from === to) return;
    if (!state.doc.textBetween(from, to).trim()) return;
    const markType = state.schema.marks.mdiTcy;
    if (!markType) return;
    const operation = state.doc.rangeHasMark(from, to, markType) ? "remove" : "apply";
    const applied = toggleMark(markType)(state, view.dispatch, view);
    if (applied) {
      trackUsageEvent("editor_format_applied", { format: "tcy", operation });
    }
    // editorViewRef is a stable ref object; including it here satisfies the React Compiler
  }, [editorViewRef]);

  return {
    handleOpenRubyDialog,
    handleApplyRuby,
    handleToggleTcy,
  };
}
