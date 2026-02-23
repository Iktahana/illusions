import { AbstractLintRule } from "../base-rule";
import type { LintIssue, LintRuleConfig, LintReference, CorrectionEngine } from "../types";

/** JTF reference for heading period rule */
const JTF_REF: LintReference = {
  standard: "JTF日本語標準スタイルガイド v3.0",
  section: "2.1.2",
};

/** Maximum character length to consider a text as a potential heading */
const MAX_HEADING_LENGTH = 20;

/**
 * HeadingPeriodRule -- L1 regex-based rule.
 *
 * Detects short text lines (≤ 20 characters) that end with a Japanese
 * period (。). Per JTF 2.1.2, headings should not end with a period.
 *
 * A "heading" is heuristically identified as a short text segment
 * (≤ 20 characters) that ends with 。.
 */
export class HeadingPeriodRule extends AbstractLintRule {
  readonly id = "heading-period";
  override engine: CorrectionEngine = "regex";
  readonly name = "No period at end of heading";
  readonly nameJa = "見出し末尾の句点禁止";
  readonly description =
    "Detects short headings that incorrectly end with a Japanese period (。)";
  readonly descriptionJa =
    "句点（。）で終わっている短い見出しを検出します";
  readonly level = "L1" as const;
  readonly defaultConfig: LintRuleConfig = {
    enabled: true,
    severity: "warning",
    skipDialogue: true,
  };

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled || !text) return [];

    // Only consider short texts as potential headings
    const trimmed = text.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_HEADING_LENGTH) return [];

    // Must end with 。
    if (!trimmed.endsWith("。")) return [];

    // Ignore texts that look like full sentences (contain sentence-internal periods)
    const internalPeriods = (trimmed.slice(0, -1).match(/。/g) ?? []).length;
    if (internalPeriods > 0) return [];

    const periodPos = text.lastIndexOf("。");
    if (periodPos === -1) return [];

    return [
      {
        ruleId: this.id,
        severity: config.severity,
        message: "Headings should not end with a period (JTF 2.1.2)",
        messageJa: "JTF 2.1.2に基づき、見出しの末尾に句点（。）は使用しないでください",
        from: periodPos,
        to: periodPos + 1,
        originalText: "。",
        reference: JTF_REF,
        fix: {
          label: "Remove trailing period",
          labelJa: "末尾の句点を削除",
          replacement: "",
        },
      },
    ];
  }
}
