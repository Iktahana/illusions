/**
 * JTF日本語標準スタイルガイド L1 (regex) lint rules.
 *
 * 43 rules total:
 *   - 21 implemented rules with regex-based detection
 *   - 22 TODO stubs (disabled, for future implementation)
 *
 * All rules extend AbstractL1Rule and are driven by metadata
 * loaded from rules.json via the rule-loader.
 */

import { AbstractL1Rule } from "../../base-rule";
import { getJsonRulesByBook } from "../../rule-loader";
import type { JsonRuleMeta, LintIssue, LintReference, LintRuleConfig } from "../../types";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const JTF_REFERENCE: LintReference = {
  standard: "JTF日本語標準スタイルガイド",
  url: "",
};

/** Build a JsonRuleMeta from a JsonRuleEntry */
function toMeta(entry: {
  Rule_ID: string;
  Level: "L1" | "L2" | "L3";
  Description: string;
  "Pattern/Logic": string;
  Positive_Example: string;
  Negative_Example: string;
  Source_Reference: string;
}): JsonRuleMeta {
  return {
    ruleId: entry.Rule_ID,
    level: entry.Level,
    description: entry.Description,
    patternLogic: entry["Pattern/Logic"],
    positiveExample: entry.Positive_Example,
    negativeExample: entry.Negative_Example,
    sourceReference: entry.Source_Reference,
    bookTitle: "JTF 日本語標準スタイルガイド",
  };
}

/** Japanese full-width character class pattern (for lookaround etc.) */
const JA_CHAR = "[\\u3041-\\u3096\\u30A1-\\u30F6\\u4E00-\\u9FFF\\u3400-\\u4DBF]";

// ---------------------------------------------------------------------------
// Half-width katakana → full-width conversion map
// ---------------------------------------------------------------------------

const HALF_TO_FULL_KANA: ReadonlyMap<string, string> = new Map([
  ["ｦ", "ヲ"],
  ["ｧ", "ァ"],
  ["ｨ", "ィ"],
  ["ｩ", "ゥ"],
  ["ｪ", "ェ"],
  ["ｫ", "ォ"],
  ["ｬ", "ャ"],
  ["ｭ", "ュ"],
  ["ｮ", "ョ"],
  ["ｯ", "ッ"],
  ["ｰ", "ー"],
  ["ｱ", "ア"],
  ["ｲ", "イ"],
  ["ｳ", "ウ"],
  ["ｴ", "エ"],
  ["ｵ", "オ"],
  ["ｶ", "カ"],
  ["ｷ", "キ"],
  ["ｸ", "ク"],
  ["ｹ", "ケ"],
  ["ｺ", "コ"],
  ["ｻ", "サ"],
  ["ｼ", "シ"],
  ["ｽ", "ス"],
  ["ｾ", "セ"],
  ["ｿ", "ソ"],
  ["ﾀ", "タ"],
  ["ﾁ", "チ"],
  ["ﾂ", "ツ"],
  ["ﾃ", "テ"],
  ["ﾄ", "ト"],
  ["ﾅ", "ナ"],
  ["ﾆ", "ニ"],
  ["ﾇ", "ヌ"],
  ["ﾈ", "ネ"],
  ["ﾉ", "ノ"],
  ["ﾊ", "ハ"],
  ["ﾋ", "ヒ"],
  ["ﾌ", "フ"],
  ["ﾍ", "ヘ"],
  ["ﾎ", "ホ"],
  ["ﾏ", "マ"],
  ["ﾐ", "ミ"],
  ["ﾑ", "ム"],
  ["ﾒ", "メ"],
  ["ﾓ", "モ"],
  ["ﾔ", "ヤ"],
  ["ﾕ", "ユ"],
  ["ﾖ", "ヨ"],
  ["ﾗ", "ラ"],
  ["ﾘ", "リ"],
  ["ﾙ", "ル"],
  ["ﾚ", "レ"],
  ["ﾛ", "ロ"],
  ["ﾜ", "ワ"],
  ["ﾝ", "ン"],
  ["ﾞ", "゛"],
  ["ﾟ", "゜"],
]);

// ---------------------------------------------------------------------------
// Full-width alphanumeric → half-width conversion map
// ---------------------------------------------------------------------------

function fullwidthToHalfwidth(ch: string): string {
  const code = ch.charCodeAt(0);
  // ０-９ (0xFF10-0xFF19) → 0-9
  if (code >= 0xff10 && code <= 0xff19) return String.fromCharCode(code - 0xff10 + 0x30);
  // Ａ-Ｚ (0xFF21-0xFF3A) → A-Z
  if (code >= 0xff21 && code <= 0xff3a) return String.fromCharCode(code - 0xff21 + 0x41);
  // ａ-ｚ (0xFF41-0xFF5A) → a-z
  if (code >= 0xff41 && code <= 0xff5a) return String.fromCharCode(code - 0xff41 + 0x61);
  return ch;
}

// ---------------------------------------------------------------------------
// Half-width bracket → full-width conversion map
// ---------------------------------------------------------------------------

