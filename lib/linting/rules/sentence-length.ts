import { AbstractLintRule } from "../base-rule";
import { maskDialogue } from "../helpers/dialogue-mask";
import { splitIntoSentences } from "../helpers/sentence-splitter";
import type { LintIssue, LintRuleConfig, LintReference } from "../types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Reference to the Japanese style guide */
const STYLE_GUIDE_REF: LintReference = {
  standard: "日本語スタイルガイド",
};

// ---------------------------------------------------------------------------
// Rule implementation
// ---------------------------------------------------------------------------

/**
 * Sentence Length Rule (L1)
 *
 * Detects sentences that exceed a configurable character length threshold.
 * Long sentences reduce readability; the default threshold is 100 characters.
 *
 * Detection strategy:
 * 1. Split text into sentences at 。！？!?\n delimiters
 * 2. Mask dialogue content (「…」 / 『…』) so it is not counted
 * 3. Measure the effective length (excluding masked placeholders)
 * 4. Flag sentences whose effective length exceeds the threshold
 *
 * Reference: 日本語スタイルガイド
 */
export class SentenceLengthRule extends AbstractLintRule {
  readonly id = "sentence-length";
  readonly name = "Sentence Length";
  readonly nameJa = "長文の検出";
  readonly description =
    "Flags sentences exceeding configurable length threshold";
  readonly descriptionJa = "設定した文字数を超える文を検出します";
  readonly level = "L1" as const;
  readonly defaultConfig: LintRuleConfig = {
    enabled: true,
    severity: "info",
    options: {
      maxLength: 100,
    },
  };

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!text) return [];

    const maxLength = (config.options?.maxLength as number) ?? 100;
    const sentences = splitIntoSentences(text);
    const issues: LintIssue[] = [];

    for (const sentence of sentences) {
      const masked = maskDialogue(sentence.text);
      // Effective length: exclude the placeholder characters
      const effectiveLength = masked.replace(/〇/g, "").length;

      if (effectiveLength > maxLength) {
        issues.push({
          ruleId: this.id,
          severity: config.severity,
          message: `Sentence is ${effectiveLength} characters long (threshold: ${maxLength})`,
          messageJa: `日本語スタイルガイドに基づき、一文が${effectiveLength}文字あります（推奨上限: ${maxLength}文字）`,
          from: sentence.from,
          to: sentence.to,
          reference: STYLE_GUIDE_REF,
        });
      }
    }

    return issues;
  }
}
