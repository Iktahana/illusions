import { AbstractLintRule } from "../base-rule";
import type { LintIssue, LintRuleConfig, LintReference, CorrectionEngine } from "../types";

/** JTF reference for Japanese punctuation width rule */
const JTF_REF: LintReference = {
  standard: "JTF日本語標準スタイルガイド v3.0",
  section: "2.1.1",
};

/** CJK / full-width character range (used for context detection) */
const CJK_RANGE = /[\u3000-\u9FFF\uFF00-\uFFEF]/;

/**
 * Map from half-width punctuation to full-width equivalents
 * for use in Japanese text context.
 */
const HALF_TO_FULL_PUNCT: ReadonlyMap<string, string> = new Map([
  ["!", "！"],
  ["?", "？"],
]);

/**
 * JapanesePunctuationWidthRule -- L1 regex-based rule.
 *
 * Detects half-width exclamation marks (!) and question marks (?)
 * when they appear directly adjacent to Japanese (CJK) characters.
 * Per JTF 2.1.1, punctuation in Japanese text should use full-width
 * characters (！, ？).
 */
export class JapanesePunctuationWidthRule extends AbstractLintRule {
  readonly id = "japanese-punctuation-width";
  override engine: CorrectionEngine = "regex";
  readonly name = "Use full-width punctuation in Japanese text";
  readonly nameJa = "和文中の句読点・記号の全角統一";
  readonly description =
    "Detects half-width ! and ? adjacent to Japanese characters";
  readonly descriptionJa =
    "日本語文字に隣接する半角の感嘆符・疑問符を検出します";
  readonly level = "L1" as const;
  readonly defaultConfig: LintRuleConfig = {
    enabled: true,
    severity: "error",
    skipDialogue: true,
  };

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled || !text) return [];

    const issues: LintIssue[] = [];

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const fullWidth = HALF_TO_FULL_PUNCT.get(ch);
      if (fullWidth === undefined) continue;

      // Check if preceded or followed by a CJK character
      const prevChar = i > 0 ? text[i - 1] : "";
      const nextChar = i < text.length - 1 ? text[i + 1] : "";
      const adjacentToJapanese =
        CJK_RANGE.test(prevChar) || CJK_RANGE.test(nextChar);

      if (!adjacentToJapanese) continue;

      issues.push({
        ruleId: this.id,
        severity: config.severity,
        message: `Use full-width "${fullWidth}" instead of half-width "${ch}" in Japanese text (JTF 2.1.1)`,
        messageJa: `JTF 2.1.1に基づき、日本語文中では半角「${ch}」ではなく全角「${fullWidth}」を使用してください`,
        from: i,
        to: i + 1,
        originalText: ch,
        reference: JTF_REF,
        fix: {
          label: `Replace with full-width "${fullWidth}"`,
          labelJa: `全角「${fullWidth}」に変換`,
          replacement: fullWidth,
        },
      });
    }

    return issues;
  }
}
