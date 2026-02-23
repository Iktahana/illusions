import type { EditorView } from "@milkdown/prose/view";
import { useCallback, useEffect, useRef, useState } from "react";

import { RuleRunner } from "@/lib/linting/rule-runner";
import type { LintIssue, Severity } from "@/lib/linting/types";
import { getNlpClient } from "@/lib/nlp-client/nlp-client";
import { getLlmClient } from "@/lib/llm-client/llm-client";
import { RULE_GUIDELINE_MAP } from "@/lib/linting/lint-presets";
import type { CorrectionModeId, GuidelineId } from "@/lib/linting/correction-config";

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
import { HomophoneDetectionRule } from "@/lib/linting/rules/homophone-detection";

// New rules from official Japanese language standards (#438)
import { MixedWidthSpacingRule } from "@/lib/linting/rules/mixed-width-spacing-rule";
import { BracketSpacingRule } from "@/lib/linting/rules/bracket-spacing-rule";
import { KatakanaWidthRule } from "@/lib/linting/rules/katakana-width-rule";
import { KatakanaChouonRule } from "@/lib/linting/rules/katakana-chouon-rule";
import { JapanesePunctuationWidthRule } from "@/lib/linting/rules/japanese-punctuation-width-rule";
import { HeadingPeriodRule } from "@/lib/linting/rules/heading-period-rule";
import { AlphanumericHalfWidthRule } from "@/lib/linting/rules/alphanumeric-half-width-rule";
import { ListFormattingConsistencyRule } from "@/lib/linting/rules/list-formatting-consistency-rule";
import { NakaguroUsageRule } from "@/lib/linting/rules/nakaguro-usage-rule";
import { WaveDashUnificationRule } from "@/lib/linting/rules/wave-dash-unification-rule";
import { IterationMarkRule } from "@/lib/linting/rules/iteration-mark-rule";
import { BracketPeriodPlacementRule } from "@/lib/linting/rules/bracket-period-placement-rule";
import { LargeNumberCommaRule } from "@/lib/linting/rules/large-number-comma-rule";
import { CounterCharacterRule } from "@/lib/linting/rules/counter-character-rule";
import { VuKatakanaRule } from "@/lib/linting/rules/vu-katakana-rule";
import { GairaiKanaTableRule } from "@/lib/linting/rules/gairai-kana-table-rule";
import { JiZuKanaRule } from "@/lib/linting/rules/ji-zu-kana-rule";
import { HistoricalKanaDetection } from "@/lib/linting/rules/historical-kana-detection";
import { LongVowelKanaRule } from "@/lib/linting/rules/long-vowel-kana-rule";
import { VerbOkuriganaStrictRule } from "@/lib/linting/rules/verb-okurigana-strict-rule";
import { FixedOkuriganaNounRule } from "@/lib/linting/rules/fixed-okurigana-noun-rule";
import { FormalNounOpeningRule } from "@/lib/linting/rules/formal-noun-opening-rule";
import { AuxiliaryVerbOpeningRule } from "@/lib/linting/rules/auxiliary-verb-opening-rule";
import { ConjunctionOpeningRule } from "@/lib/linting/rules/conjunction-opening-rule";
import { ParticleSuffixModifierOpeningRule } from "@/lib/linting/rules/particle-suffix-modifier-opening-rule";
import { CompoundNounOkuriganaOmissionRule } from "@/lib/linting/rules/compound-noun-okurigana-omission-rule";
import { PrefixScriptMatchingRule } from "@/lib/linting/rules/prefix-script-matching-rule";
import { PronounKanjiRule } from "@/lib/linting/rules/pronoun-kanji-rule";
import { DoubleNegativeRule } from "@/lib/linting/rules/double-negative-rule";
import { ParticleKaraYoriRule } from "@/lib/linting/rules/particle-kara-yori-rule";
import { ConjunctiveGaOveruseRule } from "@/lib/linting/rules/conjunctive-ga-overuse-rule";
import { SuruBekiConjugationRule } from "@/lib/linting/rules/suru-beki-conjugation-rule";
import { ConjunctionHierarchyRule } from "@/lib/linting/rules/conjunction-hierarchy-rule";
import { ConsecutiveParticleRule } from "@/lib/linting/rules/consecutive-particle-rule";
import { TautologyRedundancyRule } from "@/lib/linting/rules/tautology-redundancy-rule";
import { OfficialStyleCopulaRule } from "@/lib/linting/rules/official-style-copula-rule";
import { LiteraryStyleExclusionRule } from "@/lib/linting/rules/literary-style-exclusion-rule";
import { ExcessiveHonorificRule } from "@/lib/linting/rules/excessive-honorific-rule";
import { ModifierLengthOrderRule } from "@/lib/linting/rules/modifier-length-order-rule";
import { KanjiVerbOneCharDo } from "@/lib/linting/rules/kanji-verb-one-char-do";

export interface UseLintingResult {
  ruleRunner: RuleRunner;
  lintIssues: LintIssue[];
  isLinting: boolean;
  handleLintIssuesUpdated: (issues: LintIssue[], complete: boolean) => void;
  refreshLinting: () => void;
}

/**
 * Manages the RuleRunner lifecycle, registers all lint rules,
 * syncs rule configs, and provides refresh functionality.
 */