const HALF_TO_FULL_BRACKET: ReadonlyMap<string, string> = new Map([
  ["(", "（"],
  [")", "）"],
  ["[", "［"],
  ["]", "］"],
  ["｢", "「"],
  ["｣", "」"],
]);

// ---------------------------------------------------------------------------
// Kanji conversion target list for JTF_2_2_1_kanji
// ---------------------------------------------------------------------------

const HIRAGANA_TO_KANJI: ReadonlyArray<[string, string]> = [
  ["いっさい", "一切"],
  ["かならず", "必ず"],
  ["おおいに", "大いに"],
  ["しいて", "強いて"],
  ["すでに", "既に"],
  ["すべて", "全て"],
  ["ただちに", "直ちに"],
  ["つねに", "常に"],
  ["はなはだ", "甚だ"],
  ["ふたたび", "再び"],
  ["まったく", "全く"],
  ["もっとも", "最も"],
  ["もっぱら", "専ら"],
  ["わずか", "僅か"],
];

/**
 * Known compound words that start with a HIRAGANA_TO_KANJI entry but form a
 * different word. Used to suppress false positives in substring matching.
 */
const KANJI_EXCLUSION_PATTERNS: ReadonlyMap<string, RegExp> = new Map([
  ["もっとも", /もっともらし/],
]);

// ============================================================================
// Implemented rule classes (21 rules)
// ============================================================================

// ---- Punctuation category ----

/** JTF_1_2_1: Overall punctuation standard (delegates to JTF_1_2_1_punctuation) */
class JtfPunctuationStandardRule extends AbstractL1Rule {
  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled) return [];
    const issues: LintIssue[] = [];

    // Detect full-width comma ，used as Japanese punctuation
    const fwComma = /，/g;
    let m: RegExpExecArray | null;
    while ((m = fwComma.exec(text)) !== null) {
      issues.push({
        ruleId: this.id,
        severity: config.severity,
        message: "Use full-width touten (、) instead of full-width comma (，)",
        messageJa:
          "JTFスタイルガイドに基づき、句読点には全角の読点（、）を使用してください。全角カンマ（，）は使用しません。",
        from: m.index,
        to: m.index + 1,
        originalText: "，",
        reference: { ...JTF_REFERENCE, section: "1.2.1" },
        fix: { label: "Replace with 、", labelJa: "「、」に置換", replacement: "、" },
      });
    }

    // Detect full-width period ．used as Japanese punctuation
    const fwPeriod = /．/g;
    while ((m = fwPeriod.exec(text)) !== null) {
      issues.push({
        ruleId: this.id,
        severity: config.severity,
        message: "Use full-width kuten (。) instead of full-width period (．)",
        messageJa:
          "JTFスタイルガイドに基づき、句読点には全角の句点（。）を使用してください。全角ピリオド（．）は使用しません。",
        from: m.index,
        to: m.index + 1,
        originalText: "．",
        reference: { ...JTF_REFERENCE, section: "1.2.1" },
        fix: { label: "Replace with 。", labelJa: "「。」に置換", replacement: "。" },
      });
    }

    return issues;
  }
}

/** JTF_1_2_1_punctuation: Replace half-width ,/. in Japanese context with 、/。 */
class JtfPunctuationReplacementRule extends AbstractL1Rule {
  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled) return [];
    const issues: LintIssue[] = [];

    // Half-width comma preceded by a non-ASCII char (Japanese context)
    const commaPattern = new RegExp(`(?<=${JA_CHAR}),|,(?=${JA_CHAR})`, "g");
    let m: RegExpExecArray | null;
    while ((m = commaPattern.exec(text)) !== null) {
      issues.push({
        ruleId: this.id,
        severity: config.severity,
        message: "Use full-width touten (、) instead of half-width comma (,) in Japanese text",
        messageJa:
          "JTFスタイルガイドに基づき、和文中では半角カンマ（,）ではなく全角読点（、）を使用してください。",
        from: m.index,
        to: m.index + 1,
        originalText: ",",
        reference: { ...JTF_REFERENCE, section: "1.2.1" },
        fix: { label: "Replace with 、", labelJa: "「、」に置換", replacement: "、" },
      });
    }

    // Half-width period preceded by a non-ASCII char (Japanese context)
    // Exclude decimal points (digit.digit) and abbreviations
    const periodPattern = new RegExp(
      `(?<=${JA_CHAR})\\.(?!\\d)|(?<![a-zA-Z0-9])\\.(?=${JA_CHAR})`,
      "g",
    );
    while ((m = periodPattern.exec(text)) !== null) {
      issues.push({
        ruleId: this.id,
        severity: config.severity,
        message: "Use full-width kuten (。) instead of half-width period (.) in Japanese text",
        messageJa:
          "JTFスタイルガイドに基づき、和文中では半角ピリオド（.）ではなく全角句点（。）を使用してください。",
        from: m.index,
        to: m.index + 1,
        originalText: ".",
        reference: { ...JTF_REFERENCE, section: "1.2.1" },
        fix: { label: "Replace with 。", labelJa: "「。」に置換", replacement: "。" },
      });
    }

    return issues;
  }
}

