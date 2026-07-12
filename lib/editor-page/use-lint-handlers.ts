import { useCallback, useEffect, useMemo, useState } from "react";
import { notificationManager } from "@/lib/services/notification-manager";
import type { EditorView } from "@milkdown/prose/view";
import type { LintIssue } from "@/lib/linting/types";
import { centerEditorPosition } from "@/lib/editor-page/center-editor-position";
import { dispatchIfEditorViewAlive, isEditorViewAlive } from "@/shared/lib/editor-view-safety";

/**
 * Get the exact text a lint issue flagged.
 *
 * Prefers `issue.originalText`, captured by the lint pipeline at detection
 * time: issue positions held in React state are frozen at lint-dispatch time
 * and are not remapped when the document changes, so slicing the current
 * document with them can return a drifted, wrong string (#2047). Falls back
 * to extracting from the document only when `originalText` is absent.
 */
function getIssueText(issue: LintIssue, view: EditorView): string | null {
  if (issue.originalText) return issue.originalText;
  try {
    return view.state.doc.textBetween(issue.from, Math.min(issue.to, view.state.doc.content.size));
  } catch {
    return null;
  }
}

interface UseLintHandlersOptions {
  editorViewInstance: EditorView | null;
  lintIssues: LintIssue[];
  ignoreCorrection: (ruleId: string, text: string, paragraphText?: string) => void;
  addWordToUserDictionary: (word: string) => Promise<void>;
  triggerSwitchToCorrections: () => void;
}

export function useLintHandlers({
  editorViewInstance,
  lintIssues,
  ignoreCorrection,
  addWordToUserDictionary,
  triggerSwitchToCorrections,
}: UseLintHandlersOptions) {
  // Enrich lint issues with original text from the document.
  // The lint pipeline already records `originalText` at detection time (the
  // exact string the rule flagged, extracted in the linter's own coordinate
  // space). Positions in React state are frozen at lint-dispatch time and are
  // NOT remapped when the document changes, so re-extracting via textBetween
  // can yield drifted garbage (#2047). Never clobber an existing originalText;
  // only fill it in for issues that lack one.
  const enrichedLintIssues = useMemo(() => {
    if (!editorViewInstance || lintIssues.length === 0) return lintIssues;
    const doc = editorViewInstance.state.doc;
    return lintIssues.map((issue: LintIssue) => {
      if (issue.originalText != null) return issue;
      try {
        const originalText = doc.textBetween(issue.from, Math.min(issue.to, doc.content.size));
        return { ...issue, originalText };
      } catch {
        return issue;
      }
    });
  }, [editorViewInstance, lintIssues]);

  // Cursor → issue sync: track which issue the cursor is on
  const [activeLintIssueIndex, setActiveLintIssueIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!editorViewInstance || enrichedLintIssues.length === 0) {
      setActiveLintIssueIndex(null);
      return;
    }
    const dom = editorViewInstance.dom as HTMLElement;
    const handler = () => {
      const pos = editorViewInstance.state.selection.from;
      const idx = enrichedLintIssues.findIndex((i: LintIssue) => pos >= i.from && pos <= i.to);
      setActiveLintIssueIndex(idx >= 0 ? idx : null);
    };
    dom.addEventListener("mouseup", handler);
    dom.addEventListener("keyup", handler);
    return () => {
      dom.removeEventListener("mouseup", handler);
      dom.removeEventListener("keyup", handler);
    };
  }, [editorViewInstance, enrichedLintIssues]);

  /** Navigate to a lint issue in the editor */
  const handleNavigateToIssue = useCallback(
    (issue: LintIssue) => {
      if (!editorViewInstance) return;
      void import("@milkdown/prose/state").then(({ TextSelection }) => {
        if (!isEditorViewAlive(editorViewInstance)) return;
        const { state } = editorViewInstance;
        const clampedTo = Math.min(issue.to, state.doc.content.size);
        const clampedFrom = Math.min(issue.from, clampedTo);
        dispatchIfEditorViewAlive(editorViewInstance, (view) => {
          const selection = TextSelection.create(view.state.doc, clampedFrom, clampedTo);
          return view.state.tr.setSelection(selection);
        });
        centerEditorPosition(editorViewInstance, clampedFrom);

        editorViewInstance.focus();
      });
    },
    [editorViewInstance],
  );

  /** Navigate to a lint issue from context menu (also switches Inspector to corrections tab) */
  const handleShowLintHint = useCallback(
    (issue: LintIssue) => {
      triggerSwitchToCorrections();
      handleNavigateToIssue(issue);
    },
    [handleNavigateToIssue, triggerSwitchToCorrections],
  );

  /** Handle ignoring a correction (single or all identical) */
  const handleIgnoreCorrection = useCallback(
    (issue: LintIssue, ignoreAll: boolean) => {
      if (!editorViewInstance) return;
      const issueText = getIssueText(issue, editorViewInstance);
      if (!issueText) return;

      if (ignoreAll) {
        // Ignore all occurrences: no context hash
        ignoreCorrection(issue.ruleId, issueText);
      } else {
        // Ignore single occurrence: compute context hash from paragraph text
        // Find the paragraph containing this issue
        let paragraphText: string | undefined;
        editorViewInstance.state.doc.descendants((node, pos) => {
          if (paragraphText) return false;
          if (node.type.name === "paragraph" && node.textContent) {
            const paraEnd = pos + node.nodeSize;
            if (issue.from >= pos && issue.to <= paraEnd) {
              paragraphText = node.textContent;
              return false;
            }
          }
          return true;
        });
        ignoreCorrection(issue.ruleId, issueText, paragraphText);
      }
    },
    [editorViewInstance, ignoreCorrection],
  );

  /** Add the flagged word of a dictionary-membership issue to the user dictionary */
  const handleAddToUserDictionary = useCallback(
    (issue: LintIssue) => {
      if (!editorViewInstance) return;
      const issueText = getIssueText(issue, editorViewInstance);
      if (!issueText) return;
      void addWordToUserDictionary(issueText);
    },
    [editorViewInstance, addWordToUserDictionary],
  );

  /** Apply a lint fix by replacing the text range */
  const handleApplyFix = useCallback(
    (issue: LintIssue & { originalText?: string }) => {
      if (!editorViewInstance || !issue.fix) return;
      const { state } = editorViewInstance;
      if (issue.to > state.doc.content.size) {
        notificationManager.warning("テキストが変更されたため修正を適用できません");
        return;
      }
      const currentText = state.doc.textBetween(issue.from, issue.to, "");
      if (issue.originalText && currentText !== issue.originalText) {
        notificationManager.warning("テキストが変更されたため修正を適用できません");
        return;
      }
      dispatchIfEditorViewAlive(editorViewInstance, (view) =>
        view.state.tr.insertText(issue.fix!.replacement, issue.from, issue.to),
      );
    },
    [editorViewInstance],
  );

  return {
    enrichedLintIssues,
    activeLintIssueIndex,
    handleNavigateToIssue,
    handleShowLintHint,
    handleIgnoreCorrection,
    handleAddToUserDictionary,
    handleApplyFix,
  };
}
