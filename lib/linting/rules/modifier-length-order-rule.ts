import { AbstractLintRule } from "../base-rule";
import type { LintIssue, LintRuleConfig, LintReference, CorrectionEngine } from "../types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const KOYO_REF: LintReference = {
  standard: "公用文作成の考え方（文化審議会、2022）",
};

/**
 * Minimum character length of a pre-noun modifier (before の or 名詞)
 * to be considered "long" and worth flagging.
 */
const LONG_MODIFIER_THRESHOLD = 15;

/**
 * Pattern to detect a long pre-noun modifier followed by の + noun.
 * This matches a sequence of 15+ characters followed by の.
 *
 * Captures: (.{15,}?)の([^\s。、]{1,8})
 * - Group 1: the long modifier
 * - Group 2: the modified noun (short, up to 8 chars)
 */
const LONG_MODIFIER_PATTERN = new RegExp(
  `([^。、\\s]{${LONG_MODIFIER_THRESHOLD},}?)の([^\\s。、]{1,8})`,
  "g",
);

// ---------------------------------------------------------------------------
// Rule implementation
// ---------------------------------------------------------------------------

/**
 * Modifier Length Order Rule (L1 heuristic)
 *
 * In Japanese, long pre-noun modifiers (長い修飾節) that precede the noun
 * can impede readability. 公用文作成の考え方 recommends that:
 * - Long modifiers should be placed before the noun (standard Japanese)
 * - But very long modifier chains (15+ chars before の) may indicate
 *   the sentence should be restructured for clarity
 *
 * This rule flags long pre-noun modifier chains for manual review.
 * The heuristic detects sequences of 15+ non-punctuation characters
 * followed by の + a short noun.
 *
 * Reference: 公用文作成の考え方（文化審議会、2022）
 */
export class ModifierLengthOrderRule extends AbstractLintRule {
  readonly id = "modifier-length-order";
  override engine: CorrectionEngine = "regex";
  readonly name = "Long Modifier Placement";
  readonly nameJa = "長い修飾節の先行配置";
  readonly description = "Long pre-noun modifiers (15+ chars) may indicate a sentence that needs restructuring";
  readonly descriptionJa = "15文字以上の長い修飾節が「の」の前に置かれています。文を分割または再構成することを検討してください（公用文作成の考え方）";
  readonly level = "L1" as const;
  readonly defaultConfig: LintRuleConfig = {
    enabled: true,
    severity: "info",
  };

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!text) return [];
    const issues: LintIssue[] = [];

    LONG_MODIFIER_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = LONG_MODIFIER_PATTERN.exec(text)) !== null) {
      const modifier = match[1];
      const modifiedNoun = match[2];
      const from = match.index;
      const to = from + match[0].length;

      // Skip if the match is too short (re-check threshold)
      if (modifier.length < LONG_MODIFIER_THRESHOLD) continue;

      issues.push({
        ruleId: this.id,
        severity: config.severity,
        message: `Long pre-noun modifier (${modifier.length} chars) before "の${modifiedNoun}". Consider restructuring the sentence.`,
        messageJa: `「の${modifiedNoun}」の前に${modifier.length}文字の長い修飾節があります。文を分割または再構成することを検討してください（公用文作成の考え方）`,
        from,
        to,
        originalText: match[0],
        reference: KOYO_REF,
      });
    }

    return issues;
  }
}
