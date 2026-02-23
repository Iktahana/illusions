import { AbstractDocumentLintRule } from "../base-rule";
import type { LintIssue, LintRuleConfig, LintReference, CorrectionEngine } from "../types";

/** JTF reference for nakaguro usage rule */
const JTF_REF: LintReference = {
  standard: "JTF日本語標準スタイルガイド v3.0",
  section: "2.1.5",
};

/**
 * Heuristic: ・ used as a bullet (line starts with ・ possibly after whitespace)
 */
const BULLET_PATTERN = /^[　\s]*・/;

/**
 * Heuristic: ・ used as a separator between words (e.g., 山田・田中, ア・イ・ウ)
 * Looks for ・ surrounded by non-space characters (not at line start).
 */
const SEPARATOR_PATTERN = /\S・\S/;

/**
 * NakaguroUsageRule -- L1 document-level rule.
 *
 * Detects mixed usage of 中黒（・）as both a bullet marker and
 * as a word separator within the same document. Per JTF 2.1.5,
 * ・ should be used consistently for one purpose throughout.
 *
 * When mixed usage is detected, the minority usage is flagged.
 */
export class NakaguroUsageRule extends AbstractDocumentLintRule {
  readonly id = "nakaguro-usage";
  override engine: CorrectionEngine = "regex";
  readonly name = "Consistent nakaguro usage";
  readonly nameJa = "中黒（・）の用法統一";
  readonly description =
    "Detects mixed usage of ・ as both bullet marker and word separator";
  readonly descriptionJa =
    "中黒（・）が箇条書きと区切り符号の両方に使われている場合を検出します";
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

    const bulletParas: Array<{ text: string; index: number }> = [];
    const separatorParas: Array<{ text: string; index: number }> = [];

    for (const para of paragraphs) {
      const hasBullet = BULLET_PATTERN.test(para.text);
      const hasSeparator = SEPARATOR_PATTERN.test(para.text);

      if (hasBullet) bulletParas.push(para);
      else if (hasSeparator) separatorParas.push(para);
    }

    // Only flag if both usages exist
    if (bulletParas.length === 0 || separatorParas.length === 0) return [];

    // Flag minority usage
    const minority =
      bulletParas.length <= separatorParas.length ? bulletParas : separatorParas;
    const minorityIsBullet = bulletParas.length <= separatorParas.length;

    const results: Array<{ paragraphIndex: number; issues: LintIssue[] }> = [];

    for (const para of minority) {
      // Find the position of ・ in this paragraph
      const pos = para.text.indexOf("・");
      if (pos === -1) continue;

      results.push({
        paragraphIndex: para.index,
        issues: [
          {
            ruleId: this.id,
            severity: config.severity,
            message: minorityIsBullet
              ? "・ is used as a bullet here, but mostly as a separator elsewhere — unify usage (JTF 2.1.5)"
              : "・ is used as a separator here, but mostly as a bullet elsewhere — unify usage (JTF 2.1.5)",
            messageJa: minorityIsBullet
              ? "JTF 2.1.5に基づき、文書内で中黒（・）が箇条書きと区切り符号に混用されています。用法を統一してください"
              : "JTF 2.1.5に基づき、文書内で中黒（・）が区切り符号と箇条書きに混用されています。用法を統一してください",
            from: pos,
            to: pos + 1,
            reference: JTF_REF,
          },
        ],
      });
    }

    return results;
  }
}
