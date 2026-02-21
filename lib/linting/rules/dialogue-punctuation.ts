import { AbstractLintRule } from "../base-rule";
import type { LintIssue, LintRuleConfig, LintReference, Severity } from "../types";

/** JIS X 4051:2004 reference for dialogue bracket rules */
const JIS_REF: LintReference = {
  standard: "JIS X 4051:2004",
};

/**
 * DialoguePunctuationRule -- L1 regex/scan-based dialogue bracket checks.
 *
 * Sub-checks:
 * 1. Nested brackets: inner 「」 inside outer 「」 should use 『』
 * 2. Empty brackets: detect empty 「」 or 『』
 * 3. Unclosed brackets: mismatched open/close counts for 「」 and 『』
 */
export class DialoguePunctuationRule extends AbstractLintRule {
  readonly id = "dialogue-punctuation";
  readonly name = "Dialogue Punctuation";
  readonly nameJa = "台詞の約物チェック";
  readonly description = "Detects formatting errors in dialogue brackets";
  readonly descriptionJa = "台詞のカギ括弧の書式エラーを検出します";
  readonly level = "L1" as const;
  readonly defaultConfig: LintRuleConfig = {
    enabled: true,
    severity: "warning",
  };

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!text) return [];

    const issues: LintIssue[] = [];
    issues.push(
      ...this.checkNestedBrackets(text, config.severity),
      ...this.checkEmptyBrackets(text, config.severity),
      ...this.checkUnclosedBrackets(text, config.severity),
    );
    return issues;
  }

  /**
   * Sub-check 1: Detect nested 「」 that should use 『』.
   *
   * Per JIS X 4051:2004, when quoting within a quoted passage,
   * the inner quotation should use double brackets 『』 rather
   * than single brackets 「」.
   */
  private checkNestedBrackets(
    text: string,
    severity: Severity,
  ): LintIssue[] {
    const issues: LintIssue[] = [];

    // Track bracket depth for single brackets 「」
    // When depth >= 2 and only 「」 are used (not 『』), flag the inner pair
    let depth = 0;
    // Stack of positions where inner 「 appear (depth >= 1 at the time of opening)
    const innerBracketStarts: number[] = [];

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];

      if (ch === "「") {
        if (depth >= 1) {
          // This is a nested 「 — record its position
          innerBracketStarts.push(i);
        }
        depth++;
      } else if (ch === "」") {
        depth--;
        if (depth >= 1 && innerBracketStarts.length > 0) {
          // This closing 」 matches an inner bracket
          const innerStart = innerBracketStarts.pop()!;
          const innerEnd = i;

          // Check that this inner bracket pair does not already use 『』
          // (It uses 「」 since we tracked only 「 and 」 here)
          const innerText = text.substring(innerStart, innerEnd + 1);
          const replacedText = "『" + innerText.slice(1, -1) + "』";

          issues.push({
            ruleId: this.id,
            severity,
            message:
              "Nested dialogue should use double brackets 『』",
            messageJa:
              "JIS X 4051:2004に基づき、カギ括弧内の引用には二重カギ括弧『』を使用してください",
            from: innerStart,
            to: innerEnd + 1,
            reference: JIS_REF,
            fix: {
              label: "Replace with double brackets",
              labelJa: "二重カギ括弧に変換",
              replacement: replacedText,
            },
          });
        }
        // Ensure depth does not go below 0
        if (depth < 0) depth = 0;
      }
    }

    return issues;
  }

  /**
   * Sub-check 2: Detect empty brackets 「」 or 『』.
   *
   * Empty brackets are likely typos or incomplete edits.
   */
  private checkEmptyBrackets(
    text: string,
    severity: Severity,
  ): LintIssue[] {
    const issues: LintIssue[] = [];
    const pattern = /「」|『』/g;

    for (const match of text.matchAll(pattern)) {
      if (match.index === undefined) continue;

      issues.push({
        ruleId: this.id,
        severity,
        message: "Empty brackets detected",
        messageJa:
          "JIS X 4051:2004に基づき、空のカギ括弧が検出されました",
        from: match.index,
        to: match.index + match[0].length,
        reference: JIS_REF,
      });
    }

    return issues;
  }

  /**
   * Sub-check 3: Detect unclosed or unmatched bracket pairs.
   *
   * Counts open and close brackets separately for 「」 and 『』,
   * and flags the entire paragraph if counts do not match.
   */
  private checkUnclosedBrackets(
    text: string,
    severity: Severity,
  ): LintIssue[] {
    const issues: LintIssue[] = [];

    // Check 「」 pair
    let singleOpen = 0;
    let singleClose = 0;
    for (const ch of text) {
      if (ch === "「") singleOpen++;
      if (ch === "」") singleClose++;
    }

    if (singleOpen !== singleClose) {
      issues.push({
        ruleId: this.id,
        severity,
        message: `Unmatched 「」 brackets: ${singleOpen} open, ${singleClose} close`,
        messageJa:
          `JIS X 4051:2004に基づき、カギ括弧「」の数が一致しません（開き${singleOpen}個、閉じ${singleClose}個）`,
        from: 0,
        to: text.length,
        reference: JIS_REF,
      });
    }

    // Check 『』 pair
    let doubleOpen = 0;
    let doubleClose = 0;
    for (const ch of text) {
      if (ch === "『") doubleOpen++;
      if (ch === "』") doubleClose++;
    }

    if (doubleOpen !== doubleClose) {
      issues.push({
        ruleId: this.id,
        severity,
        message: `Unmatched 『』 brackets: ${doubleOpen} open, ${doubleClose} close`,
        messageJa:
          `JIS X 4051:2004に基づき、カギ括弧『』の数が一致しません（開き${doubleOpen}個、閉じ${doubleClose}個）`,
        from: 0,
        to: text.length,
        reference: JIS_REF,
      });
    }

    return issues;
  }
}
