import { AbstractLintRule } from "../base-rule";
import type { LintIssue, LintRuleConfig, LintReference, Severity } from "../types";

/** JIS X 4051:2004 reference for punctuation rules */
const JIS_REF: LintReference = {
  standard: "JIS X 4051:2004",
};

/** Cultural Affairs Agency reference for writing guidelines */
const BUNKACHO_REF: LintReference = {
  standard: '文化庁「公用文作成の考え方」(2022)',
};

/**
 * Bracket pair definition for pairing checks.
 */
interface BracketPair {
  open: string;
  close: string;
  nameJa: string;
}

/** Bracket pairs to check for matching */
const BRACKET_PAIRS: readonly BracketPair[] = [
  { open: "「", close: "」", nameJa: "カギカッコ" },
  { open: "『", close: "』", nameJa: "二重カギカッコ" },
  { open: "（", close: "）", nameJa: "丸カッコ" },
  { open: "【", close: "】", nameJa: "隅付きカッコ" },
] as const;

/**
 * Width variant definition for consistency checks.
 */
interface WidthVariant {
  fullWidth: string;
  halfWidth: string;
  nameJa: string;
  nameEn: string;
}

/** Width variants to check for consistency */
const WIDTH_VARIANTS: readonly WidthVariant[] = [
  {
    fullWidth: "！",
    halfWidth: "!",
    nameJa: "感嘆符",
    nameEn: "exclamation mark",
  },
  {
    fullWidth: "？",
    halfWidth: "?",
    nameJa: "疑問符",
    nameEn: "question mark",
  },
] as const;

/**
 * PunctuationRule — L1 regex-based punctuation convention checks.
 *
 * Sub-checks:
 * 1. Bracket-internal period: 「...。」 → 「...」
 * 2. Ellipsis format: single … → ……, ・・・ → ……
 * 3. Bracket pairing: matching open/close counts
 * 4. Full-width/half-width consistency: ！/! and ？/? mixing
 */
