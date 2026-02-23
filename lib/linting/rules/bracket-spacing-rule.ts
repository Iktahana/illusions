import { AbstractLintRule } from "../base-rule";
import type { LintIssue, LintRuleConfig, LintReference, CorrectionEngine } from "../types";

/** JTF reference for bracket spacing rule */
const JTF_REF: LintReference = {
  standard: "JTF日本語標準スタイルガイド v3.0",
  section: "2.1.7",
};

/**
 * BracketSpacingRule -- L1 regex-based rule.
 *
 * Detects half-width spaces immediately inside or outside of
 * Japanese bracket characters. Per JTF 2.1.7, no space should
 * be placed adjacent to bracket characters.
 *
 * Examples:
 * - 誤: （ テキスト ）  →  正: （テキスト）
 * - 誤: 「 テキスト 」  →  正: 「テキスト」
 */
export class BracketSpacingRule extends AbstractLintRule {
  readonly id = "bracket-spacing";
  override engine: CorrectionEngine = "regex";
  readonly name = "No space inside brackets";
  readonly nameJa = "括弧類と隣接する文字間のスペース禁止";
  readonly description =
    "Detects spaces immediately inside Japanese bracket characters";
  readonly descriptionJa =
    "日本語括弧類の直内側にあるスペースを検出します";
  readonly level = "L1" as const;
  readonly defaultConfig: LintRuleConfig = {
    enabled: true,
    severity: "error",
    skipDialogue: true,
  };

  /** Opening brackets — space after opening bracket is wrong */
  private static readonly OPEN_BRACKETS = /[（「『【〔〈《【〘〚]\s/g;
  /** Closing brackets — space before closing bracket is wrong */
  private static readonly CLOSE_BRACKETS = /\s[）」』】〕〉》】〙〛]/g;

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled || !text) return [];

    const issues: LintIssue[] = [];

    // Space after opening bracket
    for (const match of text.matchAll(BracketSpacingRule.OPEN_BRACKETS)) {
      if (match.index === undefined) continue;
      const spacePos = match.index + 1;
      const bracket = match[0][0];
      issues.push({
        ruleId: this.id,
        severity: config.severity,
        message: `Remove space after opening bracket "${bracket}" (JTF 2.1.7)`,
        messageJa: `JTF 2.1.7に基づき、括弧「${bracket}」の直後にスペースを入れないでください`,
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

    // Space before closing bracket
    for (const match of text.matchAll(BracketSpacingRule.CLOSE_BRACKETS)) {
      if (match.index === undefined) continue;
      const spacePos = match.index;
      const bracket = match[0][1];
      const alreadyFlagged = issues.some((i) => i.from === spacePos);
      if (!alreadyFlagged) {
        issues.push({
          ruleId: this.id,
          severity: config.severity,
          message: `Remove space before closing bracket "${bracket}" (JTF 2.1.7)`,
          messageJa: `JTF 2.1.7に基づき、括弧「${bracket}」の直前にスペースを入れないでください`,
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
