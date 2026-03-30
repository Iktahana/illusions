import type { EditorView } from "@milkdown/prose/view";
import { useCallback, useEffect, useRef, useState } from "react";

import { RuleRunner } from "@/lib/linting/rule-runner";
import type { LintIssue, Severity } from "@/lib/linting/types";
import { getNlpClient } from "@/lib/nlp-client/nlp-client";
import { RULE_GUIDELINE_MAP } from "@/lib/linting/lint-presets";
import { getAllRules, createJsonDrivenRules } from "@/lib/linting/rule-registry";
import type { CorrectionModeId, GuidelineId } from "@/lib/linting/correction-config";
import { notificationManager } from "@/lib/services/notification-manager";

export interface UseLintingResult {
  ruleRunner: RuleRunner;
  lintIssues: LintIssue[];
  isLinting: boolean;
  handleLintIssuesUpdated: (issues: LintIssue[]) => void;
  /** Callback for the decoration plugin to invoke when NLP tokenization fails.
   *  Shows a user-visible notification (in Japanese) and logs the error. */
  handleNlpError: (error: Error) => void;
  refreshLinting: () => void;
}

/**
 * Manages the RuleRunner lifecycle, registers all lint rules,
 * syncs rule configs, and provides refresh functionality.
 */
export function useLinting(
  lintingEnabled: boolean,
  lintingRuleConfigs: Record<
    string,
    { enabled: boolean; severity: Severity; skipDialogue?: boolean }
  >,
  editorViewInstance: EditorView | null,
  powerSaveMode: boolean = false,
  correctionGuidelines?: GuidelineId[],
  correctionMode?: CorrectionModeId,
): UseLintingResult {
  const ruleRunnerRef = useRef<RuleRunner | null>(null);
  const [lintIssues, setLintIssues] = useState<LintIssue[]>([]);
  const [isLinting, setIsLinting] = useState(false);

  // Lazily create and register all rules once
  if (!ruleRunnerRef.current) {
    const runner = new RuleRunner();
    for (const rule of getAllRules()) runner.registerRule(rule);
    for (const rule of createJsonDrivenRules()) runner.registerRule(rule);

    runner.setGuidelineMap(RULE_GUIDELINE_MAP);

    ruleRunnerRef.current = runner;
  }

  // Guaranteed non-null after the lazy initialization block above
  const ruleRunner = ruleRunnerRef.current!;

  // Sync rule configs from settings to RuleRunner
  useEffect(() => {
    if (!ruleRunner) return;

    // Apply user overrides from settings
    for (const [ruleId, config] of Object.entries(lintingRuleConfigs)) {
      ruleRunner.setConfig(ruleId, {
        enabled: config.enabled,
        severity: config.severity,
        skipDialogue: config.skipDialogue,
      });
    }
  }, [ruleRunner, lintingRuleConfigs]);

  const handleLintIssuesUpdated = useCallback(
    (issues: LintIssue[]) => {
      if (!lintingEnabled) return;
      setLintIssues(issues);
      setIsLinting(false);
    },
    [lintingEnabled],
  );

  // Handle NLP tokenization errors — show a user-visible notification
  const handleNlpError = useCallback((error: Error) => {
    console.error("[useLinting] NLP initialization/tokenization failed:", error);
    notificationManager.warning(
      "形態素解析の初期化に失敗しました。一部の校正ルール（L2）が無効になっています。",
      15000,
    );
  }, []);

  // Sync active guidelines to RuleRunner and trigger re-lint when guidelines change
  useEffect(() => {
    if (!ruleRunner) return;
    ruleRunner.setActiveGuidelines(correctionGuidelines ?? null);

    // Trigger re-lint when guidelines change
    if (editorViewInstance && lintingEnabled) {
      import("@/packages/milkdown-plugin-japanese-novel/linting-plugin")
        .then(({ updateLintingSettings }) => {
          updateLintingSettings(
            editorViewInstance,
            { ruleRunner: ruleRunnerRef.current },
            "guideline-change",
          );
        })
        .catch((err) => {
          console.error("[useLinting] Failed to sync guidelines:", err);
        });
    }
  }, [ruleRunner, correctionGuidelines, editorViewInstance, lintingEnabled]);

  // Clear issues when linting is disabled
  useEffect(() => {
    if (!lintingEnabled) {
      setLintIssues([]);
    }
  }, [lintingEnabled]);

  // Force re-run linting on the full document (not just visible paragraphs)
  const refreshLinting = useCallback(() => {
    if (!editorViewInstance || !lintingEnabled) return;

    setIsLinting(true);
    import("@/packages/milkdown-plugin-japanese-novel/linting-plugin")
      .then(({ updateLintingSettings }) => {
        const nlpClient = ruleRunnerRef.current?.hasMorphologicalRules() ? getNlpClient() : null;

        updateLintingSettings(
          editorViewInstance,
          {
            ruleRunner: ruleRunnerRef.current,
            nlpClient,
          },
          "manual-refresh",
        );
      })
      .catch((err) => {
        console.error("[useLinting] Failed to refresh linting:", err);
        setIsLinting(false);
      });
  }, [editorViewInstance, lintingEnabled]);

  return {
    ruleRunner,
    lintIssues,
    isLinting,
    handleLintIssuesUpdated,
    handleNlpError,
    refreshLinting,
  };
}