export class PunctuationRule extends AbstractLintRule {
  readonly id = "punctuation-rules";
  readonly name = "Punctuation conventions";
  readonly nameJa = "記号の作法";
  readonly description =
    "Check Japanese punctuation usage following JIS X 4051 and editorial conventions";
  readonly descriptionJa =
    "JIS X 4051・文化庁基準に基づく句読点・記号チェック";
  readonly level = "L1" as const;
  readonly defaultConfig: LintRuleConfig = {
    enabled: true,
    severity: "warning",
  };

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!text) return [];

    const issues: LintIssue[] = [];
    issues.push(...this.checkBracketPeriod(text, config.severity));
    issues.push(...this.checkEllipsis(text, config.severity));
    issues.push(...this.checkBracketPairing(text, config.severity));
    issues.push(...this.checkWidthConsistency(text, config.severity));
    return issues;
  }

  /**
   * Sub-check 1: Detect sentence-ending period inside bracket 「...。」
   *
   * Per 文化庁「公用文作成の考え方」(2022), the period before a closing
   * bracket should be omitted.
   */
  private checkBracketPeriod(
    text: string,
    severity: Severity,
  ): LintIssue[] {
    const issues: LintIssue[] = [];
    // Match 。」 sequences
    const pattern = /。」/g;

    for (const match of text.matchAll(pattern)) {
      if (match.index === undefined) continue;

      // Position of the 。 character
      const periodPos = match.index;

      issues.push({
        ruleId: this.id,
        severity,
        message:
          "Period before closing bracket should be omitted",
        messageJa:
          "「文化庁「公用文作成の考え方」に基づき、カギカッコ内の文末に句点は不要です」",
        from: periodPos,
        to: periodPos + 1,
        reference: BUNKACHO_REF,
        fix: {
          label: "Remove period before closing bracket",
          labelJa: "閉じカッコ前の句点を削除",
          replacement: "",
        },
      });
    }

    return issues;
  }

  /**
   * Sub-check 2: Detect incorrect ellipsis usage.
   *
   * Per JIS X 4051:2004, ellipsis should be used in pairs (……).
   * - Single … should be doubled to ……
   * - Three middle dots ・・・ should be replaced with ……
   */
  private checkEllipsis(text: string, severity: Severity): LintIssue[] {
    const issues: LintIssue[] = [];

    // Pattern 1: Single … not adjacent to another …
    const singleEllipsis = /(?<![…])…(?![…])/g;
    for (const match of text.matchAll(singleEllipsis)) {
      if (match.index === undefined) continue;

      issues.push({
        ruleId: this.id,
        severity,
        message:
          "Ellipsis should be used in pairs (JIS X 4051:2004)",
        messageJa:
          "「JIS X 4051:2004に基づき、三点リーダーは偶数個（……）で使用してください」",
        from: match.index,
        to: match.index + 1,
        reference: JIS_REF,
        fix: {
          label: "Replace with paired ellipsis",
          labelJa: "二重三点リーダーに置換",
          replacement: "……",
        },
      });
    }

    // Pattern 2: Three or more middle dots ・・・
    const middleDots = /・{3,}/g;
    for (const match of text.matchAll(middleDots)) {
      if (match.index === undefined) continue;

      issues.push({
        ruleId: this.id,
        severity,
        message:
          "Use ellipsis character instead of middle dots (JIS X 4051:2004)",
        messageJa:
          "「JIS X 4051:2004に基づき、中点の連続ではなく三点リーダー（……）を使用してください」",
        from: match.index,
        to: match.index + match[0].length,
        reference: JIS_REF,
        fix: {
          label: "Replace with paired ellipsis",
          labelJa: "三点リーダーに置換",
          replacement: "……",
        },
      });
    }

    return issues;
  }

  /**
   * Sub-check 3: Detect mismatched bracket pairs.
   *
   * Counts open and close brackets for each pair type and reports
   * mismatches. No auto-fix is provided since the correct fix is ambiguous.
   */
  private checkBracketPairing(
    text: string,
    severity: Severity,
  ): LintIssue[] {
    const issues: LintIssue[] = [];

    for (const pair of BRACKET_PAIRS) {
      let openCount = 0;
      let closeCount = 0;

      for (const ch of text) {
        if (ch === pair.open) openCount++;
        if (ch === pair.close) closeCount++;
      }

      if (openCount !== closeCount) {
        issues.push({
          ruleId: this.id,
          severity,
          message: `Mismatched ${pair.nameJa}: ${openCount} open, ${closeCount} close`,
          messageJa:
            `「JIS X 4051:2004に基づき、${pair.nameJa}の対応が不正です（開き${openCount}個、閉じ${closeCount}個）」`,
          from: 0,
          to: text.length,
          reference: JIS_REF,
        });
      }
    }

    return issues;
  }

  /**
   * Sub-check 4: Detect mixed full-width/half-width punctuation.
   *
   * Per JIS X 4051:2004, full-width punctuation should be used in
   * Japanese text. When both full-width and half-width variants appear,
   * the half-width ones are flagged.
   */
  private checkWidthConsistency(
    text: string,
    severity: Severity,
  ): LintIssue[] {
    const issues: LintIssue[] = [];

    for (const variant of WIDTH_VARIANTS) {
      const hasFullWidth = text.includes(variant.fullWidth);
      const hasHalfWidth = text.includes(variant.halfWidth);

      // Only flag if BOTH variants exist (mixed usage)
      if (!hasFullWidth || !hasHalfWidth) {
        continue;
      }

      // Flag all half-width occurrences and suggest full-width
      for (let i = 0; i < text.length; i++) {
        if (text[i] === variant.halfWidth) {
          issues.push({
            ruleId: this.id,
            severity,
            message:
              `${variant.nameEn} should be full-width for consistency`,
            messageJa:
              `「JIS X 4051:2004に基づき、${variant.nameJa}は全角（${variant.fullWidth}）に統一してください」`,
            from: i,
            to: i + 1,
            reference: JIS_REF,
            fix: {
              label: `Convert to full-width`,
              labelJa: `全角に変換`,
              replacement: variant.fullWidth,
            },
          });
        }
      }
    }

    return issues;
  }
}
