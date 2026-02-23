import { AbstractLintRule } from "../base-rule";
import type { LintIssue, LintRuleConfig, LintReference, CorrectionEngine } from "../types";

/** JTF reference for katakana width rule */
const JTF_REF: LintReference = {
  standard: "JTF日本語標準スタイルガイド v3.0",
  section: "2.2.1",
};

/**
 * Mapping from half-width katakana (U+FF66–U+FF9F) to full-width katakana.
 */
const HALF_TO_FULL: ReadonlyMap<string, string> = new Map([
  ["ｦ", "ヲ"], ["ｧ", "ァ"], ["ｨ", "ィ"], ["ｩ", "ゥ"], ["ｪ", "ェ"],
  ["ｫ", "ォ"], ["ｬ", "ャ"], ["ｭ", "ュ"], ["ｮ", "ョ"], ["ｯ", "ッ"],
  ["ｰ", "ー"], ["ｱ", "ア"], ["ｲ", "イ"], ["ｳ", "ウ"], ["ｴ", "エ"],
  ["ｵ", "オ"], ["ｶ", "カ"], ["ｷ", "キ"], ["ｸ", "ク"], ["ｹ", "ケ"],
  ["ｺ", "コ"], ["ｻ", "サ"], ["ｼ", "シ"], ["ｽ", "ス"], ["ｾ", "セ"],
  ["ｿ", "ソ"], ["ﾀ", "タ"], ["ﾁ", "チ"], ["ﾂ", "ツ"], ["ﾃ", "テ"],
  ["ﾄ", "ト"], ["ﾅ", "ナ"], ["ﾆ", "ニ"], ["ﾇ", "ヌ"], ["ﾈ", "ネ"],
  ["ﾉ", "ノ"], ["ﾊ", "ハ"], ["ﾋ", "ヒ"], ["ﾌ", "フ"], ["ﾍ", "ヘ"],
  ["ﾎ", "ホ"], ["ﾏ", "マ"], ["ﾐ", "ミ"], ["ﾑ", "ム"], ["ﾒ", "メ"],
  ["ﾓ", "モ"], ["ﾔ", "ヤ"], ["ﾕ", "ユ"], ["ﾖ", "ヨ"], ["ﾗ", "ラ"],
  ["ﾘ", "リ"], ["ﾙ", "ル"], ["ﾚ", "レ"], ["ﾛ", "ロ"], ["ﾜ", "ワ"],
  ["ﾝ", "ン"], ["ﾞ", "゛"], ["ﾟ", "゜"],
]);

/** Matches any single half-width katakana character */
const HALF_KANA_PATTERN = /[\uFF66-\uFF9F]/g;

/**
 * KatakanaWidthRule -- L1 regex-based rule.
 *
 * Detects half-width katakana characters (U+FF66–U+FF9F) and suggests
 * converting them to their full-width equivalents. Per JTF 2.2.1,
 * katakana characters should always be written in full-width form.
 */
export class KatakanaWidthRule extends AbstractLintRule {
  readonly id = "katakana-width";
  override engine: CorrectionEngine = "regex";
  readonly name = "Use full-width katakana";
  readonly nameJa = "カタカナの全角統一";
  readonly description =
    "Detects half-width katakana characters that should be full-width";
  readonly descriptionJa =
    "半角カタカナを検出します。カタカナは全角で記述してください";
  readonly level = "L1" as const;
  readonly defaultConfig: LintRuleConfig = {
    enabled: true,
    severity: "error",
    skipDialogue: true,
  };

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled || !text) return [];

    const issues: LintIssue[] = [];

    for (const match of text.matchAll(HALF_KANA_PATTERN)) {
      if (match.index === undefined) continue;

      const halfChar = match[0];
      const fullChar = HALF_TO_FULL.get(halfChar);

      issues.push({
        ruleId: this.id,
        severity: config.severity,
        message: `Half-width katakana "${halfChar}" should be full-width (JTF 2.2.1)`,
        messageJa: `JTF 2.2.1に基づき、半角カタカナ「${halfChar}」は全角で記述してください`,
        from: match.index,
        to: match.index + 1,
        originalText: halfChar,
        reference: JTF_REF,
        ...(fullChar !== undefined
          ? {
              fix: {
                label: `Replace with full-width "${fullChar}"`,
                labelJa: `全角「${fullChar}」に変換`,
                replacement: fullChar,
              },
            }
          : {}),
      });
    }

    return issues;
  }
}
