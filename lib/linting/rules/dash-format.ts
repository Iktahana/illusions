import { AbstractLintRule } from "../base-rule";
import type { LintIssue, LintRuleConfig, LintReference, Severity , CorrectionEngine} from "../types";

/** JIS X 4051:2004 reference for dash formatting rules */
const JIS_REF: LintReference = {
  standard: "JIS X 4051:2004",
};

/** Em dash characters: HORIZONTAL BAR and EM DASH */
const HORIZONTAL_BAR = "\u2015"; // ―
const EM_DASH = "\u2014"; // —

/** Katakana long vowel mark */
const KATAKANA_LONG_VOWEL = "\u30FC"; // ー

/** Correct paired dash replacement (two HORIZONTAL BAR) */
const PAIRED_DASH = `${HORIZONTAL_BAR}${HORIZONTAL_BAR}`; // ――

/**
 * DashFormatRule -- L1 regex-based dash convention checks.
 *
 * Sub-checks:
 * 1. Single em dash: should be paired (――)
 * 2. ASCII double hyphen: should be replaced with em dash pair
 * 3. Katakana long vowel confusion: ー used in non-katakana context
 */
export class DashFormatRule extends AbstractLintRule {
  readonly id = "dash-format";
  override engine: CorrectionEngine = "regex";
  readonly name = "Dash Format";
  readonly nameJa = "ダッシュの用法";
  readonly description =
    "Detects incorrect dash usage and suggests proper formatting";
  readonly descriptionJa =
    "ダッシュの誤用を検出し、正しい表記を提案します";
  readonly level = "L1" as const;
  readonly defaultConfig: LintRuleConfig = {
    enabled: true,
    severity: "warning",
  };

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!text) return [];

    const issues: LintIssue[] = [];
    issues.push(
      ...this.checkSingleDash(text, config.severity),
      ...this.checkAsciiDash(text, config.severity),
      ...this.checkKatakanaLongVowelConfusion(text, config.severity),
    );
    return issues;
  }

  /**
   * Sub-check 1: Detect single em dash that should be paired (――).
   *
   * Per JIS X 4051:2004, dashes should be used in pairs.
   * Iterates character-by-character to avoid complex unicode lookbehind issues.
   */
  private checkSingleDash(text: string, severity: Severity): LintIssue[] {
    const issues: LintIssue[] = [];

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];

      // Only process em dash characters
      if (ch !== HORIZONTAL_BAR && ch !== EM_DASH) continue;

      const prev = i > 0 ? text[i - 1] : "";
      const next = i < text.length - 1 ? text[i + 1] : "";

      // Check if this dash is part of a pair (preceded or followed by another em dash)
      const prevIsDash = prev === HORIZONTAL_BAR || prev === EM_DASH;
      const nextIsDash = next === HORIZONTAL_BAR || next === EM_DASH;

      // Skip if this dash is already part of a pair
      if (prevIsDash || nextIsDash) continue;

      issues.push({
        ruleId: this.id,
        severity,
        message: "Single em dash should be paired (――)",
        messageJa:
          "JIS X 4051:2004に基づき、ダッシュは二つ重ねて使います（――）",
        from: i,
        to: i + 1,
        reference: JIS_REF,
        fix: {
          label: "Replace with paired dash (――)",
          labelJa: "二重ダッシュ（――）に置換",
          replacement: PAIRED_DASH,
        },
      });
    }

    return issues;
  }

  /**
   * Sub-check 2: Detect ASCII double hyphen (--) used as dash.
   *
   * Per JIS X 4051:2004, proper em dash characters should be used
   * instead of ASCII hyphen substitutes. Skips runs of 3+ hyphens.
   */
  private checkAsciiDash(text: string, severity: Severity): LintIssue[] {
    const issues: LintIssue[] = [];
    const pattern = /--/g;

    for (const match of text.matchAll(pattern)) {
      if (match.index === undefined) continue;

      const pos = match.index;

      // Skip if this is part of a longer hyphen run (--- or more)
      if (pos + 2 < text.length && text[pos + 2] === "-") continue;
      // Also skip if preceded by a hyphen (we're inside a longer run)
      if (pos > 0 && text[pos - 1] === "-") continue;

      issues.push({
        ruleId: this.id,
        severity,
        message: "ASCII double hyphen should be em dash (――)",
        messageJa:
          "JIS X 4051:2004に基づき、ハイフン(--)ではなくダッシュ（――）を使用してください",
        from: pos,
        to: pos + 2,
        reference: JIS_REF,
        fix: {
          label: "Replace with paired dash (――)",
          labelJa: "二重ダッシュ（――）に置換",
          replacement: PAIRED_DASH,
        },
      });
    }

    return issues;
  }

  /**
   * Sub-check 3: Detect katakana long vowel mark (ー) in non-katakana context.
   *
   * The katakana long vowel mark (U+30FC) is sometimes mistakenly used
   * as an em dash. Flag when the preceding character is not katakana.
   */
  private checkKatakanaLongVowelConfusion(
    text: string,
    severity: Severity,
  ): LintIssue[] {
    const issues: LintIssue[] = [];
    /** Katakana character range: U+30A0 - U+30FF */
    const katakanaRange = /[\u30A0-\u30FF]/;

    for (let i = 0; i < text.length; i++) {
      if (text[i] !== KATAKANA_LONG_VOWEL) continue;

      // Find the effective preceding character, skipping consecutive ー marks
      let checkIdx = i - 1;
      while (checkIdx >= 0 && text[checkIdx] === KATAKANA_LONG_VOWEL) {
        checkIdx--;
      }

      // If there is a preceding character and it is katakana, this is valid usage
      if (checkIdx >= 0 && katakanaRange.test(text[checkIdx])) continue;

      issues.push({
        ruleId: this.id,
        severity,
        message:
          "Katakana long vowel mark (\u30FC) may be intended as em dash (――)",
        messageJa:
          "JIS X 4051:2004に基づき、長音符（ー）がダッシュ（――）の誤用の可能性があります",
        from: i,
        to: i + 1,
        reference: JIS_REF,
        fix: {
          label: "Replace with paired dash (――)",
          labelJa: "二重ダッシュ（――）に置換",
          replacement: PAIRED_DASH,
        },
      });
    }

    return issues;
  }
}