/** JTF_3_1_1: Sentence-ending period rules */
class JtfKutenRule extends AbstractL1Rule {
  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled) return [];
    const issues: LintIssue[] = [];

    // Detect half-width period used as sentence-ending (followed by Japanese char or end)
    const pattern = new RegExp(`\\.(?=${JA_CHAR}|$)`, "g");
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      // Skip if preceded by digits/alpha (decimal, abbreviation)
      if (m.index > 0 && /[a-zA-Z0-9]/.test(text[m.index - 1])) continue;
      issues.push({
        ruleId: this.id,
        severity: config.severity,
        message: "Use full-width kuten (。) for sentence endings, not half-width period (.)",
        messageJa:
          "JTFスタイルガイドに基づき、文末には全角句点（。）を使用してください。半角ピリオド（.）は文末の句点として使いません。",
        from: m.index,
        to: m.index + 1,
        originalText: ".",
        reference: { ...JTF_REFERENCE, section: "3.1.1" },
        fix: { label: "Replace with 。", labelJa: "「。」に置換", replacement: "。" },
      });
    }

    return issues;
  }
}

/** JTF_3_1_1_kuten_brackets: No period before closing bracket */
class JtfKutenBracketsRule extends AbstractL1Rule {
  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled) return [];
    const issues: LintIssue[] = [];

    // 。」→ 」 and 。）→ ）
    const pattern = /。(?=[」）\)])/g;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      issues.push({
        ruleId: this.id,
        severity: config.severity,
        message: "Remove period before closing bracket",
        messageJa: "JTFスタイルガイドに基づき、閉じかっこの前に句点（。）を打たないでください。",
        from: m.index,
        to: m.index + 1,
        originalText: "。",
        reference: { ...JTF_REFERENCE, section: "3.1.1" },
        fix: { label: "Remove 。", labelJa: "「。」を削除", replacement: "" },
      });
    }

    return issues;
  }
}

/** JTF_3_1_3: Period/comma usage in Japanese text */
class JtfPeriodCommaRule extends AbstractL1Rule {
  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled) return [];
    const issues: LintIssue[] = [];

    // Detect half-width comma in Japanese context (not between ASCII chars)
    const commaPattern = new RegExp(`(?<=[^\\x00-\\x7E]),(?=[^\\x00-\\x7E])`, "g");
    let m: RegExpExecArray | null;
    while ((m = commaPattern.exec(text)) !== null) {
      issues.push({
        ruleId: this.id,
        severity: config.severity,
        message: "Use full-width touten (、) in Japanese text, not half-width comma",
        messageJa:
          "JTFスタイルガイドに基づき、日本語文中では半角カンマ（,）ではなく全角読点（、）を使用してください。",
        from: m.index,
        to: m.index + 1,
        originalText: ",",
        reference: { ...JTF_REFERENCE, section: "3.1.3" },
        fix: { label: "Replace with 、", labelJa: "「、」に置換", replacement: "、" },
      });
    }

    // Detect half-width period in Japanese context
    const periodPattern = new RegExp(`(?<=[^\\x00-\\x7E])\\.(?=[^\\x00-\\x7E])`, "g");
    while ((m = periodPattern.exec(text)) !== null) {
      issues.push({
        ruleId: this.id,
        severity: config.severity,
        message: "Use full-width kuten (。) in Japanese text, not half-width period",
        messageJa:
          "JTFスタイルガイドに基づき、日本語文中では半角ピリオド（.）ではなく全角句点（。）を使用してください。",
        from: m.index,
        to: m.index + 1,
        originalText: ".",
        reference: { ...JTF_REFERENCE, section: "3.1.3" },
        fix: { label: "Replace with 。", labelJa: "「。」に置換", replacement: "。" },
      });
    }

    return issues;
  }
}

// ---- Character width category ----

/** JTF_2_1_5_fullwidth_kana: No half-width katakana */
class JtfFullwidthKanaRule extends AbstractL1Rule {
  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled) return [];
    const issues: LintIssue[] = [];

    const pattern = /[\uFF66-\uFF9F]/g;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      const halfChar = m[0];
      const fullChar = HALF_TO_FULL_KANA.get(halfChar) ?? halfChar;
      issues.push({
        ruleId: this.id,
        severity: config.severity,
        message: `Use full-width katakana instead of half-width: ${halfChar} -> ${fullChar}`,
        messageJa: `JTFスタイルガイドに基づき、半角カタカナ（${halfChar}）は全角（${fullChar}）で表記してください。`,
        from: m.index,
        to: m.index + 1,
        originalText: halfChar,
        reference: { ...JTF_REFERENCE, section: "2.1.5" },
        fix: {
          label: `Replace with ${fullChar}`,
          labelJa: `「${fullChar}」に置換`,
          replacement: fullChar,
        },
      });
    }

    return issues;
  }
}

