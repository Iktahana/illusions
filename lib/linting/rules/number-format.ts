import { AbstractLintRule } from "../base-rule";
import { maskDialogue } from "../helpers/dialogue-mask";
import type { LintIssue, LintRuleConfig, LintReference } from "../types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Reference to the official standard for number formatting */
const STANDARD_REF: LintReference = {
  standard: '文化庁「公用文作成の考え方」(2022)',
};

/** Kanji digits indexed by their numeric value (0-9) */
const KANJI_DIGITS = [
  "零", "一", "二", "三", "四", "五", "六", "七", "八", "九",
] as const;

/** Map from kanji digit characters to their numeric value */
const KANJI_DIGIT_MAP: ReadonlyMap<string, number> = new Map([
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

/**
 * Idiomatic kanji number expressions that should NEVER be flagged.
 * These are fixed phrases where kanji numerals are always used,
 * regardless of writing direction (vertical or horizontal).
 */
const KANJI_NUMBER_EXCEPTIONS = new Set([
  // Counters (tsu)
  "一つ", "二つ", "三つ", "四つ", "五つ", "六つ", "七つ", "八つ", "九つ",
  // People counters
  "一人", "二人", "三人",
  // Day counters (tsuitachi through tooka, hatsuka, misoka)
  "一日", "二日", "三日", "四日", "五日", "六日", "七日", "八日", "九日", "十日",
  "二十日", "三十日",
  // Month names
  "一月", "二月", "三月", "四月", "五月", "六月",
  "七月", "八月", "九月", "十月", "十一月", "十二月",
  // Ordinal counters (ban)
  "一番", "二番", "三番",
  // Degree counters (do)
  "一度", "二度", "三度",
  // Idiomatic single-kanji prefix expressions
  "一方", "一般", "一部", "一切", "一応", "一旦", "一層", "一体", "一向",
  // Four-character idioms / set phrases
  "一生懸命", "一所懸命", "一期一会",
  // Place names
  "七五三", "四国", "九州", "四谷", "六本木", "八王子", "三鷹",
  // Other idiomatic expressions
  "三日月", "七夕", "七転八倒", "四苦八苦", "五里霧中",
  "十分", "百合", "千鳥", "万歳",
]);

// ---------------------------------------------------------------------------
// Kanji <-> Arabic conversion helpers
// ---------------------------------------------------------------------------

/**
 * Convert a kanji numeral string to its numeric value.
 * Returns null if the string does not form a valid kanji number.
 *
 * Supports units: 十, 百, 千, 万, 億, 兆
 *
 * @example
 * kanjiToArabic("三百五十") // => 350
 * kanjiToArabic("千五百")   // => 1500
 * kanjiToArabic("二万三千") // => 23000
 */
function kanjiToArabic(kanji: string): number | null {
  if (kanji.length === 0) return null;

  // Single digit case
  if (kanji.length === 1) {
    const digit = KANJI_DIGIT_MAP.get(kanji);
    if (digit !== undefined) return digit;
    // Single unit character (e.g. "十" = 10, "百" = 100)
    const unit = KANJI_UNIT_MAP.get(kanji);
    if (unit !== undefined) return unit;
    return null;
  }

  let total = 0;
  let current = 0;
  let lastSmallUnit = Infinity;

  for (let i = 0; i < kanji.length; i++) {
    const ch = kanji[i];
    const digitVal = KANJI_DIGIT_MAP.get(ch);
    const unitVal = KANJI_UNIT_MAP.get(ch);

    if (digitVal !== undefined) {
      current = digitVal;
    } else if (unitVal !== undefined) {
      if (unitVal >= 10000) {
        // Large units (万, 億, 兆) aggregate everything so far
        total = (total + (current === 0 ? 1 : current)) * unitVal;
        current = 0;
        lastSmallUnit = Infinity;
      } else {
        // Small units (十, 百, 千) must be in decreasing order
        if (unitVal >= lastSmallUnit) {
          return null; // Invalid order (e.g. "十百")
        }
        total += (current === 0 ? 1 : current) * unitVal;
        current = 0;
        lastSmallUnit = unitVal;
      }
    } else {
      // Unrecognized character — not a valid kanji number
      return null;
    }
  }

  // Add any trailing digit (e.g. the 五 in 三百五十五)
  total += current;

  return total > 0 ? total : null;
}

/**
 * Convert a positive integer to its kanji numeral representation.
 * Returns the original number as a string for values that are
 * too large (>= 100,000,000) or non-positive.
 *
 * @example
 * arabicToKanji(3)     // => "三"
 * arabicToKanji(15)    // => "十五"
 * arabicToKanji(350)   // => "三百五十"
 * arabicToKanji(1500)  // => "千五百"
 * arabicToKanji(10000) // => "一万"
 */
function arabicToKanji(num: number): string {
  if (num <= 0 || !Number.isInteger(num)) return String(num);
  if (num >= 100000000) return String(num);

  let result = "";
  let remaining = num;

  // Process 万 (10,000) block
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
 * Convert a number in the range 1-9999 to kanji using 千/百/十 units.
 * Uses implicit "1" prefix: 千 (not 一千), 百 (not 一百), 十 (not 一十).
 */
function convertBlockToKanji(n: number): string {
  if (n <= 0 || n > 9999) return "";

  let result = "";
  let remaining = n;

  // Thousands (千)
  const thousands = Math.floor(remaining / 1000);
  if (thousands > 0) {
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

// ---------------------------------------------------------------------------
// Exception detection
// ---------------------------------------------------------------------------

/**
 * Check whether a kanji number match at the given position is part of
 * (or overlaps with) an idiomatic exception phrase in the original text.
 *
 * The function searches a window around the match position for any
 * exception phrase that overlaps with the matched range.
 */
function isKanjiException(
  text: string,
  matchStart: number,
  matchEnd: number,
): boolean {
  for (const exception of KANJI_NUMBER_EXCEPTIONS) {
    // Search for the exception starting from before the match
    // (as the exception may start before our match)
    const searchStart = Math.max(0, matchStart - exception.length + 1);
    const searchEnd = matchEnd;

    let idx = text.indexOf(exception, searchStart);
    while (idx !== -1 && idx < searchEnd) {
      const exEnd = idx + exception.length;
      // If the exception overlaps with the match range at all, skip it
      if (idx < matchEnd && exEnd > matchStart) {
        return true;
      }
      idx = text.indexOf(exception, idx + 1);
    }
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
 * - Horizontal writing (default): flags kanji numerals, suggests Arabic
 * - Vertical writing: flags Arabic numerals, suggests kanji
 *
 * Idiomatic kanji expressions (e.g. "一人", "三日月", "九州") are
 * always exempt from flagging.
 *
 * Reference: 文化庁「公用文作成の考え方」(2022)
 */
export class NumberFormatRule extends AbstractLintRule {
  readonly id = "number-format";
  readonly name = "Number format consistency";
  readonly nameJa = "数字表記の統一";
  readonly description = "Check for mixed Arabic/Kanji numeral usage";
  readonly descriptionJa = "漢数字とアラビア数字の混在チェック";
  readonly level = "L1" as const;
  readonly defaultConfig: LintRuleConfig = {
    enabled: true,
    severity: "warning",
    options: {
      isVertical: false,
    },
  };

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (text.length === 0) return [];

    const maskedText = config.skipDialogue ? maskDialogue(text) : text;
    const isVertical = (config.options?.isVertical as boolean) ?? false;

    if (isVertical) {
      return this.checkArabicInVertical(maskedText, config);
    }
    // Existing horizontal check
    const issues = this.checkKanjiInHorizontal(maskedText, text, config);
    // NEW: comma formatting check for large numbers
    issues.push(...this.checkCommaFormatting(maskedText, config));
    return issues;
  }

  // -------------------------------------------------------------------------
  // Vertical mode: flag Arabic numerals, suggest kanji
  // -------------------------------------------------------------------------

  /**
   * In vertical writing mode, detect Arabic numeral sequences
   * and suggest kanji replacements.
   */
  private checkArabicInVertical(
    text: string,
    config: LintRuleConfig,
  ): LintIssue[] {
    const issues: LintIssue[] = [];
    const pattern = /\d+/g;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
      const matched = match[0];
      const from = match.index;
      const to = from + matched.length;

      const numValue = parseInt(matched, 10);

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

  // -------------------------------------------------------------------------
  // Horizontal mode: flag kanji numerals, suggest Arabic
  // -------------------------------------------------------------------------

  /**
   * In horizontal writing mode, detect kanji numeral sequences
   * and suggest Arabic replacements. Skips idiomatic exceptions.
   */
  private checkKanjiInHorizontal(
    text: string,
    originalText: string,
    config: LintRuleConfig,
  ): LintIssue[] {
    const issues: LintIssue[] = [];
    const pattern = /[一二三四五六七八九十百千万億兆]+/g;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
      const matched = match[0];
      const from = match.index;
      const to = from + matched.length;

      // Skip idiomatic expressions (check surrounding context using original text)
      if (isKanjiException(originalText, from, to)) continue;

      // Try to convert to an Arabic number
      const numValue = kanjiToArabic(matched);

      // Skip if the kanji sequence doesn't form a valid number
      if (numValue === null) continue;

      const arabicStr = String(numValue);

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
          label: `Replace with "${arabicStr}"`,
          labelJa: `「${arabicStr}」に置換`,
          replacement: arabicStr,
        },
      });
    }

    return issues;
  }

  // -------------------------------------------------------------------------
  // Horizontal mode: comma formatting for large numbers
  // -------------------------------------------------------------------------

  /**
   * Sub-check: Detect large Arabic numbers without comma separators.
   * Numbers with 5+ digits should use comma formatting in horizontal writing.
   * 4-digit numbers are skipped as they are often years.
   *
   * Reference: 文化庁「公用文作成の考え方」(2022)
   */
  private checkCommaFormatting(
    text: string,
    config: LintRuleConfig,
  ): LintIssue[] {
    const issues: LintIssue[] = [];
    // Match sequences of 5+ digits (skip 4-digit as likely years)
    const pattern = /\d{5,}/g;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
      const matched = match[0];
      const from = match.index;
      const to = from + matched.length;

      // Format with commas
      const formatted = Number(matched).toLocaleString("en-US");

      issues.push({
        ruleId: this.id,
        severity: config.severity,
        message:
          "Large numbers should use comma separators in horizontal writing.",
        messageJa:
          "文化庁「公用文作成の考え方」に基づき、横書きの大きな数字には桁区切りのカンマを使用してください",
        from,
        to,
        reference: STANDARD_REF,
        fix: {
          label: `Format as "${formatted}"`,
          labelJa: `「${formatted}」に置換`,
          replacement: formatted,
        },
      });
    }

    return issues;
  }
}
