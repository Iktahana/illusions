/**
 * 日本語表記 L1 Rules
 *
 * Implements rules from 日本エディタースクール「日本語表記ルールブック」.
 * These L1 rules use regex patterns for formatting and notation checks.
 */

import { AbstractL1Rule } from "../../base-rule";
import type { JsonRuleMeta, LintIssue, LintRuleConfig, LintReference } from "../../types";
import { getJsonRulesByBook } from "../../rule-loader";

/** Standard reference for 日本語表記ルールブック */
const NH_REF: LintReference = {
  standard: "日本語表記ルールブック",
  url: "",
};

/**
 * Helper to find a rule entry from rules.json by Rule_ID.
 */
function findRuleMeta(ruleId: string): JsonRuleMeta {
  const rules = getJsonRulesByBook("日本語表記");
  const entry = rules.find((r) => r.Rule_ID === ruleId);
  if (!entry) {
    throw new Error(`Rule ${ruleId} not found in rules.json`);
  }
  return {
    ruleId: entry.Rule_ID,
    level: entry.Level as "L1",
    description: entry.Description,
    patternLogic: entry["Pattern/Logic"],
    positiveExample: entry.Positive_Example,
    negativeExample: entry.Negative_Example,
    sourceReference: entry.Source_Reference,
    bookTitle: "日本語表記",
  };
}

// ═══════════════════════════════════════════════════════════════════
// Rule: nihongo_hyouki_6_ji_zu_di_du_exceptions
// ═══════════════════════════════════════════════════════════════════

/**
 * Words that must use ぢ・づ (not じ・ず).
 * These are exceptions to the general modern kana rule.
 * Each entry: { wrong: incorrect form, correct: correct form, word: kanji }
 */
const DIZU_EXCEPTIONS: ReadonlyArray<{
  wrong: string;
  correct: string;
  word: string;
}> = [
  // 同音の連呼 (rendaku from same sound)
  { wrong: "ちじむ", correct: "ちぢむ", word: "縮む" },
  { wrong: "ちじめる", correct: "ちぢめる", word: "縮める" },
  { wrong: "ちじれる", correct: "ちぢれる", word: "縮れる" },
  { wrong: "ちじこまる", correct: "ちぢこまる", word: "縮こまる" },
  { wrong: "つずく", correct: "つづく", word: "続く" },
  { wrong: "つずける", correct: "つづける", word: "続ける" },
  { wrong: "つずり", correct: "つづり", word: "綴り" },
  { wrong: "つずる", correct: "つづる", word: "綴る" },
  // 二語の連合 (compound words where づ/ぢ comes from rendaku)
  { wrong: "はなじ", correct: "はなぢ", word: "鼻血" },
  { wrong: "こずかい", correct: "こづかい", word: "小遣い" },
  { wrong: "みかずき", correct: "みかづき", word: "三日月" },
  { wrong: "もとずく", correct: "もとづく", word: "基づく" },
  { wrong: "うなずく", correct: "うなづく", word: "頷く" },
  { wrong: "ちかずく", correct: "ちかづく", word: "近づく" },
  { wrong: "きずく", correct: "きづく", word: "気づく" },
  { wrong: "かたずく", correct: "かたづく", word: "片付く" },
  { wrong: "てつずき", correct: "てつづき", word: "手続き" },
  { wrong: "こころずかい", correct: "こころづかい", word: "心遣い" },
  { wrong: "こずつみ", correct: "こづつみ", word: "小包" },
  // Words that incorrectly use ぢ/づ (should use じ/ず)
  { wrong: "いちぢく", correct: "いちじく", word: "無花果" },
  { wrong: "ぢめん", correct: "じめん", word: "地面" },
  { wrong: "ぢしん", correct: "じしん", word: "地震" },
  { wrong: "ぬのぢ", correct: "ぬのじ", word: "布地" },
];