/** JTF_2_1_8: Full-width numeric standard (overview; delegates to JTF_2_1_8_halfwidth_alnum) */
class JtfNumericStandardRule extends AbstractL1Rule {
  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled) return [];
    const issues: LintIssue[] = [];

    // Detect full-width digits
    const pattern = /[\uFF10-\uFF19]/g;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      const halfChar = fullwidthToHalfwidth(m[0]);
      issues.push({
        ruleId: this.id,
        severity: config.severity,
        message: `Use half-width digit instead of full-width: ${m[0]} -> ${halfChar}`,
        messageJa: `JTFスタイルガイドに基づき、全角数字（${m[0]}）は半角（${halfChar}）で表記してください。`,
        from: m.index,
        to: m.index + 1,
        originalText: m[0],
        reference: { ...JTF_REFERENCE, section: "2.1.8" },
        fix: {
          label: `Replace with ${halfChar}`,
          labelJa: `「${halfChar}」に置換`,
          replacement: halfChar,
        },
      });
    }

    return issues;
  }
}

/** JTF_2_1_8_halfwidth_alnum: Full-width alphanumeric → half-width */
class JtfHalfwidthAlnumRule extends AbstractL1Rule {
  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled) return [];
    const issues: LintIssue[] = [];

    const pattern = /[\uFF10-\uFF19\uFF21-\uFF3A\uFF41-\uFF5A]/g;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      const halfChar = fullwidthToHalfwidth(m[0]);
      issues.push({
        ruleId: this.id,
        severity: config.severity,
        message: `Use half-width character instead of full-width: ${m[0]} -> ${halfChar}`,
        messageJa: `JTFスタイルガイドに基づき、全角英数字（${m[0]}）は半角（${halfChar}）で表記してください。`,
        from: m.index,
        to: m.index + 1,
        originalText: m[0],
        reference: { ...JTF_REFERENCE, section: "2.1.8" },
        fix: {
          label: `Replace with ${halfChar}`,
          labelJa: `「${halfChar}」に置換`,
          replacement: halfChar,
        },
      });
    }

    return issues;
  }
}

/** JTF_2_1_10_digit_comma: Digit grouping with half-width comma */
class JtfDigitCommaRule extends AbstractL1Rule {
  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled) return [];
    const issues: LintIssue[] = [];

    // Full-width comma in numbers: e.g. 12，345
    const fwCommaInNum = /(\d)，(\d)/g;
    let m: RegExpExecArray | null;
    while ((m = fwCommaInNum.exec(text)) !== null) {
      const from = m.index + 1; // position of ，
      issues.push({
        ruleId: this.id,
        severity: config.severity,
        message: "Use half-width comma (,) for digit grouping, not full-width (，)",
        messageJa:
          "JTFスタイルガイドに基づき、数字の桁区切りには半角カンマ（,）を使用してください。",
        from,
        to: from + 1,
        originalText: "，",
        reference: { ...JTF_REFERENCE, section: "2.1.10" },
        fix: { label: "Replace with ,", labelJa: "「,」に置換", replacement: "," },
      });
    }

    // Full-width period in numbers: e.g. 3．14
    const fwPeriodInNum = /(\d)．(\d)/g;
    while ((m = fwPeriodInNum.exec(text)) !== null) {
      const from = m.index + 1;
      issues.push({
        ruleId: this.id,
        severity: config.severity,
        message: "Use half-width period (.) for decimal point, not full-width (．)",
        messageJa: "JTFスタイルガイドに基づき、小数点には半角ピリオド（.）を使用してください。",
        from,
        to: from + 1,
        originalText: "．",
        reference: { ...JTF_REFERENCE, section: "2.1.10" },
        fix: { label: "Replace with .", labelJa: "「.」に置換", replacement: "." },
      });
    }

    return issues;
  }
}

// ---- Kanji/Kana category ----

/** JTF_2_2_1_kanji: Specific words should use kanji, not hiragana */
class JtfKanjiRule extends AbstractL1Rule {
  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled) return [];
    const issues: LintIssue[] = [];

    for (const [hiragana, kanji] of HIRAGANA_TO_KANJI) {
      const pattern = new RegExp(hiragana, "g");
      const exclusion = KANJI_EXCLUSION_PATTERNS.get(hiragana);
      let m: RegExpExecArray | null;
      while ((m = pattern.exec(text)) !== null) {
        // Skip if this match is part of a known compound word
        if (exclusion) {
          const slice = text.slice(m.index);
          if (exclusion.test(slice)) continue;
        }
        issues.push({
          ruleId: this.id,
          severity: config.severity,
          message: `Use kanji form: ${hiragana} -> ${kanji}`,
          messageJa: `JTFスタイルガイドに基づき、「${hiragana}」は漢字表記「${kanji}」を使用してください。`,
          from: m.index,
          to: m.index + hiragana.length,
          originalText: hiragana,
          reference: { ...JTF_REFERENCE, section: "2.2.1" },
          fix: {
            label: `Replace with ${kanji}`,
            labelJa: `「${kanji}」に置換`,
            replacement: kanji,
          },
        });
      }
    }

    return issues;
  }
}

