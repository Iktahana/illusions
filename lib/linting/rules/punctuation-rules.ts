import { AbstractLintRule } from "../base-rule";
import type { LintIssue, LintRuleConfig, LintReference } from "../types";

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
  readonly description = "Checks Japanese punctuation conventions";
  readonly descriptionJa = "約物の使用法を検査します";
  readonly level = "L1" as const;
  readonly defaultConfig: LintRuleConfig = {
    enabled: true,
    severity: "warning",
  };

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!text) return [];

    const issues: LintIssue[] = [];
    issues.push(...this.checkBracketPeriod(text, config));
    issues.push(...this.checkEllipsis(text, config));
    issues.push(...this.checkBracketPairing(text, config));
    issues.push(...this.checkWidthConsistency(text, config));
    return issues;
  }

  /**
   * Sub-check 1: Detect sentence-ending period inside bracket 「...。」
   *
   * Per JIS X 4051:2004, the period before a closing bracket should be omitted.
   * Uses a non-greedy match to handle innermost brackets only.
   */
  private checkBracketPeriod(
    text: string,
    config: LintRuleConfig,
  ): LintIssue[] {
    const issues: LintIssue[] = [];
    // Match innermost 「...。」 — content must not contain 「 or 」
    const pattern = /「([^「」]*?)。」/g;

    for (const match of text.matchAll(pattern)) {
      if (match.index === undefined) continue;

      // Position of the 。 character (right before the closing 」)
      const periodPos = match.index + match[0].length - 2;

      issues.push({
        ruleId: this.id,
        severity: config.severity,
        message:
          "Period before closing bracket should be omitted (JIS X 4051:2004)",
        messageJa:
          "「JIS X 4051:2004に基づき、カギカッコ内の文末句点は省略が推奨されます」",
        from: periodPos,
        to: periodPos + 1,
        reference: JIS_REF,
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
  private checkEllipsis(text: string, config: LintRuleConfig): LintIssue[] {
    const issues: LintIssue[] = [];

    // Pattern 1: Single … not adjacent to another …
    const singleEllipsis = /(?<![…])…(?![…])/g;
    for (const match of text.matchAll(singleEllipsis)) {
      if (match.index === undefined) continue;

      issues.push({
        ruleId: this.id,
        severity: config.severity,
        message:
          "Ellipsis should be used in pairs (JIS X 4051:2004)",
        messageJa:
          "「JIS X 4051:2004に基づき、三点リーダーは偶数個（……）で使用します」",
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
        severity: config.severity,
        message:
          "Use ellipsis character instead of middle dots (JIS X 4051:2004)",
        messageJa:
          "「JIS X 4051:2004に基づき、中点の連続ではなく三点リーダー（……）を使用します」",
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
    config: LintRuleConfig,
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
          severity: config.severity,
          message: `Mismatched ${pair.nameJa}: ${openCount} open, ${closeCount} close (JIS X 4051:2004)`,
          messageJa:
            `「JIS X 4051:2004に基づき、${pair.nameJa}の対応が一致しません（開: ${openCount}個、閉: ${closeCount}個）」`,
          from: text.length,
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
   * Per 文化庁「公用文作成の考え方」(2022), punctuation width should be
   * consistent throughout the document. Flags the minority variant and
   * suggests converting to the majority.
   */
  private checkWidthConsistency(
    text: string,
    config: LintRuleConfig,
  ): LintIssue[] {
    const issues: LintIssue[] = [];

    for (const variant of WIDTH_VARIANTS) {
      const fullWidthPositions: number[] = [];
      const halfWidthPositions: number[] = [];

      // Collect positions of each variant
      for (let i = 0; i < text.length; i++) {
        if (text[i] === variant.fullWidth) {
          fullWidthPositions.push(i);
        } else if (text[i] === variant.halfWidth) {
          halfWidthPositions.push(i);
        }
      }

      // Only flag if BOTH variants exist (mixed usage)
      if (fullWidthPositions.length === 0 || halfWidthPositions.length === 0) {
        continue;
      }

      // Determine majority: full-width is preferred when counts are equal
      const useFullWidth =
        fullWidthPositions.length >= halfWidthPositions.length;

      // The minority positions are the ones that need to change
      const minorityPositions = useFullWidth
        ? halfWidthPositions
        : fullWidthPositions;
      const replacement = useFullWidth ? variant.fullWidth : variant.halfWidth;
      const widthLabelJa = useFullWidth ? "全角" : "半角";
      const widthLabelEn = useFullWidth ? "full-width" : "half-width";

      for (const pos of minorityPositions) {
        issues.push({
          ruleId: this.id,
          severity: "info",
          message:
            `${variant.nameEn} should be ${widthLabelEn} for consistency`,
          messageJa:
            `「文化庁「公用文作成の考え方」に基づき、${variant.nameJa}は${widthLabelJa}（${replacement}）に統一します」`,
          from: pos,
          to: pos + 1,
          reference: BUNKACHO_REF,
          fix: {
            label: `Convert to ${widthLabelEn}`,
            labelJa: `${widthLabelJa}に変換`,
            replacement,
          },
        });
      }
    }

    return issues;
  }
}
