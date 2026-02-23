import { AbstractLintRule } from "../base-rule";
import type { LintIssue, LintRuleConfig, LintReference, CorrectionEngine } from "../types";

/** Reference for iteration mark rule */
const KOYO_REF: LintReference = {
  standard: "文化庁「公用文作成の考え方」(2022)",
};

/** Hiragana range: ぁ–ん (U+3041–U+3093) */
const HIRAGANA_RANGE = /[\u3041-\u3093]/;
/** Katakana range: ァ–ン (U+30A1–U+30F3) */
const KATAKANA_RANGE = /[\u30A1-\u30F3]/;

/**
 * Matches 々 (U+3005) preceded by hiragana or katakana — invalid usage.
 */
const INVALID_ITERATION_MARK = /[\u3041-\u3093\u30A1-\u30F3]々/g;

/**
 * IterationMarkRule -- L1 regex-based rule.
 *
 * Detects invalid use of the kanji repetition mark 々 (U+3005) when
 * preceded by hiragana or katakana characters. The 々 mark is valid
 * only when repeating a kanji character (e.g., 山々, 人々).
 *
 * Reference: 公用文作成の考え方
 */
export class IterationMarkRule extends AbstractLintRule {
  readonly id = "iteration-mark";
  override engine: CorrectionEngine = "regex";
  readonly name = "Correct use of kanji iteration mark (々)";
  readonly nameJa = "繰り返し符号「々」の制限";
  readonly description =
    "Detects 々 used after hiragana or katakana (invalid usage)";
  readonly descriptionJa =
    "平仮名・片仮名の後に「々」が使われている無効な用法を検出します";
  readonly level = "L1" as const;
  readonly defaultConfig: LintRuleConfig = {
    enabled: true,
    severity: "warning",
    skipDialogue: true,
  };

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled || !text) return [];

    const issues: LintIssue[] = [];

    for (const match of text.matchAll(INVALID_ITERATION_MARK)) {
      if (match.index === undefined) continue;

      const precedingChar = match[0][0];
      const charType = HIRAGANA_RANGE.test(precedingChar) ? "平仮名" : "片仮名";

      // Position of 々 is one character after the preceding char
      const iterPos = match.index + 1;

      issues.push({
        ruleId: this.id,
        severity: config.severity,
        message: `"々" should only follow kanji characters, not ${charType === "平仮名" ? "hiragana" : "katakana"} (公用文作成の考え方)`,
        messageJa: `公用文作成の考え方に基づき、繰り返し符号「々」は漢字の後にのみ使用できます。${charType}「${precedingChar}」の後には使用しないでください`,
        from: iterPos,
        to: iterPos + 1,
        originalText: "々",
        reference: KOYO_REF,
      });
    }

    return issues;
  }
}