/** JTF_2_3_no_space: No space between half/full-width characters */
class JtfNoSpaceRule extends AbstractL1Rule {
  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled) return [];
    const issues: LintIssue[] = [];

    // Space between half-width and full-width chars (both directions)
    const pattern1 = new RegExp(`([a-zA-Z0-9]) (?=${JA_CHAR})`, "g");
    const pattern2 = new RegExp(`(?<=${JA_CHAR}) ([a-zA-Z0-9])`, "g");

    let m: RegExpExecArray | null;
    while ((m = pattern1.exec(text)) !== null) {
      const spaceIdx = m.index + 1;
      issues.push({
        ruleId: this.id,
        severity: config.severity,
        message: "Remove space between half-width and full-width characters",
        messageJa:
          "JTFスタイルガイドに基づき、半角文字と全角文字の間にスペースを入れないでください。",
        from: spaceIdx,
        to: spaceIdx + 1,
        originalText: " ",
        reference: { ...JTF_REFERENCE, section: "2.3" },
        fix: { label: "Remove space", labelJa: "スペースを削除", replacement: "" },
      });
    }

    while ((m = pattern2.exec(text)) !== null) {
      // The space is at match position (before the captured group)
      const spaceIdx = m.index;
      issues.push({
        ruleId: this.id,
        severity: config.severity,
        message: "Remove space between full-width and half-width characters",
        messageJa:
          "JTFスタイルガイドに基づき、全角文字と半角文字の間にスペースを入れないでください。",
        from: spaceIdx,
        to: spaceIdx + 1,
        originalText: " ",
        reference: { ...JTF_REFERENCE, section: "2.3" },
        fix: { label: "Remove space", labelJa: "スペースを削除", replacement: "" },
      });
    }

    return issues;
  }
}

// ---- Brackets category ----

/** JTF_3_3_1_parentheses_space: No space inside/outside brackets */
class JtfParenthesesSpaceRule extends AbstractL1Rule {
  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled) return [];
    const issues: LintIssue[] = [];

    // Space before opening bracket: " （", " 「", " ［"
    const beforeOpen = /[ \u3000](?=[（「［『【〈《])/g;
    let m: RegExpExecArray | null;
    while ((m = beforeOpen.exec(text)) !== null) {
      issues.push({
        ruleId: this.id,
        severity: config.severity,
        message: "Remove space before opening bracket",
        messageJa: "JTFスタイルガイドに基づき、かっこの外側にスペースを入れないでください。",
        from: m.index,
        to: m.index + 1,
        originalText: m[0],
        reference: { ...JTF_REFERENCE, section: "3.3.1" },
        fix: { label: "Remove space", labelJa: "スペースを削除", replacement: "" },
      });
    }

    // Space after closing bracket: "）  ", "」 ", "］ "
    const afterClose = /(?<=[）」］』】〉》])[ \u3000]/g;
    while ((m = afterClose.exec(text)) !== null) {
      issues.push({
        ruleId: this.id,
        severity: config.severity,
        message: "Remove space after closing bracket",
        messageJa: "JTFスタイルガイドに基づき、かっこの外側にスペースを入れないでください。",
        from: m.index,
        to: m.index + 1,
        originalText: m[0],
        reference: { ...JTF_REFERENCE, section: "3.3.1" },
        fix: { label: "Remove space", labelJa: "スペースを削除", replacement: "" },
      });
    }

    // Space after opening bracket: "（ ", "「 "
    const afterOpen = /(?<=[（「［『【〈《])[ \u3000]/g;
    while ((m = afterOpen.exec(text)) !== null) {
      issues.push({
        ruleId: this.id,
        severity: config.severity,
        message: "Remove space inside opening bracket",
        messageJa: "JTFスタイルガイドに基づき、かっこの内側にスペースを入れないでください。",
        from: m.index,
        to: m.index + 1,
        originalText: m[0],
        reference: { ...JTF_REFERENCE, section: "3.3.1" },
        fix: { label: "Remove space", labelJa: "スペースを削除", replacement: "" },
      });
    }

    // Space before closing bracket: " ）", " 」"
    const beforeClose = /[ \u3000](?=[）」］』】〉》])/g;
    while ((m = beforeClose.exec(text)) !== null) {
      issues.push({
        ruleId: this.id,
        severity: config.severity,
        message: "Remove space inside closing bracket",
        messageJa: "JTFスタイルガイドに基づき、かっこの内側にスペースを入れないでください。",
        from: m.index,
        to: m.index + 1,
        originalText: m[0],
        reference: { ...JTF_REFERENCE, section: "3.3.1" },
        fix: { label: "Remove space", labelJa: "スペースを削除", replacement: "" },
      });
    }

    return issues;
  }
}

