import { AbstractLintRule } from "../base-rule";
import type { LintIssue, LintRuleConfig, LintReference, CorrectionEngine } from "../types";

/** JTF reference for alphanumeric half-width rule */
const JTF_REF: LintReference = {
  standard: "JTF日本語標準スタイルガイド v3.0",
  section: "2.2.3",
};

/**
 * Convert a full-width ASCII character (U+FF01–U+FF5E) to its
 * half-width equivalent (U+0021–U+007E).
 */
function fullWidthToHalf(ch: string): string {
  const code = ch.codePointAt(0);
  if (code === undefined) return ch;
  if (code >= 0xFF01 && code <= 0xFF5E) {
    return String.fromCodePoint(code - 0xFEE0);
  }
  return ch;
}

/** Matches full-width digits (０–９) */
const FULL_WIDTH_DIGITS = /[\uFF10-\uFF19]/g;
/** Matches full-width uppercase letters (Ａ–Ｚ) */
const FULL_WIDTH_UPPER = /[\uFF21-\uFF3A]/g;
/** Matches full-width lowercase letters (ａ–ｚ) */
const FULL_WIDTH_LOWER = /[\uFF41-\uFF5A]/g;

/**
 * AlphanumericHalfWidthRule -- L1 regex-based rule.
 *
 * Detects full-width digits and Latin letters (Ａ–Ｚ, ａ–ｚ, ０–９)
 * and suggests converting them to their half-width equivalents.
 * Per JTF 2.2.3, Arabic numerals and alphabets should always be
 * written in half-width form in Japanese text.
 */
export class AlphanumericHalfWidthRule extends AbstractLintRule {
  readonly id = "alphanumeric-half-width";
  override engine: CorrectionEngine = "regex";
  readonly name = "Use half-width alphanumeric characters";
  readonly nameJa = "算用数字・アルファベットの半角統一";
  readonly description =
    "Detects full-width digits and alphabets that should be half-width";
  readonly descriptionJa =
    "全角の数字・アルファベットを検出します。半角で記述してください";
  readonly level = "L1" as const;
  readonly defaultConfig: LintRuleConfig = {
    enabled: true,
    severity: "error",
    skipDialogue: true,
  };

  private static readonly PATTERNS: ReadonlyArray<RegExp> = [
    FULL_WIDTH_DIGITS,
    FULL_WIDTH_UPPER,
    FULL_WIDTH_LOWER,
  ];

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled || !text) return [];

    const issues: LintIssue[] = [];

    for (const pattern of AlphanumericHalfWidthRule.PATTERNS) {
      // Clone regex to reset lastIndex
      const re = new RegExp(pattern.source, "g");
      for (const match of text.matchAll(re)) {
        if (match.index === undefined) continue;

        const fullChar = match[0];
        const halfChar = fullWidthToHalf(fullChar);

        issues.push({
          ruleId: this.id,
          severity: config.severity,
          message: `Use half-width "${halfChar}" instead of full-width "${fullChar}" (JTF 2.2.3)`,
          messageJa: `JTF 2.2.3に基づき、全角「${fullChar}」は半角「${halfChar}」で記述してください`,
          from: match.index,
          to: match.index + 1,
          originalText: fullChar,
          reference: JTF_REF,
          fix: {
            label: `Replace with half-width "${halfChar}"`,
            labelJa: `半角「${halfChar}」に変換`,
            replacement: halfChar,
          },
        });
      }
    }

    return issues;
  }
}
