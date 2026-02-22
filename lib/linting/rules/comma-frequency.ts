import { AbstractLintRule } from "../base-rule";
import { maskDialogue } from "../helpers/dialogue-mask";
import { splitIntoSentences } from "../helpers/sentence-splitter";
import type { LintIssue, LintRuleConfig, LintReference } from "../types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Reference to the official document writing guide */
const STYLE_GUIDE_REF: LintReference = {
  standard: "文化庁「公用文作成の考え方」(2022)",
};

// ---------------------------------------------------------------------------
// Rule implementation
// ---------------------------------------------------------------------------

/**
 * Comma Frequency Rule (L1)
 *
 * Detects sentences with excessive comma density or long sentences
 * with no commas at all. Commas inside dialogue (「」『』) are excluded
 * from the analysis.
 *
 * Two sub-checks:
 * 1. Too many commas: comma-to-character ratio exceeds threshold (default 1/8)
 * 2. No commas: sentence longer than threshold (default 50 chars) has no commas
 *
 * Reference: 文化庁「公用文作成の考え方」(2022)
 */
export class CommaFrequencyRule extends AbstractLintRule {
  readonly id = "comma-frequency";
  readonly name = "Comma Frequency";
  readonly nameJa = "読点の頻度チェック";
  readonly description = "Flags sentences with too many or too few commas";
  readonly descriptionJa = "読点が多すぎる、または少なすぎる文を検出します";
  readonly level = "L1" as const;
  readonly defaultConfig: LintRuleConfig = {
    enabled: true,
    severity: "info",
    options: {
      maxCommaRatio: 0.125,
      minLengthForComma: 50,
    },
  };

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!text) return [];

    const maxCommaRatio = (config.options?.maxCommaRatio as number) ?? 0.125;
    const minLengthForComma = (config.options?.minLengthForComma as number) ?? 50;

    const issues: LintIssue[] = [];
    issues.push(
      ...this.checkTooManyCommas(text, maxCommaRatio, config),
      ...this.checkNoCommas(text, minLengthForComma, config),
    );
    return issues;
  }

  /**
   * Check for sentences with excessive comma density.
   * A sentence is flagged when comma count / effective length exceeds maxCommaRatio.
   * Sentences shorter than 8 characters are skipped as too short to judge.
   */
  private checkTooManyCommas(
    text: string,
    maxCommaRatio: number,
    config: LintRuleConfig,
  ): LintIssue[] {
    const issues: LintIssue[] = [];
    const sentences = splitIntoSentences(text);

    for (const sentence of sentences) {
      const masked = config.skipDialogue ? maskDialogue(sentence.text) : sentence.text;

      // Count commas in non-dialogue text only
      let commaCount = 0;
      let maskPlaceholderCount = 0;
      for (const ch of masked) {
        if (ch === "、") commaCount++;
        if (ch === "〇") maskPlaceholderCount++;
      }

      const effectiveLength = masked.length - maskPlaceholderCount;

      // Skip sentences that are too short to judge
      if (effectiveLength < 8) continue;

      if (commaCount > 0 && commaCount / effectiveLength > maxCommaRatio) {
        const ratio = commaCount / effectiveLength;
        issues.push({
          ruleId: this.id,
          severity: config.severity,
          message: `Sentence has ${commaCount} commas in ${effectiveLength} characters (ratio: ${ratio.toFixed(2)})`,
          messageJa: `一文に読点が${commaCount}個あります（${effectiveLength}文字中、比率: ${ratio.toFixed(2)}）`,
          from: sentence.from,
          to: sentence.to,
          reference: STYLE_GUIDE_REF,
        });
      }
    }

    return issues;
  }

  /**
   * Check for long sentences with no commas at all.
   * A sentence is flagged when its non-dialogue length exceeds minLengthForComma
   * and it contains zero 、 characters.
   * Dialogue-only sentences (where all content is masked) are skipped.
   */
  private checkNoCommas(
    text: string,
    minLengthForComma: number,
    config: LintRuleConfig,
  ): LintIssue[] {
    const issues: LintIssue[] = [];
    const sentences = splitIntoSentences(text);

    for (const sentence of sentences) {
      const masked = config.skipDialogue ? maskDialogue(sentence.text) : sentence.text;

      let commaCount = 0;
      let maskPlaceholderCount = 0;
      for (const ch of masked) {
        if (ch === "、") commaCount++;
        if (ch === "〇") maskPlaceholderCount++;
      }

      const effectiveLength = masked.length - maskPlaceholderCount;

      // Skip dialogue-only sentences (all content is masked)
      if (effectiveLength === 0) continue;

      if (commaCount === 0 && effectiveLength > minLengthForComma) {
        issues.push({
          ruleId: this.id,
          severity: config.severity,
          message: `Long sentence (${effectiveLength} characters) has no commas`,
          messageJa: `${effectiveLength}文字の文に読点がありません`,
          from: sentence.from,
          to: sentence.to,
          reference: STYLE_GUIDE_REF,
        });
      }
    }

    return issues;
  }
}
