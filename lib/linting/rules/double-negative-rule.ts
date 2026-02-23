import { AbstractLintRule } from "../base-rule";
import type { LintIssue, LintRuleConfig, LintReference, CorrectionEngine } from "../types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const KOYO_REF: LintReference = {
  standard: "公用文作成の考え方（文化審議会、2022）",
};

/**
 * Double negative patterns to detect.
 * These constructions create ambiguity and should be rewritten affirmatively.
 */
const DOUBLE_NEGATIVE_PATTERNS: ReadonlyArray<{
  pattern: RegExp;
  note: string;
}> = [
  {
    pattern: /[なに][いく]ではな[いく]/g,
    note: "二重否定。肯定的な表現に言い換えてください",
  },
  {
    pattern: /ないではない/g,
    note: "二重否定「ないではない」。「ある」などに言い換えてください",
  },
  {
    pattern: /ないことはない/g,
    note: "二重否定「ないことはない」。直接肯定で表現してください",
  },
  {
    pattern: /なくはない/g,
    note: "二重否定「なくはない」。「ある」などに言い換えてください",
  },
  {
    pattern: /ないわけではない/g,
    note: "二重否定「ないわけではない」。「ある」に言い換えてください",
  },
  {
    pattern: /ないとも言えない/g,
    note: "二重否定「ないとも言えない」。直接的な表現を使ってください",
  },
  {
    pattern: /ないとは言えない/g,
    note: "二重否定「ないとは言えない」。直接的な表現を使ってください",
  },
  {
    pattern: /ないとは限らない/g,
    note: "二重否定「ないとは限らない」。直接的な表現を使ってください",
  },
];

// ---------------------------------------------------------------------------
// Rule implementation
// ---------------------------------------------------------------------------

/**
 * Double Negative Rule (L1)
 *
 * Double negatives (二重否定) in Japanese create ambiguity and are prohibited
 * in official writing per 公用文作成の考え方.
 * e.g., 「ないではない」「ないことはない」「なくはない」
 *
 * These constructions should be rephrased as direct affirmatives.
 *
 * Reference: 公用文作成の考え方（文化審議会、2022）
 */
export class DoubleNegativeRule extends AbstractLintRule {
  readonly id = "double-negative";
  override engine: CorrectionEngine = "regex";
  readonly name = "Double Negative";
  readonly nameJa = "二重否定の禁止";
  readonly description = "Double negatives create ambiguity and should be avoided in official writing";
  readonly descriptionJa = "二重否定（ないではない・ないことはない等）は公用文では原則として使いません（公用文作成の考え方）";
  readonly level = "L1" as const;
  readonly defaultConfig: LintRuleConfig = {
    enabled: true,
    severity: "warning",
  };

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!text) return [];
    const issues: LintIssue[] = [];

    for (const { pattern, note } of DOUBLE_NEGATIVE_PATTERNS) {
      // Reset regex state
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = pattern.exec(text)) !== null) {
        const from = match.index;
        const to = from + match[0].length;
        issues.push({
          ruleId: this.id,
          severity: config.severity,
          message: `Double negative detected: "${match[0]}". ${note}`,
          messageJa: `二重否定が検出されました：「${match[0]}」。${note}`,
          from,
          to,
          originalText: match[0],
          reference: KOYO_REF,
        });
      }
    }

    return issues;
  }
}
