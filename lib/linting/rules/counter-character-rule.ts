import { AbstractLintRule } from "../base-rule";
import type { LintIssue, LintRuleConfig, LintReference, CorrectionEngine } from "../types";

/** Reference for counter character rule */
const KOYO_REF: LintReference = {
  standard: "文化庁「公用文作成の考え方」(2022)",
};

/**
 * Patterns for incorrect counter usage.
 * ヵ (U+30F5) and ヶ (U+30F6) used as counters should be か or 箇.
 */
const COUNTER_PATTERNS: ReadonlyArray<{
  pattern: RegExp;
  replacement: string;
  example: string;
}> = [
  {
    pattern: /(\d+|[一二三四五六七八九十百千万]+)[ヵヶケ]所/g,
    replacement: "か所",
    example: "3ヵ所 → 3か所",
  },
  {
    pattern: /(\d+|[一二三四五六七八九十百千万]+)[ヵヶケ]月/g,
    replacement: "か月",
    example: "6ヶ月 → 6か月",
  },
  {
    pattern: /(\d+|[一二三四五六七八九十百千万]+)[ヵヶケ]年/g,
    replacement: "か年",
    example: "3ケ年 → 3か年",
  },
  {
    pattern: /(\d+|[一二三四五六七八九十百千万]+)[ヵヶケ]国/g,
    replacement: "か国",
    example: "5ヶ国 → 5か国",
  },
];

/**
 * CounterCharacterRule -- L1 regex-based rule.
 *
 * Detects incorrect use of ヵ (U+30F5), ヶ (U+30F6), or ケ as
 * counter suffixes. Per 公用文作成の考え方, the counter particle
 * should be written as か (hiragana), not as katakana variants.
 *
 * Examples:
 * - 誤: 3ヵ所  →  正: 3か所
 * - 誤: 6ヶ月  →  正: 6か月
 * - 誤: 3ケ年  →  正: 3か年
 */
export class CounterCharacterRule extends AbstractLintRule {
  readonly id = "counter-character";
  override engine: CorrectionEngine = "regex";
  readonly name = "Use hiragana か for counters";
  readonly nameJa = "助数詞「か」のひらがな表記";
  readonly description =
    "Detects katakana ヵ/ヶ/ケ used as counter particles (should be hiragana か)";
  readonly descriptionJa =
    "助数詞に片仮名「ヵ」「ヶ」「ケ」を使っている場合を検出します。平仮名「か」で表記してください";
  readonly level = "L1" as const;
  readonly defaultConfig: LintRuleConfig = {
    enabled: true,
    severity: "warning",
    skipDialogue: true,
  };

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled || !text) return [];

    const issues: LintIssue[] = [];

    for (const { pattern, replacement, example } of COUNTER_PATTERNS) {
      const re = new RegExp(pattern.source, "g");
      for (const match of text.matchAll(re)) {
        if (match.index === undefined) continue;

        const matchedText = match[0];
        const numPart = match[1]; // captured number/kanji
        const wrongCounter = matchedText.slice(numPart.length, numPart.length + 1);
        const suffix = matchedText.slice(numPart.length + 1);
        const fixedText = numPart + replacement.slice(0, 1) + suffix;

        issues.push({
          ruleId: this.id,
          severity: config.severity,
          message: `Use hiragana か for counter (e.g., ${example}) (公用文作成の考え方)`,
          messageJa: `公用文作成の考え方に基づき、助数詞「${wrongCounter}」はひらがな「か」で表記してください（例：${example}）`,
          from: match.index,
          to: match.index + matchedText.length,
          originalText: matchedText,
          reference: KOYO_REF,
          fix: {
            label: `Replace with "${fixedText}"`,
            labelJa: `「${fixedText}」に変換`,
            replacement: fixedText,
          },
        });
      }
    }

    return issues;
  }
}
