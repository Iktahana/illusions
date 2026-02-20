import { AbstractLintRule } from "../base-rule";
import type { LintIssue, LintRuleConfig, LintReference } from "../types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Reference for era year validation */
const STANDARD_REF: LintReference = {
  standard: "元号法 (1979)",
};

/**
 * Era definition: name, base year offset, and valid range.
 * The Western year is calculated as: baseOffset + eraNYear
 * (e.g., Reiwa 5 = 2018 + 5 = 2023)
 */
interface EraDefinition {
  readonly name: string;
  readonly baseOffset: number;
  readonly startYear: number;
  readonly endYear: number;
}

/** Japanese era definitions ordered from newest to oldest */
const ERA_DEFINITIONS: readonly EraDefinition[] = [
  { name: "令和", baseOffset: 2018, startYear: 2019, endYear: Infinity },
  { name: "平成", baseOffset: 1988, startYear: 1989, endYear: 2019 },
  { name: "昭和", baseOffset: 1925, startYear: 1926, endYear: 1989 },
  { name: "大正", baseOffset: 1911, startYear: 1912, endYear: 1926 },
  { name: "明治", baseOffset: 1867, startYear: 1868, endYear: 1912 },
] as const;

/** Map from era name to its definition for fast lookup */
const ERA_MAP: ReadonlyMap<string, EraDefinition> = new Map(
  ERA_DEFINITIONS.map((era) => [era.name, era]),
);

// ---------------------------------------------------------------------------
// Detection pattern
// ---------------------------------------------------------------------------

/**
 * Regex to match era year with parenthesized Western year.
 *
 * Captures:
 *   1: Era name (令和|平成|昭和|大正|明治)
 *   2: Era year number OR "元" for first year
 *   3: Western calendar year (4 digits)
 *
 * Supports both full-width parentheses and half-width parentheses
 */
const ERA_WESTERN_PATTERN =
  /(令和|平成|昭和|大正|明治)(元|\d+)年[（(](\d{4})年[）)]/g;

// ---------------------------------------------------------------------------
// Rule implementation
// ---------------------------------------------------------------------------

/**
 * Era/Western Year Consistency Rule (L1)
 *
 * Detects mismatches between Japanese era years and Western calendar years
 * when both appear together in text. For example, "令和5年（2022年）" is
 * flagged because Reiwa 5 corresponds to 2023, not 2022.
 *
 * Handles:
 * - All five modern eras: Meiji, Taisho, Showa, Heisei, Reiwa
 * - 元年 (first year) notation
 * - Both full-width and half-width parentheses
 *
 * Reference: 元号法 (1979)
 */
export class EraYearValidatorRule extends AbstractLintRule {
  readonly id = "era-year-validator";
  readonly name = "Era/Western year consistency";
  readonly nameJa = "元号・西暦の一致チェック";
  readonly description =
    "Validate consistency between Japanese era years and Western calendar years";
  readonly descriptionJa = "元号と西暦の対応が正しいか検証";
  readonly level = "L1" as const;
  readonly defaultConfig: LintRuleConfig = {
    enabled: true,
    severity: "warning",
  };

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (text.length === 0) return [];

    const issues: LintIssue[] = [];

    // Reset regex state for safety (global regex retains lastIndex)
    ERA_WESTERN_PATTERN.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = ERA_WESTERN_PATTERN.exec(text)) !== null) {
      const fullMatch = match[0];
      const eraName = match[1];
      const eraYearStr = match[2];
      const westernYearStr = match[3];

      const from = match.index;
      const to = from + fullMatch.length;

      // Look up the era definition
      const era = ERA_MAP.get(eraName);
      if (!era) continue;

      // Parse era year: "元" means year 1, otherwise parse as integer
      const eraYear = eraYearStr === "元" ? 1 : parseInt(eraYearStr, 10);
      if (isNaN(eraYear) || eraYear <= 0) continue;

      // Calculate the expected Western year
      const expectedWesternYear = era.baseOffset + eraYear;

      // Parse the stated Western year
      const statedWesternYear = parseInt(westernYearStr, 10);
      if (isNaN(statedWesternYear)) continue;

      // Only flag if there is a mismatch
      if (expectedWesternYear === statedWesternYear) continue;

      // Build the corrected replacement string, preserving original paren style
      const openParen = fullMatch.includes("\uFF08") ? "\uFF08" : "(";
      const closeParen = fullMatch.includes("\uFF09") ? "\uFF09" : ")";
      const eraYearDisplay = eraYearStr === "元" ? "元" : eraYearStr;
      const replacement = `${eraName}${eraYearDisplay}年${openParen}${expectedWesternYear}年${closeParen}`;

      issues.push({
        ruleId: this.id,
        severity: config.severity,
        message: `Era year mismatch: ${eraName} ${eraYear} should be ${expectedWesternYear}, not ${statedWesternYear}.`,
        messageJa: `元号法 (1979)に基づき、${eraName}${eraYearDisplay}年は西暦${expectedWesternYear}年です（${statedWesternYear}年は誤りです）`,
        from,
        to,
        reference: STANDARD_REF,
        fix: {
          label: `Fix to "${replacement}"`,
          labelJa: `「${replacement}」に修正`,
          replacement,
        },
      });
    }

    return issues;
  }
}