class JiZuDiDuExceptionsRule extends AbstractL1Rule {
  constructor() {
    super(findRuleMeta("nihongo_hyouki_6_ji_zu_di_du_exceptions"), {
      id: "nh-ji-zu-di-du-exceptions",
      name: "Ji/zu and di/du kana exceptions",
      nameJa: "「じ・ず」と「ぢ・づ」の例外",
      description:
        "Detects words where ぢ/づ or じ/ず is used incorrectly per modern kana rules",
      descriptionJa:
        "現代仮名遣いにおける「じ・ず」と「ぢ・づ」の例外的な語彙をチェックします",
      defaultConfig: {
        enabled: true,
        severity: "error",
      },
    });
  }

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled || !text) return [];
    const issues: LintIssue[] = [];

    for (const { wrong, correct, word } of DIZU_EXCEPTIONS) {
      const re = new RegExp(wrong, "g");
      for (const match of text.matchAll(re)) {
        if (match.index === undefined) continue;
        issues.push({
          ruleId: this.id,
          severity: config.severity,
          message: `Incorrect kana: "${wrong}" should be "${correct}" (${word})`,
          messageJa: `日本語表記ルールブックに基づき、「${wrong}」は「${correct}」（${word}）と表記してください`,
          from: match.index,
          to: match.index + wrong.length,
          originalText: wrong,
          reference: { ...NH_REF, section: "p.27" },
          fix: {
            label: `Replace with "${correct}"`,
            labelJa: `「${correct}」に修正`,
            replacement: correct,
          },
        });
      }
    }

    return issues;
  }
}

// ═══════════════════════════════════════════════════════════════════
// Rule: nihongo_hyouki_6 (TODO stub)
// ═══════════════════════════════════════════════════════════════════

class GendaiKanazukaiNotesStubRule extends AbstractL1Rule {
  constructor() {
    super(findRuleMeta("nihongo_hyouki_6"), {
      id: "nh-gendai-kanazukai-notes",
      name: "Modern kana usage notes",
      nameJa: "現代仮名遣いの注意点",
      description: "General modern kana usage checks (not yet implemented)",
      descriptionJa: "現代仮名遣いの一般的な注意点をチェックします（未実装）",
      defaultConfig: {
        enabled: false, // Disabled by default — stub only
        severity: "warning",
      },
    });
  }

  /** Stub: returns no issues */
  lint(_text: string, _config: LintRuleConfig): LintIssue[] {
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════
// Rule: nihongo_hyouki_7_compound_nouns_no_okurigana
// ═══════════════════════════════════════════════════════════════════

/**
 * Compound nouns where okurigana should NOT be attached.
 * Each entry: { wrong: form with okurigana, correct: form without, reading: reading }
 */
const COMPOUND_NO_OKURIGANA: ReadonlyArray<{
  wrong: string;
  correct: string;
  reading: string;
}> = [
  // 役職・身分
  { wrong: "取り締まり役", correct: "取締役", reading: "とりしまりやく" },
  { wrong: "事務取り扱い", correct: "事務取扱", reading: "じむとりあつかい" },
  // 日常語
  { wrong: "日付け", correct: "日付", reading: "ひづけ" },
  { wrong: "受け付け", correct: "受付", reading: "うけつけ" },
  { wrong: "受付け", correct: "受付", reading: "うけつけ" },
  { wrong: "物語り", correct: "物語", reading: "ものがたり" },
  { wrong: "献立て", correct: "献立", reading: "こんだて" },
  { wrong: "見積り", correct: "見積", reading: "みつもり" },
  { wrong: "見積もり", correct: "見積", reading: "みつもり" },
  { wrong: "申し込み", correct: "申込", reading: "もうしこみ" },
  { wrong: "申込み", correct: "申込", reading: "もうしこみ" },
  { wrong: "払い戻し", correct: "払戻", reading: "はらいもどし" },
  { wrong: "払戻し", correct: "払戻", reading: "はらいもどし" },
  { wrong: "差し出し人", correct: "差出人", reading: "さしだしにん" },
  { wrong: "振り替え", correct: "振替", reading: "ふりかえ" },
  { wrong: "振替え", correct: "振替", reading: "ふりかえ" },
  { wrong: "組み合わせ", correct: "組合せ", reading: "くみあわせ" },
  { wrong: "売り上げ", correct: "売上", reading: "うりあげ" },
  { wrong: "売上げ", correct: "売上", reading: "うりあげ" },
  { wrong: "切り捨て", correct: "切捨", reading: "きりすて" },
  { wrong: "切捨て", correct: "切捨", reading: "きりすて" },
  { wrong: "取り消し", correct: "取消", reading: "とりけし" },
  { wrong: "取消し", correct: "取消", reading: "とりけし" },
];

class CompoundNounOkuriganaRule extends AbstractL1Rule {
  constructor() {
    super(findRuleMeta("nihongo_hyouki_7_compound_nouns_no_okurigana"), {
      id: "nh-compound-noun-okurigana",
      name: "Compound noun okurigana omission",
      nameJa: "複合名詞の送り仮名省略",
      description:
        "Detects compound nouns where okurigana should be omitted per convention",
      descriptionJa:
        "慣用が固定しているため送り仮名を付けない複合名詞をチェックします",
      defaultConfig: {
        enabled: true,
        severity: "warning",
      },
    });
  }

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled || !text) return [];
    const issues: LintIssue[] = [];

    for (const { wrong, correct, reading } of COMPOUND_NO_OKURIGANA) {
      const re = new RegExp(this.escapeRegex(wrong), "g");
      for (const match of text.matchAll(re)) {
        if (match.index === undefined) continue;
        issues.push({
          ruleId: this.id,
          severity: config.severity,
          message: `Compound noun "${wrong}" should be written as "${correct}" (${reading})`,
          messageJa: `日本語表記ルールブックに基づき、「${wrong}」は慣用的に「${correct}」と表記します`,
          from: match.index,
          to: match.index + wrong.length,
          originalText: wrong,
          reference: { ...NH_REF, section: "p.33-34" },
          fix: {
            label: `Replace with "${correct}"`,
            labelJa: `「${correct}」に修正`,
            replacement: correct,
          },
        });
      }
    }

    return issues;
  }

