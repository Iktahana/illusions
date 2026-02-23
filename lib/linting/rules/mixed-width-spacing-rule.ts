import { AbstractLintRule } from "../base-rule";
import type { LintIssue, LintRuleConfig, LintReference, CorrectionEngine } from "../types";

/** JTF reference for mixed-width spacing rule */
const JTF_REF: LintReference = {
  standard: "JTF日本語標準スタイルガイド v3.0",
  section: "2.1.6",
};

/**
 * MixedWidthSpacingRule -- L1 regex-based rule.
 *
 * Detects half-width spaces inserted between Japanese (CJK) characters
 * and ASCII/Latin characters. Per JTF 2.1.6, no space should be placed
 * between Japanese text and ASCII text.
 */
export class MixedWidthSpacingRule extends AbstractLintRule {
  readonly id = "mixed-width-spacing";
  override engine: CorrectionEngine = "regex";
  readonly name = "No space between Japanese and ASCII";
  readonly nameJa = "和欧文字間のスペース禁止";
  readonly description =
    "Detects half-width spaces between Japanese characters and ASCII characters";
  readonly descriptionJa =
    "日本語文字とASCII文字の間にある半角スペースを検出します";
  readonly level = "L1" as const;
  readonly defaultConfig: LintRuleConfig = {
    enabled: true,
    severity: "error",
    skipDialogue: true,
  };

  /** Regex: CJK/full-width char followed by space then ASCII, or vice versa */
  private static readonly CJK_TO_ASCII = /[\u3000-\u9FFF\uFF00-\uFFEF] [\u0021-\u007E]/g;
  private static readonly ASCII_TO_CJK = /[\u0021-\u007E] [\u3000-\u9FFF\uFF00-\uFFEF]/g;

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled || !text) return [];

    const issues: LintIssue[] = [];

    // CJK + space + ASCII
    for (const match of text.matchAll(MixedWidthSpacingRule.CJK_TO_ASCII)) {
      if (match.index === undefined) continue;
      const spacePos = match.index + 1;
      issues.push({
        ruleId: this.id,
        severity: config.severity,
        message: "Do not insert a space between Japanese and ASCII characters (JTF 2.1.6)",
        messageJa: "JTF 2.1.6に基づき、和文とASCII文字の間にスペースを入れないでください",
        from: spacePos,
        to: spacePos + 1,
        originalText: " ",
        reference: JTF_REF,
        fix: {
          label: "Remove space",
          labelJa: "スペースを削除",
          replacement: "",
        },
      });
    }

    // ASCII + space + CJK
    for (const match of text.matchAll(MixedWidthSpacingRule.ASCII_TO_CJK)) {
      if (match.index === undefined) continue;
      const spacePos = match.index + 1;
      // Avoid duplicate if already flagged by the previous pattern
      const alreadyFlagged = issues.some((i) => i.from === spacePos);
      if (!alreadyFlagged) {
        issues.push({
          ruleId: this.id,
          severity: config.severity,
          message: "Do not insert a space between ASCII and Japanese characters (JTF 2.1.6)",
          messageJa: "JTF 2.1.6に基づき、ASCII文字と和文の間にスペースを入れないでください",
          from: spacePos,
          to: spacePos + 1,
          originalText: " ",
          reference: JTF_REF,
          fix: {
            label: "Remove space",
            labelJa: "スペースを削除",
            replacement: "",
          },
        });
      }
    }

    return issues;
  }
}
