import { AbstractLintRule } from "../base-rule";
import type { LintIssue, LintRuleConfig, LintReference } from "../types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STANDARD_REF: LintReference = {
  standard: '文化庁「公用文作成の考え方」(2022)',
};

/** Kanji digits 0-9 */
const KANJI_DIGITS = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"] as const;

/** Map from kanji digit characters to their numeric value */
const KANJI_DIGIT_MAP: ReadonlyMap<string, number> = new Map([
  ["零", 0],
  ["一", 1],
  ["二", 2],
  ["三", 3],
  ["四", 4],
  ["五", 5],
  ["六", 6],
  ["七", 7],
  ["八", 8],
  ["九", 9],
]);

/** Map from kanji unit characters to their multiplier */
const KANJI_UNIT_MAP: ReadonlyMap<string, number> = new Map([
  ["十", 10],
  ["百", 100],
  ["千", 1000],
  ["万", 10000],
  ["億", 100000000],
  ["兆", 1000000000000],
]);

/** Full-width to half-width digit map */
const FULLWIDTH_DIGIT_MAP: ReadonlyMap<string, string> = new Map([
  ["０", "0"],
  ["１", "1"],
  ["２", "2"],
  ["３", "3"],
  ["４", "4"],
  ["５", "5"],
  ["６", "6"],
  ["７", "7"],
  ["８", "8"],
  ["９", "9"],
]);

/**
 * Idiomatic kanji number expressions that should NOT be flagged.
 * These are fixed phrases where kanji numerals are used regardless
 * of writing direction (vertical or horizontal).
 */
const KANJI_NUMBER_EXCEPTIONS = new Set([
  // Counter expressions
  "一つ",
  "二つ",
  "三つ",
  "四つ",
  "五つ",
  "六つ",
  "七つ",
  "八つ",
  "九つ",
  // People counters
  "一人",
  "二人",
  "三人",
  // Day counters
  "一日",
  "二日",
  "三日",
  // Proper nouns and idiomatic expressions
  "三日月",
  "一番",
  "二番",
  "三番",
  "七五三",
  "四国",
  "九州",
  // Common phrases with kanji numerals
  "一方",
  "一度",
  "一般",
  "一部",
  "一緒",
  "一生",
  "一切",
  "一応",
  "一瞬",
  "一種",
  "二度",
  "一見",
  "一体",
  "一旦",
  "万一",
  "十分",
  "百科",
]);

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Normalize full-width Arabic digits to half-width.
 * e.g. "１２３" -> "123"
 */
function normalizeFullWidth(str: string): string {
  return str
    .split("")
    .map((ch) => FULLWIDTH_DIGIT_MAP.get(ch) ?? ch)
    .join("");
}

/**
 * Convert a positive integer to its kanji numeral representation.
 * Handles numbers up to 9999 with proper unit placement.
 * For numbers >= 10000, uses 万 unit.
 *
 * Examples:
 *   3 -> "三"
 *   15 -> "十五"
 *   350 -> "三百五十"
 *   1500 -> "千五百"
 *   10000 -> "一万"
 */
function arabicToKanji(num: number): string {
  if (num <= 0 || !Number.isInteger(num)) return String(num);
  if (num >= 100000000) return String(num); // Too large to convert

  let result = "";
  let remaining = num;

  // Process 万 (10000) block
  if (remaining >= 10000) {
    const manCount = Math.floor(remaining / 10000);
    result += convertBlockToKanji(manCount) + "万";
    remaining %= 10000;
  }

  // Process remaining 1-9999
  if (remaining > 0) {
    result += convertBlockToKanji(remaining);
  }

  return result;
}

/**
 * Convert a number 1-9999 into kanji with 千/百/十 units.
 */
function convertBlockToKanji(n: number): string {
  if (n <= 0 || n > 9999) return "";

  let result = "";
  let remaining = n;

  // Thousands (千)
  const thousands = Math.floor(remaining / 1000);
  if (thousands > 0) {
    // "千" alone for 1000, otherwise prefix with digit kanji
    result += thousands === 1 ? "千" : KANJI_DIGITS[thousands] + "千";
    remaining %= 1000;
  }

  // Hundreds (百)
  const hundreds = Math.floor(remaining / 100);
  if (hundreds > 0) {
    result += hundreds === 1 ? "百" : KANJI_DIGITS[hundreds] + "百";
    remaining %= 100;
  }

  // Tens (十)
  const tens = Math.floor(remaining / 10);
  if (tens > 0) {
    result += tens === 1 ? "十" : KANJI_DIGITS[tens] + "十";
    remaining %= 10;
  }

  // Ones
  if (remaining > 0) {
    result += KANJI_DIGITS[remaining];
  }

  return result;
}

