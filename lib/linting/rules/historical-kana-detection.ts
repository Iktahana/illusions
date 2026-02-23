import { AbstractDocumentLintRule } from "../base-rule";
import type { LintIssue, LintRuleConfig, LintReference, CorrectionEngine } from "../types";

/** Reference for historical kana detection */
const KANA_REF: LintReference = {
  standard: "文化庁「現代仮名遣い」(1986, 内閣告示第一号)",
};

/**
 * Historical kana characters that are no longer used in modern Japanese.
 * These are remnants of historical kana spelling (歴史的仮名遣い).
 */
const HISTORICAL_KANA: ReadonlyArray<{
  char: string;
  modern: string;
  nameJa: string;
}> = [
  { char: "\u3090", modern: "い", nameJa: "ゐ（ゐ）" },  // ゐ
  { char: "\u3091", modern: "え", nameJa: "ゑ（ゑ）" },  // ゑ
  { char: "\u30F0", modern: "イ", nameJa: "ヰ（ヰ）" },  // ヰ
  { char: "\u30F1", modern: "エ", nameJa: "ヱ（ヱ）" },  // ヱ
];

/**
 * HistoricalKanaDetection -- L1 document-level rule.
 *
 * Detects historical kana characters (歴史的仮名遣い) that are no longer
 * used in modern Japanese: ゐ (U+3090), ゑ (U+3091), ヰ (U+30F0), ヱ (U+30F1).
 * Per 文化庁「現代仮名遣い」, these characters should be replaced with their
 * modern equivalents except in quotations of classical texts.
 *
 * Historical characters and their modern equivalents:
 * - ゐ → い
 * - ゑ → え
 * - ヰ → イ
 * - ヱ → エ
 */
export class HistoricalKanaDetection extends AbstractDocumentLintRule {
  readonly id = "historical-kana-detection";
  override engine: CorrectionEngine = "regex";
  readonly name = "Detect historical kana characters";
  readonly nameJa = "歴史的仮名遣いの検出";
  readonly description =
    "Detects historical kana (ゐ, ゑ, ヰ, ヱ) that should use modern equivalents";
  readonly descriptionJa =
    "現代では使用されない歴史的仮名遣い（ゐ・ゑ・ヰ・ヱ）を検出します";
  readonly level = "L1" as const;
  readonly defaultConfig: LintRuleConfig = {
    enabled: true,
    severity: "warning",
  };

  lintDocument(
    paragraphs: ReadonlyArray<{ text: string; index: number }>,
    config: LintRuleConfig,
  ): Array<{ paragraphIndex: number; issues: LintIssue[] }> {
    if (!config.enabled || paragraphs.length === 0) return [];

    const results: Array<{ paragraphIndex: number; issues: LintIssue[] }> = [];

    for (const para of paragraphs) {
      const issues = this.checkParagraph(para.text, config);
      if (issues.length > 0) {
        results.push({ paragraphIndex: para.index, issues });
      }
    }

    return results;
  }

  /**
   * Check a single paragraph for historical kana characters.
   */
  private checkParagraph(text: string, config: LintRuleConfig): LintIssue[] {
    const issues: LintIssue[] = [];

    for (const { char, modern, nameJa } of HISTORICAL_KANA) {
      for (let i = 0; i < text.length; i++) {
        if (text[i] !== char) continue;

        issues.push({
          ruleId: this.id,
          severity: config.severity,
          message: `Historical kana "${char}" (${nameJa}) should be replaced with "${modern}" in modern Japanese (現代仮名遣い)`,
          messageJa: `現代仮名遣いに基づき、歴史的仮名遣い「${char}」（${nameJa}）は現代表記「${modern}」に改めてください（古典文の引用を除く）`,
          from: i,
          to: i + 1,
          originalText: char,
          reference: KANA_REF,
          fix: {
            label: `Replace with "${modern}"`,
            labelJa: `「${modern}」に変換`,
            replacement: modern,
          },
        });
      }
    }

    return issues;
  }
}