/** JTF_3_3_brackets_fullwidth: Full-width brackets in Japanese context */
class JtfBracketsFullwidthRule extends AbstractL1Rule {
  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled) return [];
    const issues: LintIssue[] = [];

    // Half-width brackets adjacent to Japanese characters
    const pattern = new RegExp(`(?<=${JA_CHAR})[()\\[\\]｢｣]|[()\\[\\]｢｣](?=${JA_CHAR})`, "g");
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      const halfBracket = m[0];
      const fullBracket = HALF_TO_FULL_BRACKET.get(halfBracket) ?? halfBracket;
      if (fullBracket === halfBracket) continue; // no mapping found
      issues.push({
        ruleId: this.id,
        severity: config.severity,
        message: `Use full-width bracket instead of half-width: ${halfBracket} -> ${fullBracket}`,
        messageJa: `JTFスタイルガイドに基づき、半角かっこ（${halfBracket}）は全角（${fullBracket}）で表記してください。`,
        from: m.index,
        to: m.index + 1,
        originalText: halfBracket,
        reference: { ...JTF_REFERENCE, section: "3.3" },
        fix: {
          label: `Replace with ${fullBracket}`,
          labelJa: `「${fullBracket}」に置換`,
          replacement: fullBracket,
        },
      });
    }

    return issues;
  }
}

// ---- Unit rules category ----

/**
 * Generic unit rule factory helper.
 * Creates a rule that detects incorrect unit casing.
 */
function createUnitIssue(
  ruleId: string,
  severity: LintIssue["severity"],
  matched: string,
  correct: string,
  from: number,
  section: string,
): LintIssue {
  return {
    ruleId,
    severity,
    message: `Incorrect unit notation: ${matched} -> ${correct}`,
    messageJa: `JTFスタイルガイドに基づき、単位表記「${matched}」は「${correct}」と表記してください。`,
    from,
    to: from + matched.length,
    originalText: matched,
    reference: { ...JTF_REFERENCE, section },
    fix: {
      label: `Replace with ${correct}`,
      labelJa: `「${correct}」に置換`,
      replacement: correct,
    },
  };
}

/** JTF_4_3_2: Length units (m, cm, mm, km) */
class JtfLengthUnitRule extends AbstractL1Rule {
  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled) return [];
    const issues: LintIssue[] = [];

    // Wrong case patterns for length units (after digits)
    const wrongCases: Array<[RegExp, string]> = [
      [/(?<=\d\s*)MM\b/g, "mm"],
      [/(?<=\d\s*)CM\b/gi, "cm"],
      [/(?<=\d\s*)Cm\b/g, "cm"],
      [/(?<=\d\s*)KM\b/g, "km"],
      [/(?<=\d\s*)Km\b/g, "km"],
      [/(?<=\d\s*)M(?=[^a-zA-Z/²³]|$)/g, "m"], // Capital M alone (not MHz, etc.)
    ];

    for (const [pattern, correct] of wrongCases) {
      let m: RegExpExecArray | null;
      while ((m = pattern.exec(text)) !== null) {
        if (m[0] === correct) continue;
        issues.push(createUnitIssue(this.id, config.severity, m[0], correct, m.index, "4.3.2"));
      }
    }

    return issues;
  }
}

/** JTF_4_3_3: Mass units (g, kg, t) */
class JtfMassUnitRule extends AbstractL1Rule {
  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled) return [];
    const issues: LintIssue[] = [];

    const wrongCases: Array<[RegExp, string]> = [
      [/(?<=\d\s*)KG\b/g, "kg"],
      [/(?<=\d\s*)Kg\b/g, "kg"],
      [/(?<=\d\s*)MG\b/g, "mg"],
      [/(?<=\d\s*)Mg\b/g, "mg"],
      [/(?<=\d\s*)G(?=[^a-zA-Z]|$)/g, "g"], // Capital G alone
      [/(?<=\d\s*)Gr\b/gi, "g"],
    ];

    for (const [pattern, correct] of wrongCases) {
      let m: RegExpExecArray | null;
      while ((m = pattern.exec(text)) !== null) {
        if (m[0] === correct) continue;
        issues.push(createUnitIssue(this.id, config.severity, m[0], correct, m.index, "4.3.3"));
      }
    }

    return issues;
  }
}

/** JTF_4_3_4: Area/Volume units (m², m³, L, mL) */
class JtfAreaVolumeUnitRule extends AbstractL1Rule {
  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled) return [];
    const issues: LintIssue[] = [];

    // Detect "m2", "m3", "cm2", "km2" etc. (missing superscript)
    const superscriptPatterns: Array<[RegExp, string]> = [
      [/(?<=\d\s*)m2(?=[^0-9]|$)/g, "m\u00B2"],
      [/(?<=\d\s*)m3(?=[^0-9]|$)/g, "m\u00B3"],
      [/(?<=\d\s*)cm2(?=[^0-9]|$)/g, "cm\u00B2"],
      [/(?<=\d\s*)cm3(?=[^0-9]|$)/g, "cm\u00B3"],
      [/(?<=\d\s*)km2(?=[^0-9]|$)/g, "km\u00B2"],
    ];

    for (const [pattern, correct] of superscriptPatterns) {
      let m: RegExpExecArray | null;
      while ((m = pattern.exec(text)) !== null) {
        issues.push(createUnitIssue(this.id, config.severity, m[0], correct, m.index, "4.3.4"));
      }
    }

    // Detect wrong case for L/mL
    const volumePatterns: Array<[RegExp, string]> = [
      [/(?<=\d\s*)ML\b/g, "mL"],
      [/(?<=\d\s*)ml\b/g, "mL"],
      [/(?<=\d\s*)l(?=[^a-zA-Z]|$)/g, "L"], // lowercase l for liter
    ];

    for (const [pattern, correct] of volumePatterns) {
      let m: RegExpExecArray | null;
      while ((m = pattern.exec(text)) !== null) {
        if (m[0] === correct) continue;
        issues.push(createUnitIssue(this.id, config.severity, m[0], correct, m.index, "4.3.4"));
      }
    }

    return issues;
  }
}

