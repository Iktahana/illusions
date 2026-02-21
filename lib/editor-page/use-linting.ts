import type { EditorView } from "@milkdown/prose/view";
import { useCallback, useEffect, useRef, useState } from "react";

import { RuleRunner } from "@/lib/linting/rule-runner";
import type { LintIssue, Severity } from "@/lib/linting/types";
import { getNlpClient } from "@/lib/nlp-client/nlp-client";

// Import all lint rules
import { PunctuationRule } from "@/lib/linting/rules/punctuation-rules";
import { NumberFormatRule } from "@/lib/linting/rules/number-format";
import { JoyoKanjiRule } from "@/lib/linting/rules/joyo-kanji";
import { EraYearValidatorRule } from "@/lib/linting/rules/era-year-validator";
import { ParticleNoRepetitionRule } from "@/lib/linting/rules/particle-no-repetition";
import { ConjugationErrorRule } from "@/lib/linting/rules/conjugation-errors";
import { RedundantExpressionRule } from "@/lib/linting/rules/redundant-expression";
import { VerboseExpressionRule } from "@/lib/linting/rules/verbose-expression";
import { SentenceEndingRepetitionRule } from "@/lib/linting/rules/sentence-ending-repetition";
import { CorrelativeExpressionRule } from "@/lib/linting/rules/correlative-expression";
import { NotationConsistencyRule } from "@/lib/linting/rules/notation-consistency";
import { SentenceLengthRule } from "@/lib/linting/rules/sentence-length";
import { DashFormatRule } from "@/lib/linting/rules/dash-format";
import { DialoguePunctuationRule } from "@/lib/linting/rules/dialogue-punctuation";
import { CommaFrequencyRule } from "@/lib/linting/rules/comma-frequency";
import { DesuMasuConsistencyRule } from "@/lib/linting/rules/desu-masu-consistency";
import { ConjunctionOveruseRule } from "@/lib/linting/rules/conjunction-overuse";
import { WordRepetitionRule } from "@/lib/linting/rules/word-repetition";
import { TaigenDomeOveruseRule } from "@/lib/linting/rules/taigen-dome-overuse";
import { PassiveOveruseRule } from "@/lib/linting/rules/passive-overuse";
import { CounterWordMismatchRule } from "@/lib/linting/rules/counter-word-mismatch";
import { AdverbFormConsistencyRule } from "@/lib/linting/rules/adverb-form-consistency";

export interface UseLintingResult {
  ruleRunner: RuleRunner;
  lintIssues: LintIssue[];
  isLinting: boolean;
  handleLintIssuesUpdated: (issues: LintIssue[]) => void;
  refreshLinting: () => void;
}

/**
 * Manages the RuleRunner lifecycle, registers all lint rules,
 * syncs rule configs, and provides refresh functionality.
 */
export function useLinting(
  lintingEnabled: boolean,
  lintingRuleConfigs: Record<string, { enabled: boolean; severity: Severity }>,
  editorViewInstance: EditorView | null,
): UseLintingResult {
  const ruleRunnerRef = useRef<RuleRunner | null>(null);
  const [lintIssues, setLintIssues] = useState<LintIssue[]>([]);
  const [isLinting, setIsLinting] = useState(false);

  // Lazily create and register all rules once
  if (!ruleRunnerRef.current) {
    const runner = new RuleRunner();
    runner.registerRule(new PunctuationRule());
    runner.registerRule(new NumberFormatRule());
    runner.registerRule(new JoyoKanjiRule());
    runner.registerRule(new EraYearValidatorRule());
    runner.registerRule(new ParticleNoRepetitionRule());
    runner.registerRule(new ConjugationErrorRule());
    runner.registerRule(new RedundantExpressionRule());
    runner.registerRule(new VerboseExpressionRule());
    runner.registerRule(new SentenceEndingRepetitionRule());
    runner.registerRule(new CorrelativeExpressionRule());
    runner.registerRule(new NotationConsistencyRule());
    runner.registerRule(new SentenceLengthRule());
    runner.registerRule(new DashFormatRule());
    runner.registerRule(new DialoguePunctuationRule());
    runner.registerRule(new CommaFrequencyRule());
    runner.registerRule(new DesuMasuConsistencyRule());
    runner.registerRule(new ConjunctionOveruseRule());
    runner.registerRule(new WordRepetitionRule());
    runner.registerRule(new TaigenDomeOveruseRule());
    runner.registerRule(new PassiveOveruseRule());
    runner.registerRule(new CounterWordMismatchRule());
    runner.registerRule(new AdverbFormConsistencyRule());
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
      });
    }
  }, [ruleRunner, lintingRuleConfigs]);

  const handleLintIssuesUpdated = useCallback((issues: LintIssue[]) => {
    if (!lintingEnabled) return;
    setLintIssues(issues);
    setIsLinting(false);
  }, [lintingEnabled]);

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
    import("@/packages/milkdown-plugin-japanese-novel/linting-plugin").then(
      ({ updateLintingSettings }) => {
        const nlpClient = ruleRunnerRef.current?.hasMorphologicalRules()
          ? getNlpClient()
          : null;
        updateLintingSettings(editorViewInstance, {
          ruleRunner: ruleRunnerRef.current,
          nlpClient,
          forceFullScan: true,
        });
      },
    ).catch((err) => {
      console.error("[useLinting] Failed to refresh linting:", err);
      setIsLinting(false);
    });
  }, [editorViewInstance, lintingEnabled]);

  return {
    ruleRunner,
    lintIssues,
    isLinting,
    handleLintIssuesUpdated,
    refreshLinting,
  };
}