/**
 * Convert a kanji numeral string to its numeric value.
 * Returns null if the string is not a valid kanji number pattern.
 *
 * Supports: 一, 十, 百, 千, 万, 億, 兆 units
 *
 * Examples:
 *   "三百五十" -> 350
 *   "千五百" -> 1500
 *   "二万三千" -> 23000
 */
function kanjiToArabic(kanji: string): number | null {
  if (kanji.length === 0) return null;

  // Single digit
  if (kanji.length === 1 && KANJI_DIGIT_MAP.has(kanji)) {
    return KANJI_DIGIT_MAP.get(kanji) ?? null;
  }

  let total = 0;
  let current = 0; // Accumulator for the current segment
  let lastUnit = Infinity; // Track decreasing units for validation

  for (let i = 0; i < kanji.length; i++) {
    const ch = kanji[i];
    const digitVal = KANJI_DIGIT_MAP.get(ch);
    const unitVal = KANJI_UNIT_MAP.get(ch);

    if (digitVal !== undefined) {
      current = digitVal;
    } else if (unitVal !== undefined) {
      // Large units (万, 億, 兆) aggregate everything accumulated so far
      if (unitVal >= 10000) {
        total = (total + (current === 0 ? 1 : current)) * unitVal;
        current = 0;
        // For large units we reset tracking
        lastUnit = unitVal;
      } else {
        // Small units (十, 百, 千)
        if (unitVal >= lastUnit && lastUnit < 10000) {
          // Invalid: units not in decreasing order (e.g. 十百)
          return null;
        }
        total += (current === 0 ? 1 : current) * unitVal;
        current = 0;
        lastUnit = unitVal;
      }
    } else {
      // Character is not a recognized kanji numeral
      return null;
    }
  }

  // Add any trailing digit (e.g. the 五 in 三百五十五)
  total += current;

  return total > 0 ? total : null;
}

/**
 * Format a numeric string with comma separators.
 * e.g. "1000000" -> "1,000,000"
 */