/** JTF_4_3_5: Electrical units (V, A, W, kW, MW, mV, mA, kΩ) */
class JtfElectricalUnitRule extends AbstractL1Rule {
  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled) return [];
    const issues: LintIssue[] = [];

    const wrongCases: Array<[RegExp, string]> = [
      [/(?<=\d\s*)v(?=[^a-zA-Z]|$)/g, "V"],
      [/(?<=\d\s*)w(?=[^a-zA-Z]|$)/g, "W"],
      [/(?<=\d\s*)a(?=[^a-zA-Z]|$)/g, "A"],
      [/(?<=\d\s*)kw\b/gi, "kW"],
      [/(?<=\d\s*)KW\b/g, "kW"],
      [/(?<=\d\s*)mw\b/g, "mW"],
      [/(?<=\d\s*)MW(?=[^a-zA-Z]|$)/g, "MW"], // MW is correct, skip
      [/(?<=\d\s*)mv\b/g, "mV"],
      [/(?<=\d\s*)ma\b/g, "mA"],
    ];

    for (const [pattern, correct] of wrongCases) {
      let m: RegExpExecArray | null;
      while ((m = pattern.exec(text)) !== null) {
        if (m[0] === correct) continue;
        issues.push(createUnitIssue(this.id, config.severity, m[0], correct, m.index, "4.3.5"));
      }
    }

    return issues;
  }
}

/** JTF_4_3_6: Temperature unit (℃) */
class JtfTemperatureUnitRule extends AbstractL1Rule {
  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled) return [];
    const issues: LintIssue[] = [];

    // Detect °C (degree sign + C) which should be ℃ (U+2103)
    const pattern = /°C/g;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      issues.push({
        ruleId: this.id,
        severity: config.severity,
        message: "Use ℃ (U+2103) instead of °C (degree sign + C)",
        messageJa:
          "JTFスタイルガイドに基づき、温度の単位には「℃」（U+2103）を使用してください。「°C」（度記号＋C）は使いません。",
        from: m.index,
        to: m.index + 2,
        originalText: "°C",
        reference: { ...JTF_REFERENCE, section: "4.3.6" },
        fix: { label: "Replace with ℃", labelJa: "「℃」に置換", replacement: "℃" },
      });
    }

    return issues;
  }
}

/** JTF_4_3_7: Frequency units (Hz, kHz, MHz, GHz, THz) */
class JtfFrequencyUnitRule extends AbstractL1Rule {
  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled) return [];
    const issues: LintIssue[] = [];

    const wrongCases: Array<[RegExp, string]> = [
      [/(?<=\d\s*)hz\b/g, "Hz"],
      [/(?<=\d\s*)HZ\b/g, "Hz"],
      [/(?<=\d\s*)khz\b/gi, "kHz"],
      [/(?<=\d\s*)KHz\b/g, "kHz"],
      [/(?<=\d\s*)KHZ\b/g, "kHz"],
      [/(?<=\d\s*)mhz\b/g, "MHz"],
      [/(?<=\d\s*)MHZ\b/g, "MHz"],
      [/(?<=\d\s*)ghz\b/g, "GHz"],
      [/(?<=\d\s*)GHZ\b/g, "GHz"],
      [/(?<=\d\s*)thz\b/g, "THz"],
      [/(?<=\d\s*)THZ\b/g, "THz"],
    ];

    for (const [pattern, correct] of wrongCases) {
      let m: RegExpExecArray | null;
      while ((m = pattern.exec(text)) !== null) {
        if (m[0] === correct) continue;
        issues.push(createUnitIssue(this.id, config.severity, m[0], correct, m.index, "4.3.7"));
      }
    }

    return issues;
  }
}

/** JTF_4_3_8: Speed units (m/s, km/h) */
class JtfSpeedUnitRule extends AbstractL1Rule {
  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled) return [];
    const issues: LintIssue[] = [];

    const wrongCases: Array<[RegExp, string]> = [
      [/(?<=\d\s*)km\/H\b/g, "km/h"],
      [/(?<=\d\s*)KM\/H\b/gi, "km/h"],
      [/(?<=\d\s*)Km\/h\b/g, "km/h"],
      [/(?<=\d\s*)M\/S\b/g, "m/s"],
      [/(?<=\d\s*)M\/s\b/g, "m/s"],
      [/(?<=\d\s*)m\/S\b/g, "m/s"],
    ];

    for (const [pattern, correct] of wrongCases) {
      let m: RegExpExecArray | null;
      while ((m = pattern.exec(text)) !== null) {
        if (m[0] === correct) continue;
        issues.push(createUnitIssue(this.id, config.severity, m[0], correct, m.index, "4.3.8"));
      }
    }

    return issues;
  }
}

