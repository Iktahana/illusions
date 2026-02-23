import { AbstractLintRule } from "../base-rule";
import type { LintIssue, LintRuleConfig, LintReference, CorrectionEngine } from "../types";

/** Reference for large number comma rule */
const KOYO_REF: LintReference = {
  standard: "文化庁「公用文作成の考え方」(2022)",
};

/**
 * Matches 4 or more consecutive ASCII digits not already separated by commas.
 * We use a word boundary approach: digits must not be immediately preceded
 * by a comma or digit (to avoid matching already-formatted numbers).
 */
const LARGE_NUMBER_PATTERN = /(?<![,\d])\d{4,}(?![,\d])/g;

/**
 * Format a number string by inserting commas every 3 digits from the right.
 */
function formatWithCommas(numStr: string): string {
  return numStr.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * LargeNumberCommaRule -- L1 regex-based rule.
 *
 * Detects sequences of 4 or more consecutive digits that lack comma
 * separators (e.g., 10000 should be 10,000). Per 公用文作成の考え方,
 * large numbers should use comma separators for readability.
 */
export class LargeNumberCommaRule extends AbstractLintRule {
  readonly id = "large-number-comma";
  override engine: CorrectionEngine = "regex";
  readonly name = "Use commas in large numbers";
  readonly nameJa = "大きな数字の桁区切り";
  readonly description =
    "Detects numbers with 4+ digits that lack comma thousand-separators";
  readonly descriptionJa =
    "4桁以上の数字に桁区切りのカンマがない場合を検出します";
  readonly level = "L1" as const;
  readonly defaultConfig: LintRuleConfig = {
    enabled: true,
    severity: "warning",
    skipDialogue: true,
  };

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled || !text) return [];

    const issues: LintIssue[] = [];

    for (const match of text.matchAll(LARGE_NUMBER_PATTERN)) {
      if (match.index === undefined) continue;

      const numStr = match[0];
      const formatted = formatWithCommas(numStr);

      // Skip if formatting produces no change (already has commas — shouldn't happen
      // given the pattern, but as a safety check)
      if (formatted === numStr) continue;

      issues.push({
        ruleId: this.id,
        severity: config.severity,
        message: `Large number "${numStr}" should use comma separators: "${formatted}" (公用文作成の考え方)`,
        messageJa: `公用文作成の考え方に基づき、大きな数字「${numStr}」には桁区切りのカンマを入れてください（例：${formatted}）`,
        from: match.index,
        to: match.index + numStr.length,
        originalText: numStr,
        reference: KOYO_REF,
        fix: {
          label: `Add comma separators: "${formatted}"`,
          labelJa: `「${formatted}」に変換`,
          replacement: formatted,
        },
      });
    }

    return issues;
  }
}