export function useLinting(
  lintingEnabled: boolean,
  lintingRuleConfigs: Record<string, { enabled: boolean; severity: Severity; skipDialogue?: boolean }>,
  editorViewInstance: EditorView | null,
  llmEnabled: boolean = false,
  powerSaveMode: boolean = false,
  llmModelId: string = "qwen3-1.7b-q8",
  correctionGuidelines?: GuidelineId[],
  correctionMode?: CorrectionModeId,
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

    // L3 rules (LLM-based)
    runner.registerRule(new HomophoneDetectionRule());

    // New rules from official Japanese language standards (#438)
    // Notation (約物・表記) — JTF / 公用文 / 外来語の表記 / 現代仮名遣い
    runner.registerRule(new MixedWidthSpacingRule());
    runner.registerRule(new BracketSpacingRule());
    runner.registerRule(new KatakanaWidthRule());
    runner.registerRule(new KatakanaChouonRule());
    runner.registerRule(new JapanesePunctuationWidthRule());
    runner.registerRule(new HeadingPeriodRule());
    runner.registerRule(new AlphanumericHalfWidthRule());
    runner.registerRule(new ListFormattingConsistencyRule());
    runner.registerRule(new NakaguroUsageRule());
    runner.registerRule(new WaveDashUnificationRule());
    runner.registerRule(new IterationMarkRule());
    runner.registerRule(new BracketPeriodPlacementRule());
    runner.registerRule(new LargeNumberCommaRule());
    runner.registerRule(new CounterCharacterRule());
    runner.registerRule(new VuKatakanaRule());
    runner.registerRule(new GairaiKanaTableRule());
    runner.registerRule(new JiZuKanaRule());
    runner.registerRule(new HistoricalKanaDetection());
    runner.registerRule(new LongVowelKanaRule());
    // Kanji / grammar / style — 送り仮名の付け方 / 漢字使用等 / 公用文作成の考え方
    runner.registerRule(new VerbOkuriganaStrictRule());
    runner.registerRule(new FixedOkuriganaNounRule());
    runner.registerRule(new FormalNounOpeningRule());
    runner.registerRule(new AuxiliaryVerbOpeningRule());
    runner.registerRule(new ConjunctionOpeningRule());
    runner.registerRule(new ParticleSuffixModifierOpeningRule());
    runner.registerRule(new CompoundNounOkuriganaOmissionRule());
    runner.registerRule(new PrefixScriptMatchingRule());
    runner.registerRule(new PronounKanjiRule());
    runner.registerRule(new DoubleNegativeRule());
    runner.registerRule(new ParticleKaraYoriRule());
    runner.registerRule(new ConjunctiveGaOveruseRule());
    runner.registerRule(new SuruBekiConjugationRule());
    runner.registerRule(new ConjunctionHierarchyRule());
    runner.registerRule(new ConsecutiveParticleRule());
    runner.registerRule(new TautologyRedundancyRule());
    runner.registerRule(new OfficialStyleCopulaRule());
    runner.registerRule(new LiteraryStyleExclusionRule());
    runner.registerRule(new ExcessiveHonorificRule());
    runner.registerRule(new ModifierLengthOrderRule());
    runner.registerRule(new KanjiVerbOneCharDo());

    // Initialize guideline map for guideline-based filtering
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

  const handleLintIssuesUpdated = useCallback((issues: LintIssue[], complete: boolean) => {
    if (!lintingEnabled) return;
    setLintIssues(issues);
    if (complete) setIsLinting(false);
  }, [lintingEnabled]);

  // Sync active guidelines to RuleRunner and trigger re-lint when guidelines change
  useEffect(() => {
    if (!ruleRunner) return;
    ruleRunner.setActiveGuidelines(correctionGuidelines ?? null);

    // Trigger re-lint when guidelines change
    if (editorViewInstance && lintingEnabled) {
      import("@/packages/milkdown-plugin-japanese-novel/linting-plugin").then(
        ({ updateLintingSettings }) => {
          updateLintingSettings(
            editorViewInstance,
            { ruleRunner: ruleRunnerRef.current },
            "guideline-change",
          );
        },
      ).catch((err) => {
        console.error("[useLinting] Failed to sync guidelines:", err);
      });
    }
  }, [ruleRunner, correctionGuidelines, editorViewInstance, lintingEnabled]);

  // Sync correctionMode to the decoration plugin for LLM validation context
  useEffect(() => {
    if (!editorViewInstance || !lintingEnabled || !correctionMode) return;

    import("@/packages/milkdown-plugin-japanese-novel/linting-plugin").then(
      ({ updateLintingSettings }) => {
        updateLintingSettings(
          editorViewInstance,
          { correctionMode, llmModelId },
          "mode-change",
        );
      },
    ).catch((err) => {
      console.error("[useLinting] Failed to sync correction mode:", err);
    });
  }, [correctionMode, editorViewInstance, lintingEnabled]);

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
    setLintIssues([]);
    import("@/packages/milkdown-plugin-japanese-novel/linting-plugin").then(
      ({ updateLintingSettings }) => {
        const nlpClient = ruleRunnerRef.current?.hasMorphologicalRules()
          ? getNlpClient()
          : null;

        updateLintingSettings(
          editorViewInstance,
          {
            ruleRunner: ruleRunnerRef.current,
            nlpClient,
            llmClient: getLlmClient(),
            llmModelId,
          },
          "manual-refresh",
        );
      },
    ).catch((err) => {
      console.error("[useLinting] Failed to refresh linting:", err);
      setIsLinting(false);
    });
  }, [editorViewInstance, lintingEnabled, llmModelId]);

  return {
    ruleRunner,
    lintIssues,
    isLinting,
    handleLintIssuesUpdated,
    refreshLinting,
  };
}
