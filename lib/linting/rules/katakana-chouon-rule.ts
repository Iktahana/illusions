import type { Token } from "@/lib/nlp-client/types";
import { AbstractMorphologicalLintRule } from "../base-rule";
import type { LintIssue, LintRuleConfig, LintReference, CorrectionEngine } from "../types";

/** JTF reference for katakana long vowel rule */
const JTF_REF: LintReference = {
  standard: "JTF日本語標準スタイルガイド v3.0",
  section: "2.2.2",
};

/**
 * Patterns where repeated vowels in katakana should use ー (long vowel mark).
 * These patterns detect repeated vowel sequences that are commonly mistaken
 * for valid katakana but should use the long vowel mark instead.
 */
const VOWEL_REPETITION_PATTERNS: ReadonlyArray<{
  pattern: RegExp;
  replacement: string;
  description: string;
}> = [
  { pattern: /アア/g, replacement: "アー", description: "アア→アー" },
  { pattern: /イイ/g, replacement: "イー", description: "イイ→イー" },
  { pattern: /ウウ/g, replacement: "ウー", description: "ウウ→ウー" },
  { pattern: /エエ/g, replacement: "エー", description: "エエ→エー" },
  { pattern: /オオ/g, replacement: "オー", description: "オオ→オー" },
  { pattern: /ラア/g, replacement: "ラー", description: "ラア→ラー" },
  { pattern: /リイ/g, replacement: "リー", description: "リイ→リー" },
  { pattern: /ルウ/g, replacement: "ルー", description: "ルウ→ルー" },
  { pattern: /レエ/g, replacement: "レー", description: "レエ→レー" },
  { pattern: /ロオ/g, replacement: "ロー", description: "ロオ→ロー" },
];

/**
 * KatakanaChouonRule -- L2 morphological rule (paragraph-level).
 *
 * Detects katakana words containing repeated vowel sequences that should
 * use the long vowel mark (ー) instead. Per JTF 2.2.2, katakana loanwords
 * should use ー for long vowel sounds rather than repeating the vowel.
 *
 * This rule uses morphological analysis to identify katakana tokens,
 * then checks those tokens for vowel repetition patterns.
 */
export class KatakanaChouonRule extends AbstractMorphologicalLintRule {
  readonly id = "katakana-chouon";
  override engine: CorrectionEngine = "morphological";
  readonly name = "Use long vowel mark in katakana";
  readonly nameJa = "カタカナ語の長音省略禁止";
  readonly description =
    "Detects katakana words using repeated vowels instead of the long vowel mark (ー)";
  readonly descriptionJa =
    "長音記号「ー」の代わりに母音を繰り返しているカタカナ語を検出します";
  readonly level = "L2" as const;
  readonly defaultConfig: LintRuleConfig = {
    enabled: true,
    severity: "warning",
    skipDialogue: true,
  };

  /** Matches a string that is entirely or mostly katakana */
  private static readonly KATAKANA_PATTERN = /^[\u30A0-\u30FFー]+$/;

  lintWithTokens(
    text: string,
    tokens: ReadonlyArray<Token>,
    config: LintRuleConfig,
  ): LintIssue[] {
    if (!config.enabled || !text) return [];

    const issues: LintIssue[] = [];

    for (const token of tokens) {
      // Only examine tokens whose surface form is katakana
      if (!KatakanaChouonRule.KATAKANA_PATTERN.test(token.surface)) continue;

      for (const { pattern, replacement, description } of VOWEL_REPETITION_PATTERNS) {
        // Reset lastIndex for the reused regex
        pattern.lastIndex = 0;
        for (const match of token.surface.matchAll(pattern)) {
          if (match.index === undefined) continue;

          const from = token.start + match.index;
          const to = from + match[0].length;

          issues.push({
            ruleId: this.id,
            severity: config.severity,
            message: `Use long vowel mark (ー) instead of repeated vowel: ${description} (JTF 2.2.2)`,
            messageJa: `JTF 2.2.2に基づき、母音の繰り返し「${match[0]}」は長音記号「${replacement}」で表記してください`,
            from,
            to,
            originalText: match[0],
            reference: JTF_REF,
            fix: {
              label: `Replace with "${replacement}"`,
              labelJa: `「${replacement}」に変換`,
              replacement,
            },
          });
        }
      }
    }

    return issues;
  }
}