  /** Escape special regex characters in a string */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}

// ═══════════════════════════════════════════════════════════════════
// Rule: nihongo_hyouki_9 — Number format
// ═══════════════════════════════════════════════════════════════════

class NumberFormatRule extends AbstractL1Rule {
  constructor() {
    super(findRuleMeta("nihongo_hyouki_9"), {
      id: "nh-number-format",
      name: "Number format (half-width Arabic)",
      nameJa: "数字の表記（半角アラビア数字）",
      description:
        "Detects full-width digits and suggests half-width replacements",
      descriptionJa:
        "全角数字を検出し、半角アラビア数字への修正を提案します",
      defaultConfig: {
        enabled: true,
        severity: "warning",
      },
    });
  }

  /** Full-width to half-width digit mapping */
  private static readonly FULLWIDTH_MAP: ReadonlyMap<string, string> = new Map([
    ["０", "0"], ["１", "1"], ["２", "2"], ["３", "3"], ["４", "4"],
    ["５", "5"], ["６", "6"], ["７", "7"], ["８", "8"], ["９", "9"],
  ]);

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled || !text) return [];
    const issues: LintIssue[] = [];

    // Match runs of consecutive full-width digits
    const re = /[０-９]+/g;
    for (const match of text.matchAll(re)) {
      if (match.index === undefined) continue;
      const fullWidth = match[0];
      const halfWidth = [...fullWidth]
        .map((ch) => NumberFormatRule.FULLWIDTH_MAP.get(ch) ?? ch)
        .join("");

      issues.push({
        ruleId: this.id,
        severity: config.severity,
        message: `Full-width digits "${fullWidth}" should be half-width "${halfWidth}"`,
        messageJa: `日本語表記ルールブックに基づき、全角数字「${fullWidth}」は半角「${halfWidth}」で表記してください`,
        from: match.index,
        to: match.index + fullWidth.length,
        originalText: fullWidth,
        reference: { ...NH_REF, section: "p.42" },
        fix: {
          label: `Replace with "${halfWidth}"`,
          labelJa: `半角「${halfWidth}」に修正`,
          replacement: halfWidth,
        },
      });
    }

    return issues;
  }
}

// ═══════════════════════════════════════════════════════════════════
// Rule: nihongo_hyouki_10 — Unit symbols
// ═══════════════════════════════════════════════════════════════════

