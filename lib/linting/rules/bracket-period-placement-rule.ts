import { AbstractLintRule } from "../base-rule";
import type { LintIssue, LintRuleConfig, LintReference, CorrectionEngine } from "../types";

/** Reference for bracket period placement rule */
const KOYO_REF: LintReference = {
  standard: "文化庁「公用文作成の考え方」(2022)",
  section: "3.4",
};

/**
 * Matches a Japanese period (。) immediately followed by a closing bracket.
 * This is the incorrect pattern: the period should come AFTER the bracket.
 *
 * Pattern examples:
 * - 誤: 本文（注記。）  →  正: 本文（注記）。
 * - 誤: 本文（注記。）  →  正: 本文（注記）。
 */
const PERIOD_BEFORE_CLOSE_BRACKET = /。[）〕\]]/g;

/**
 * BracketPeriodPlacementRule -- L1 regex-based rule.
 *
 * Detects cases where a Japanese period (。) appears immediately before
 * a closing bracket. Per 公用文作成の考え方 §3.4, when a sentence ends
 * with a parenthetical annotation, the period should be placed AFTER
 * the closing bracket, not inside it.
 *
 * Correct:   本文（注記）。
 * Incorrect: 本文（注記。）
 */
export class BracketPeriodPlacementRule extends AbstractLintRule {
  readonly id = "bracket-period-placement";
  override engine: CorrectionEngine = "regex";
  readonly name = "Period placement relative to closing bracket";
  readonly nameJa = "文末の注釈括弧と句点の位置関係";
  readonly description =
    "Detects periods inside closing parentheses — period should follow the bracket";
  readonly descriptionJa =
    "括弧の閉じる前に句点がある場合を検出します。句点は括弧の外側に置いてください";
  readonly level = "L1" as const;
  readonly defaultConfig: LintRuleConfig = {
    enabled: true,
    severity: "warning",
    skipDialogue: true,
  };

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled || !text) return [];

    const issues: LintIssue[] = [];

    for (const match of text.matchAll(PERIOD_BEFORE_CLOSE_BRACKET)) {
      if (match.index === undefined) continue;

      const closeBracket = match[0][1];
      // The period is at match.index
      const periodPos = match.index;
      const closeBracketPos = match.index + 1;

      // Suggest: remove period from before bracket, add after bracket
      const corrected = closeBracket + "。";

      issues.push({
        ruleId: this.id,
        severity: config.severity,
        message: `Period before closing bracket "${closeBracket}" — move period after the bracket (公用文作成の考え方 §3.4)`,
        messageJa: `公用文作成の考え方に基づき、句点（。）は括弧「${closeBracket}」の外側に置いてください`,
        from: periodPos,
        to: closeBracketPos + 1,
        originalText: match[0],
        reference: KOYO_REF,
        fix: {
          label: `Move period after bracket: "${corrected}"`,
          labelJa: `「${corrected}」（括弧の外に句点）に修正`,
          replacement: corrected,
        },
      });
    }

    return issues;
  }
}
