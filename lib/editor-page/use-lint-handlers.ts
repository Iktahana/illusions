import { useCallback, useEffect, useMemo, useState } from "react";
import { notificationManager } from "@/lib/services/notification-manager";
import type { EditorView } from "@milkdown/prose/view";
import type { LintIssue } from "@/lib/linting/types";
import { centerEditorPosition } from "@/lib/editor-page/center-editor-position";

interface UseLintHandlersOptions {
  editorViewInstance: EditorView | null;
  lintIssues: LintIssue[];
  ignoreCorrection: (ruleId: string, text: string, paragraphText?: string) => void;
  triggerSwitchToCorrections: () => void;
}

export function useLintHandlers({
  editorViewInstance,
  lintIssues,
  ignoreCorrection,
  triggerSwitchToCorrections,
}: UseLintHandlersOptions) {
  // Enrich lint issues with original text from the document
  const enrichedLintIssues = useMemo(() => {
    if (!editorViewInstance || lintIssues.length === 0) return lintIssues;
    const doc = editorViewInstance.state.doc;
    return lintIssues.map((issue: LintIssue) => {
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
        const { state, dispatch } = editorViewInstance;
        const clampedTo = Math.min(issue.to, state.doc.content.size);
        const clampedFrom = Math.min(issue.from, clampedTo);
        const selection = TextSelection.create(state.doc, clampedFrom, clampedTo);
        dispatch(state.tr.setSelection(selection));
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
      // Extract original text from the document
      let issueText: string;
      try {
        issueText = editorViewInstance.state.doc.textBetween(
          issue.from,
          Math.min(issue.to, editorViewInstance.state.doc.content.size),
        );
      } catch {
        return;
      }
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

  /** Apply a lint fix by replacing the text range */
  const handleApplyFix = useCallback(
    (issue: LintIssue & { originalText?: string }) => {
      if (!editorViewInstance || !issue.fix) return;
      const { state, dispatch } = editorViewInstance;
      if (issue.to > state.doc.content.size) {
        notificationManager.warning("テキストが変更されたため修正を適用できません");
        return;
      }
      const currentText = state.doc.textBetween(issue.from, issue.to, "");
      if (issue.originalText && currentText !== issue.originalText) {
        notificationManager.warning("テキストが変更されたため修正を適用できません");
        return;
      }
      const tr = state.tr.insertText(issue.fix.replacement, issue.from, issue.to);
      dispatch(tr);
    },
    [editorViewInstance],
  );

  return {
    enrichedLintIssues,
    activeLintIssueIndex,
    handleNavigateToIssue,
    handleShowLintHint,
    handleIgnoreCorrection,
    handleApplyFix,
  };
}
