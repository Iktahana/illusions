import { AbstractLintRule } from "../base-rule";
import type { LintIssue, LintRuleConfig, LintReference, CorrectionEngine } from "../types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const KOYO_REF: LintReference = {
  standard: "公用文作成の考え方（文化審議会、2022）",
};

/**
 * Invalid conjugation forms of サ変動詞 (suru-verbs) + 「べき」.
 *
 * Standard forms: 「すべき」or「するべき」
 * Invalid forms: conjugations other than 連体形 (する) before べき
 *
 * Detect: [しさせ]べき — these are incorrect conjugations.
 */
const SURU_BEKI_INVALID_PATTERNS: ReadonlyArray<{
  pattern: RegExp;
  wrong: string;
  correct: string;
}> = [
  {
    pattern: /しべき/g,
    wrong: "しべき",
    correct: "するべき（すべき）",
  },
  {
    pattern: /させべき/g,
    wrong: "させべき",
    correct: "するべき（すべき）",
  },
  {
    // Incorrect polite form + べき
    pattern: /しますべき/g,
    wrong: "しますべき",
    correct: "するべき",
  },
  {
    // Negative form + べき (occasional hypercorrection)
    pattern: /せざるべき/g,
    wrong: "せざるべき",
    correct: "すべきでない",
  },
];

// ---------------------------------------------------------------------------
// Rule implementation
// ---------------------------------------------------------------------------

/**
 * Suru-beki Conjugation Rule (L1)
 *
 * サ変動詞 (suru-verbs) combined with 「べき」must use the 連体形 (する),
 * yielding either 「すべき」or 「するべき」.
 * Invalid forms like 「しべき」(using 連用形) are grammatical errors.
 *
 * Reference: 公用文作成の考え方（文化審議会、2022）
 */
export class SuruBekiConjugationRule extends AbstractLintRule {
  readonly id = "suru-beki-conjugation";
  override engine: CorrectionEngine = "regex";
  readonly name = "Suru-verb + べき Conjugation";
  readonly nameJa = "サ変動詞＋「べき」の活用統一";
  readonly description = "サ変動詞 before べき must use 連体形: すべき or するべき";
  readonly descriptionJa = "サ変動詞＋「べき」は「すべき」または「するべき」が正しい活用です（公用文作成の考え方）";
  readonly level = "L1" as const;
  readonly defaultConfig: LintRuleConfig = {
    enabled: true,
    severity: "error",
  };

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!text) return [];
    const issues: LintIssue[] = [];

    for (const { pattern, wrong, correct } of SURU_BEKI_INVALID_PATTERNS) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = pattern.exec(text)) !== null) {
        const from = match.index;
        const to = from + match[0].length;
        issues.push({
          ruleId: this.id,
          severity: config.severity,
          message: `"${wrong}" is an incorrect conjugation. Use "${correct}" instead`,
          messageJa: `「${wrong}」は誤った活用形です。「${correct}」を使ってください（公用文作成の考え方）`,
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
