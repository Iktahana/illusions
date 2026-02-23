import { AbstractDocumentLintRule } from "../base-rule";
import type { LintIssue, LintRuleConfig, LintReference, CorrectionEngine } from "../types";

/** JTF reference for wave dash unification rule */
const JTF_REF: LintReference = {
  standard: "JTF日本語標準スタイルガイド v3.0",
  section: "2.1.3",
};

/** Wave dash (U+301C) — the standard form in Japanese typography */
const WAVE_DASH = "\u301C"; // 〜
/** Fullwidth tilde (U+FF5E) — often confused with wave dash */
const FULLWIDTH_TILDE = "\uFF5E"; // ～

/**
 * WaveDashUnificationRule -- L1 document-level rule.
 *
 * Detects mixed use of U+301C (wave dash 〜) and U+FF5E (fullwidth tilde ～)
 * within a document. Per JTF 2.1.3, only one form should be used consistently.
 *
 * When both forms appear, the minority form is flagged with a suggestion
 * to convert to the majority form.
 */
export class WaveDashUnificationRule extends AbstractDocumentLintRule {
  readonly id = "wave-dash-unification";
  override engine: CorrectionEngine = "regex";
  readonly name = "Unify wave dash usage";
  readonly nameJa = "波ダッシュの統一";
  readonly description =
    "Detects mixed usage of U+301C (〜) and U+FF5E (～) in the document";
  readonly descriptionJa =
    "波ダッシュ（U+301C: 〜）と全角チルダ（U+FF5E: ～）の混在を検出します";
  readonly level = "L1" as const;
  readonly defaultConfig: LintRuleConfig = {
    enabled: true,
    severity: "error",
  };

  lintDocument(
    paragraphs: ReadonlyArray<{ text: string; index: number }>,
    config: LintRuleConfig,
  ): Array<{ paragraphIndex: number; issues: LintIssue[] }> {
    if (!config.enabled || paragraphs.length === 0) return [];

    // Count occurrences of each form across the whole document
    let waveDashCount = 0;
    let fullwidthTildeCount = 0;

    for (const para of paragraphs) {
      for (const ch of para.text) {
        if (ch === WAVE_DASH) waveDashCount++;
        else if (ch === FULLWIDTH_TILDE) fullwidthTildeCount++;
      }
    }

    // Only flag if both forms are present
    if (waveDashCount === 0 || fullwidthTildeCount === 0) return [];

    // Determine minority and preferred form
    const minorityChar =
      waveDashCount <= fullwidthTildeCount ? WAVE_DASH : FULLWIDTH_TILDE;
    const majorityChar =
      waveDashCount > fullwidthTildeCount ? WAVE_DASH : FULLWIDTH_TILDE;
    const majorityName =
      majorityChar === WAVE_DASH ? "波ダッシュ（U+301C）" : "全角チルダ（U+FF5E）";

    const results: Array<{ paragraphIndex: number; issues: LintIssue[] }> = [];

    for (const para of paragraphs) {
      const issues: LintIssue[] = [];

      for (let i = 0; i < para.text.length; i++) {
        if (para.text[i] !== minorityChar) continue;

        issues.push({
          ruleId: this.id,
          severity: config.severity,
          message: `Mixed wave dash usage: convert to "${majorityChar}" (${majorityName}) for consistency (JTF 2.1.3)`,
          messageJa: `JTF 2.1.3に基づき、文書内で波ダッシュの種類が混在しています。${majorityName}に統一してください`,
          from: i,
          to: i + 1,
          originalText: minorityChar,
          reference: JTF_REF,
          fix: {
            label: `Replace with "${majorityChar}" (${majorityName})`,
            labelJa: `${majorityName}に統一`,
            replacement: majorityChar,
          },
        });
      }

      if (issues.length > 0) {
        results.push({ paragraphIndex: para.index, issues });
      }
    }

    return results;
  }
}