function formatWithCommas(numStr: string): string {
  return numStr.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Check whether a kanji number match at the given position is part
 * of an exception phrase in the original text.
 */
function isKanjiException(text: string, matchStart: number, matchEnd: number): boolean {
  for (const exception of KANJI_NUMBER_EXCEPTIONS) {
    // Check if the exception overlaps with this match in the text
    const exIdx = text.indexOf(exception, Math.max(0, matchStart - exception.length + 1));
    if (exIdx === -1) continue;
    const exEnd = exIdx + exception.length;
    // If the exception fully covers the match range, skip it
    if (exIdx <= matchStart && exEnd >= matchEnd) return true;
    // If the match is a substring of the exception, skip it
    if (exIdx < matchEnd && exEnd > matchStart) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Rule implementation
// ---------------------------------------------------------------------------

/**
 * Number Format Rule (L1)
 *
 * Checks for consistent number formatting based on writing direction:
 * - Vertical writing: recommends kanji numerals instead of Arabic digits
 * - Horizontal writing: recommends Arabic numerals instead of kanji digits,
 *   and comma formatting for numbers with 4+ digits
 *
 * Reference: 文化庁「公用文作成の考え方」(2022)
 */
export class NumberFormatRule extends AbstractLintRule {
  readonly id = "number-format";
  readonly name = "Number format consistency";
  readonly nameJa = "数字表記の統一";
  readonly description = "Checks for consistent number formatting based on writing direction";
  readonly descriptionJa = "数字表記の一貫性を検査します";
  readonly level = "L1" as const;
  readonly defaultConfig: LintRuleConfig = {
    enabled: true,
    severity: "info",
    options: {
      isVertical: false,
    },
  };

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (text.length === 0) return [];

    const isVertical = (config.options?.isVertical as boolean) ?? false;
    const issues: LintIssue[] = [];

    if (isVertical) {
      issues.push(...this.checkArabicInVertical(text, config));
    } else {
      issues.push(...this.checkKanjiInHorizontal(text, config));
      issues.push(...this.checkCommaFormatting(text, config));
    }

    return issues;
  }

  /**
   * Detect Arabic numerals (half-width and full-width) of 2+ digits
   * in vertical writing mode. Single digits are acceptable.
   */
  private checkArabicInVertical(text: string, config: LintRuleConfig): LintIssue[] {
    const issues: LintIssue[] = [];
    const pattern = /[0-9０-９]{2,}/g;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
      const matched = match[0];
      const from = match.index;
      const to = from + matched.length;

      // Normalize full-width digits to half-width for conversion
      const normalized = normalizeFullWidth(matched);
      const numValue = parseInt(normalized, 10);

      // Skip if conversion is not feasible (NaN or too large)
      if (isNaN(numValue) || numValue >= 100000000) continue;

      const kanjiReplacement = arabicToKanji(numValue);

      issues.push({
        ruleId: this.id,
        severity: config.severity,
        message:
          "In vertical writing, kanji numerals are recommended instead of Arabic numerals.",
        messageJa:
          "文化庁「公用文作成の考え方」に基づき、縦書きでは漢数字の使用が推奨されます",
        from,
        to,
        reference: STANDARD_REF,
        fix: {
          label: `Replace with "${kanjiReplacement}"`,
          labelJa: `「${kanjiReplacement}」に置換`,
          replacement: kanjiReplacement,
        },
      });
    }

    return issues;
  }

  /**
   * Detect kanji numeral sequences of 2+ characters in horizontal writing mode.
   * Skips idiomatic expressions listed in KANJI_NUMBER_EXCEPTIONS.
   */
  private checkKanjiInHorizontal(text: string, config: LintRuleConfig): LintIssue[] {
    const issues: LintIssue[] = [];
    const pattern = /[一二三四五六七八九十百千万億兆]{2,}/g;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
      const matched = match[0];
      const from = match.index;
      const to = from + matched.length;

      // Skip idiomatic expressions
      if (isKanjiException(text, from, to)) continue;

      // Try to convert to Arabic number
      const numValue = kanjiToArabic(matched);

      // Skip if the kanji sequence doesn't form a valid number
      if (numValue === null) continue;

      const arabicStr = String(numValue);
      // Apply comma formatting for large numbers
      const formatted = numValue >= 10000 ? formatWithCommas(arabicStr) : arabicStr;

      issues.push({
        ruleId: this.id,
        severity: config.severity,
        message:
          "In horizontal writing, Arabic numerals are recommended instead of kanji numerals.",
        messageJa:
          "文化庁「公用文作成の考え方」に基づき、横書きではアラビア数字の使用が推奨されます",
        from,
        to,
        reference: STANDARD_REF,
        fix: {
          label: `Replace with "${formatted}"`,
          labelJa: `「${formatted}」に置換`,
          replacement: formatted,
        },
      });
    }

    return issues;
  }

  /**
   * Detect Arabic numbers with 4+ consecutive digits that lack comma separators.
   * Only applies in horizontal writing mode.
   */
  private checkCommaFormatting(text: string, config: LintRuleConfig): LintIssue[] {
    const issues: LintIssue[] = [];
    // Match 4+ digit sequences not preceded or followed by digits or commas
    const pattern = /(?<![0-9,])[0-9]{4,}(?![0-9,])/g;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
      const matched = match[0];
      const from = match.index;
      const to = from + matched.length;

      const formatted = formatWithCommas(matched);

      // Skip if formatting wouldn't change anything (shouldn't happen with 4+ digits)
      if (formatted === matched) continue;

      issues.push({
        ruleId: this.id,
        severity: config.severity,
        message: "Numbers with 4 or more digits should use comma separators.",
        messageJa:
          "文化庁「公用文作成の考え方」に基づき、4桁以上の数字にはカンマ区切りを推奨します",
        from,
        to,
        reference: STANDARD_REF,
        fix: {
          label: `Replace with "${formatted}"`,
          labelJa: `「${formatted}」に置換`,
          replacement: formatted,
        },
      });
    }

    return issues;
  }
}
