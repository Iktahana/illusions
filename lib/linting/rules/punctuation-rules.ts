import { AbstractLintRule } from "../base-rule";
import type { LintIssue, LintRuleConfig, LintReference, Severity , CorrectionEngine} from "../types";

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
 * PunctuationRule -- L1 regex-based punctuation convention checks.
 *
 * Sub-checks:
 * 1. Bracket-internal period: detect period before closing bracket
 * 2. Ellipsis format: single ellipsis or middle dots should be paired ellipsis
 * 3. Bracket pairing: matching open/close counts
 * 4. Full-width/half-width consistency: mixed usage of width variants
 */
export class PunctuationRule extends AbstractLintRule {
  readonly id = "punctuation-rules";
  override engine: CorrectionEngine = "regex";
  readonly name = "Punctuation conventions";
  readonly nameJa = "記号の作法";
  readonly description =
    "Check Japanese punctuation usage (brackets, ellipsis, width consistency)";
  readonly descriptionJa = "句読点・括弧・三点リーダーの用法チェック";
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
   * Sub-check 1: Detect sentence-ending period inside closing bracket.
   *
   * Per JIS X 4051:2004, the period before a closing bracket is
   * generally omitted in Japanese text.
   */
  private checkBracketPeriod(
    text: string,
    severity: Severity,
  ): LintIssue[] {
    const issues: LintIssue[] = [];
    const pattern = /。」/g;

    for (const match of text.matchAll(pattern)) {
      if (match.index === undefined) continue;

      // Position of the 。 character
      const periodPos = match.index;

      issues.push({
        ruleId: this.id,
        severity,
        message:
          "Period before closing bracket should be omitted (JIS X 4051:2004)",
        messageJa:
          "「JIS X 4051:2004に基づき、カギカッコ内末尾の句点は省略が一般的です」",
        from: periodPos,
        to: periodPos + 2,
        reference: JIS_REF,
        fix: {
          label: "Remove period before closing bracket",
          labelJa: "閉じカッコ前の句点を削除",
          replacement: "」",
        },
      });
    }

    return issues;
  }

  /**
   * Sub-check 2: Detect incorrect ellipsis usage.
   *
   * Per JIS X 4051:2004, ellipsis should be used in even numbers (paired).
   * - Single ... (U+2026) should be doubled to ......
   * - Middle dots used as ellipsis should be replaced with ......
   */
  private checkEllipsis(text: string, severity: Severity): LintIssue[] {
    const issues: LintIssue[] = [];

    // Pattern 1: Single ellipsis not adjacent to another ellipsis
    const singleEllipsis = /(?<![…])…(?![…])/g;
    for (const match of text.matchAll(singleEllipsis)) {
      if (match.index === undefined) continue;

      issues.push({
        ruleId: this.id,
        severity,
        message:
          "Ellipsis should be used in pairs (JIS X 4051:2004)",
        messageJa:
          "「JIS X 4051:2004に基づき、三点リーダーは偶数個（……）の使用が標準です」",
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

    // Pattern 2: Two or more middle dots used as ellipsis
    const middleDots = /・{2,}/g;
    for (const match of text.matchAll(middleDots)) {
      if (match.index === undefined) continue;

      issues.push({
        ruleId: this.id,
        severity,
        message:
          "Use ellipsis character instead of middle dots (JIS X 4051:2004)",
        messageJa:
          "「JIS X 4051:2004に基づき、三点リーダーは偶数個（……）の使用が標準です」",
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
   * mismatches with surplus information. No auto-fix is provided
   * since the correct fix is context-dependent.
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
        const surplusType = openCount > closeCount ? "開き括弧" : "閉じ括弧";
        const surplusCount = Math.abs(openCount - closeCount);

        issues.push({
          ruleId: this.id,
          severity,
          message: `Mismatched ${pair.nameJa}: ${surplusCount} surplus ${openCount > closeCount ? "opening" : "closing"} bracket(s)`,
          messageJa:
            `「JIS X 4051:2004に基づき、括弧の対応が不正です（${surplusType}が${surplusCount}個余剰）」`,
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
   * When both full-width and half-width variants of the same punctuation
   * appear, the minority variant (whichever appears less) is flagged
   * with a suggestion to convert to the majority variant.
   */
  private checkWidthConsistency(
    text: string,
    severity: Severity,
  ): LintIssue[] {
    const issues: LintIssue[] = [];

    for (const variant of WIDTH_VARIANTS) {
      // Count occurrences of each variant
      let fullWidthCount = 0;
      let halfWidthCount = 0;

      for (const ch of text) {
        if (ch === variant.fullWidth) fullWidthCount++;
        if (ch === variant.halfWidth) halfWidthCount++;
      }

      // Only flag if BOTH variants exist (mixed usage)
      if (fullWidthCount === 0 || halfWidthCount === 0) {
        continue;
      }

      // Determine which is the minority variant
      const minorityIsHalfWidth = halfWidthCount <= fullWidthCount;
      const minorityChar = minorityIsHalfWidth
        ? variant.halfWidth
        : variant.fullWidth;
      const majorityChar = minorityIsHalfWidth
        ? variant.fullWidth
        : variant.halfWidth;
      const conversionLabelJa = minorityIsHalfWidth
        ? "全角に変換"
        : "半角に変換";
      const conversionLabel = minorityIsHalfWidth
        ? "Convert to full-width"
        : "Convert to half-width";

      // Flag all minority variant occurrences
      for (let i = 0; i < text.length; i++) {
        if (text[i] === minorityChar) {
          issues.push({
            ruleId: this.id,
            severity,
            message: `Mixed ${variant.nameEn} width: convert to ${minorityIsHalfWidth ? "full" : "half"}-width for consistency`,
            messageJa:
              `「文化庁「公用文作成の考え方」に基づき、${variant.nameJa}の全角・半角が混在しています」`,
            from: i,
            to: i + 1,
            reference: BUNKACHO_REF,
            fix: {
              label: conversionLabel,
              labelJa: conversionLabelJa,
              replacement: majorityChar,
            },
          });
        }
      }
    }

    return issues;
  }
}