/** JTF_4_3_9: Data rate units (bps, kbps, Mbps, Gbps, Tbps) */
class JtfDataRateUnitRule extends AbstractL1Rule {
  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled) return [];
    const issues: LintIssue[] = [];

    const wrongCases: Array<[RegExp, string]> = [
      [/(?<=\d\s*)BPS\b/g, "bps"],
      [/(?<=\d\s*)Bps\b/g, "bps"],
      [/(?<=\d\s*)KBPS\b/gi, "kbps"],
      [/(?<=\d\s*)Kbps\b/g, "kbps"],
      [/(?<=\d\s*)MBPS\b/g, "Mbps"],
      [/(?<=\d\s*)mbps\b/g, "Mbps"],
      [/(?<=\d\s*)MBps\b/g, "Mbps"],
      [/(?<=\d\s*)GBPS\b/g, "Gbps"],
      [/(?<=\d\s*)gbps\b/g, "Gbps"],
      [/(?<=\d\s*)GBps\b/g, "Gbps"],
      [/(?<=\d\s*)TBPS\b/g, "Tbps"],
      [/(?<=\d\s*)tbps\b/g, "Tbps"],
    ];

    for (const [pattern, correct] of wrongCases) {
      let m: RegExpExecArray | null;
      while ((m = pattern.exec(text)) !== null) {
        if (m[0] === correct) continue;
        issues.push(createUnitIssue(this.id, config.severity, m[0], correct, m.index, "4.3.9"));
      }
    }

    return issues;
  }
}

// ============================================================================
// Rule ID → concrete class mapping
// ============================================================================

type RuleClassMap = Record<
  string,
  new (
    meta: JsonRuleMeta,
    config: ConstructorParameters<typeof AbstractL1Rule>[1],
  ) => AbstractL1Rule
>;

const IMPLEMENTED_RULES: RuleClassMap = {
  JTF_1_2_1: JtfPunctuationStandardRule,
  JTF_1_2_1_punctuation: JtfPunctuationReplacementRule,
  JTF_3_1_1: JtfKutenRule,
  JTF_3_1_1_kuten_brackets: JtfKutenBracketsRule,
  JTF_3_1_3: JtfPeriodCommaRule,
  JTF_2_1_5_fullwidth_kana: JtfFullwidthKanaRule,
  JTF_2_1_8: JtfNumericStandardRule,
  JTF_2_1_8_halfwidth_alnum: JtfHalfwidthAlnumRule,
  JTF_2_1_10_digit_comma: JtfDigitCommaRule,
  JTF_2_2_1_kanji: JtfKanjiRule,
  JTF_2_3_no_space: JtfNoSpaceRule,
  JTF_3_3_1_parentheses_space: JtfParenthesesSpaceRule,
  JTF_3_3_brackets_fullwidth: JtfBracketsFullwidthRule,
  JTF_4_3_2: JtfLengthUnitRule,
  JTF_4_3_3: JtfMassUnitRule,
  JTF_4_3_4: JtfAreaVolumeUnitRule,
  JTF_4_3_5: JtfElectricalUnitRule,
  JTF_4_3_6: JtfTemperatureUnitRule,
  JTF_4_3_7: JtfFrequencyUnitRule,
  JTF_4_3_8: JtfSpeedUnitRule,
  JTF_4_3_9: JtfDataRateUnitRule,
};

// ============================================================================
// Factory function
// ============================================================================

/**
 * Convert a JSON rule ID to the exported lint rule ID.
 */
function toRuleId(ruleId: string): string {
  return `jtf-${ruleId.replace(/^JTF_/, "").replace(/_/g, "-").toLowerCase()}`;
}

/**
 * Create all implementable JTF L1 rules.
 */
export function createJtfL1Rules(): AbstractL1Rule[] {
  const jtfRules = getJsonRulesByBook("JTF 日本語標準スタイルガイド");
  const l1Rules = jtfRules.filter(
    (rule) => rule.Level === "L1" && !rule["Pattern/Logic"].startsWith("TODO"),
  );

  const result: AbstractL1Rule[] = [];

  for (const entry of l1Rules) {
    const meta = toMeta(entry);
    const RuleClass = IMPLEMENTED_RULES[entry.Rule_ID];

    if (!RuleClass) continue; // skip rules without implementation
    result.push(
      new RuleClass(meta, {
        id: toRuleId(entry.Rule_ID),
        name: entry.Description,
        nameJa: entry.Description,
        description: entry.Description,
        descriptionJa: entry.Description,
        defaultConfig: { enabled: true, severity: "warning" },
      }),
    );
  }

  return result;
}