class UnitSymbolRule extends AbstractL1Rule {
  constructor() {
    super(findRuleMeta("nihongo_hyouki_10"), {
      id: "nh-unit-symbol",
      name: "Unit symbol format (half-width)",
      nameJa: "単位記号の表記（半角英字）",
      description:
        "Detects full-width unit symbols and suggests half-width replacements",
      descriptionJa:
        "全角の単位記号を検出し、半角英字への修正を提案します",
      defaultConfig: {
        enabled: true,
        severity: "warning",
      },
    });
  }

  /** Full-width to half-width letter mapping (A-Z, a-z) */
  private toHalfWidth(ch: string): string {
    const code = ch.charCodeAt(0);
    // Full-width uppercase: Ａ(0xFF21) - Ｚ(0xFF3A) → A(0x41) - Z(0x5A)
    if (code >= 0xFF21 && code <= 0xFF3A) {
      return String.fromCharCode(code - 0xFF21 + 0x41);
    }
    // Full-width lowercase: ａ(0xFF41) - ｚ(0xFF5A) → a(0x61) - z(0x7A)
    if (code >= 0xFF41 && code <= 0xFF5A) {
      return String.fromCharCode(code - 0xFF41 + 0x61);
    }
    return ch;
  }

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled || !text) return [];
    const issues: LintIssue[] = [];

    // Match runs of full-width alphabetic characters (likely unit symbols)
    // Pattern: [number or half-width digit] followed by full-width letters,
    // or standalone full-width letters that look like units
    const re = /[Ａ-Ｚａ-ｚ]+/g;
    for (const match of text.matchAll(re)) {
      if (match.index === undefined) continue;
      const fullWidth = match[0];
      const halfWidth = [...fullWidth].map((ch) => this.toHalfWidth(ch)).join("");

      issues.push({
        ruleId: this.id,
        severity: config.severity,
        message: `Full-width letters "${fullWidth}" should be half-width "${halfWidth}"`,
        messageJa: `日本語表記ルールブックに基づき、全角英字「${fullWidth}」は半角「${halfWidth}」で表記してください`,
        from: match.index,
        to: match.index + fullWidth.length,
        originalText: fullWidth,
        reference: { ...NH_REF, section: "p.48" },
        fix: {
          label: `Replace with "${halfWidth}"`,
          labelJa: `半角「${halfWidth}」に修正`,
          replacement: halfWidth,
        },
      });
    }

    return issues;
  }
}

// ═══════════════════════════════════════════════════════════════════
// Rule: nihongo_hyouki_11 — Quotation marks and symbols
// ═══════════════════════════════════════════════════════════════════

class DescriptiveSymbolRule extends AbstractL1Rule {
  constructor() {
    super(findRuleMeta("nihongo_hyouki_11"), {
      id: "nh-descriptive-symbols",
      name: "Descriptive symbols (quotes, ellipsis, dash)",
      nameJa: "記述記号（引用符・省略記号・ダッシュ）",
      description:
        "Detects incorrect use of quotation marks, ellipsis, and dashes in Japanese text",
      descriptionJa:
        "日本語文中の引用符・省略記号・ダッシュの誤用を検出します",
      defaultConfig: {
        enabled: true,
        severity: "warning",
      },
    });
  }

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled || !text) return [];
    const issues: LintIssue[] = [];

    issues.push(
      ...this.checkAsciiDoubleQuotes(text, config.severity),
      ...this.checkAsciiEllipsis(text, config.severity),
      ...this.checkAsciiDash(text, config.severity),
    );

    return issues;
  }

  /**
   * Check for ASCII double quotes ("...") in Japanese text.
   * Japanese text should use 「」 for quotes.
   *
   * We only flag when the content between quotes contains Japanese characters,
   * to avoid false positives on English text or code.
   */
  private checkAsciiDoubleQuotes(text: string, severity: LintRuleConfig["severity"]): LintIssue[] {
    const issues: LintIssue[] = [];
    // Match "..." where content contains at least one Japanese character
    const jpChar = /[\u3000-\u9FFF\uF900-\uFAFF]/;
    const re = /"([^"]*?)"/g;

    for (const match of text.matchAll(re)) {
      if (match.index === undefined) continue;
      const content = match[1];
      // Only flag if the quoted content contains Japanese characters
      if (!jpChar.test(content)) continue;

      const fullMatch = match[0];
      const replacement = `「${content}」`;

      issues.push({
        ruleId: this.id,
        severity,
        message: `ASCII double quotes should be replaced with 「」 in Japanese text`,
        messageJa: `日本語表記ルールブックに基づき、日本語文中では「」を使用してください（""は使いません）`,
        from: match.index,
        to: match.index + fullMatch.length,
        originalText: fullMatch,
        reference: { ...NH_REF, section: "p.54" },
        fix: {
          label: 'Replace with 「」',
          labelJa: '「」に修正',
          replacement,
        },
      });
    }

    return issues;
  }

  /**
   * Check for ASCII period ellipsis (...) which should be ……
   * (two full-width ellipsis characters).
   *
   * Matches 3 or more consecutive ASCII periods.
   */
  private checkAsciiEllipsis(text: string, severity: LintRuleConfig["severity"]): LintIssue[] {
    const issues: LintIssue[] = [];
    // Match 3+ consecutive ASCII periods
    const re = /\.{3,}/g;

    for (const match of text.matchAll(re)) {
      if (match.index === undefined) continue;

      // Skip if preceded by a digit or letter (likely a decimal / URL)
      if (match.index > 0) {
        const prev = text[match.index - 1];
        if (/[a-zA-Z0-9]/.test(prev)) continue;
      }

      const fullMatch = match[0];

      issues.push({
        ruleId: this.id,
        severity,
        message: `ASCII ellipsis "${fullMatch}" should be "……" (two full-width ellipsis)`,
        messageJa: `日本語表記ルールブックに基づき、省略記号には「……」（全角三点リーダ2つ）を使用してください`,
        from: match.index,
        to: match.index + fullMatch.length,
        originalText: fullMatch,
        reference: { ...NH_REF, section: "p.54" },
        fix: {
          label: 'Replace with ……',
          labelJa: '「……」に修正',
          replacement: "……",
        },
      });
    }

    return issues;
  }

  /**
   * Check for ASCII double dash (--) which should be ——
   * (two full-width em dashes).
   *
   * Only flags exactly two consecutive hyphens (not 3+, which may be
   * markdown horizontal rules or other syntax).
   */
  private checkAsciiDash(text: string, severity: LintRuleConfig["severity"]): LintIssue[] {
    const issues: LintIssue[] = [];
    const re = /--/g;

    for (const match of text.matchAll(re)) {
      if (match.index === undefined) continue;
      const pos = match.index;

      // Skip if part of a longer hyphen run (--- or more)
      if (pos + 2 < text.length && text[pos + 2] === "-") continue;
      if (pos > 0 && text[pos - 1] === "-") continue;

      issues.push({
        ruleId: this.id,
        severity,
        message: `ASCII dash "--" should be "——" (two em dashes) in Japanese text`,
        messageJa: `日本語表記ルールブックに基づき、ダッシュには「——」（全角ダッシュ2つ）を使用してください`,
        from: pos,
        to: pos + 2,
        originalText: "--",
        reference: { ...NH_REF, section: "p.54" },
        fix: {
          label: 'Replace with ——',
          labelJa: '「——」に修正',
          replacement: "——",
        },
      });
    }

    return issues;
  }
}

// ─── Factory function ──────────────────────────────────────────────

/**
 * Create all 日本語表記 L1 rules.
 * Returns 5 active rules + 1 disabled stub:
 * - ji/zu di/du exceptions
 * - gendai-kanazukai notes (stub, disabled)
 * - compound noun okurigana omission
 * - number format (full-width → half-width)
 * - unit symbols (full-width → half-width)
 * - descriptive symbols (quotes, ellipsis, dash)
 */
export function createNihongoHyoukiL1Rules(): AbstractL1Rule[] {
  return [
    new JiZuDiDuExceptionsRule(),
    new GendaiKanazukaiNotesStubRule(),
    new CompoundNounOkuriganaRule(),
    new NumberFormatRule(),
    new UnitSymbolRule(),
    new DescriptiveSymbolRule(),
  ];
}
