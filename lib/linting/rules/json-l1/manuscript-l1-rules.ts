/**
 * Manuscript Editing 2nd Edition (原稿編集 第2版) L1 rules.
 *
 * Data-driven L1 rules from rules.json, book: "原稿編集 第2版".
 * Reference: 日本エディタースクール (2021), ISBN 978-4-88888-404-2.
 */

import { AbstractL1Rule } from "../../base-rule";
import { getJsonRulesByBook } from "../../rule-loader";
import type { JsonRuleEntry } from "../../rule-loader";
import type { JsonRuleMeta, LintIssue, LintRuleConfig, LintReference } from "../../types";

// ---------------------------------------------------------------------------
// Shared reference
// ---------------------------------------------------------------------------

const ME2_REF: LintReference = {
  standard: "原稿編集 第2版",
};

/** Convert a JsonRuleEntry to JsonRuleMeta */
function toMeta(entry: JsonRuleEntry, bookTitle: string): JsonRuleMeta {
  return {
    ruleId: entry.Rule_ID,
    level: entry.Level as "L1" | "L2" | "L3",
    description: entry.Description,
    patternLogic: entry["Pattern/Logic"],
    positiveExample: entry.Positive_Example,
    negativeExample: entry.Negative_Example,
    sourceReference: entry.Source_Reference,
    bookTitle,
  };
}

// ---------------------------------------------------------------------------
// ME2_4: Old-form Kanji Detection (旧字体検出)
// ---------------------------------------------------------------------------

/**
 * Mapping of old-form kanji (旧字体) to new-form kanji (新字体).
 * Based on Joyo Kanji table differences between traditional and standard forms.
 */
const OLD_TO_NEW_KANJI: ReadonlyMap<string, string> = new Map([
  // Common old-form to new-form mappings
  ["榮", "栄"], ["衞", "衛"], ["曉", "暁"], ["嶋", "島"], ["盃", "杯"], ["冨", "富"],
  ["國", "国"], ["學", "学"], ["會", "会"], ["區", "区"], ["廳", "庁"], ["體", "体"],
  ["舊", "旧"], ["號", "号"], ["實", "実"], ["寫", "写"], ["將", "将"], ["專", "専"],
  ["戰", "戦"], ["經", "経"], ["齊", "斉"], ["藝", "芸"], ["勞", "労"], ["靈", "霊"],
  ["聲", "声"], ["寶", "宝"], ["鐵", "鉄"], ["關", "関"], ["驛", "駅"], ["歷", "歴"],
  ["鹽", "塩"], ["藥", "薬"], ["權", "権"], ["齒", "歯"], ["賣", "売"], ["圓", "円"],
  ["黨", "党"], ["點", "点"], ["飮", "飲"], ["佛", "仏"], ["邊", "辺"], ["假", "仮"],
  ["價", "価"], ["單", "単"], ["氣", "気"], ["眞", "真"], ["傳", "伝"], ["豐", "豊"],
  ["發", "発"], ["辯", "弁"], ["瓣", "弁"], ["辨", "弁"], ["辮", "弁"],
  ["證", "証"], ["顯", "顕"], ["樂", "楽"], ["繪", "絵"], ["繩", "縄"],
  ["讀", "読"], ["萬", "万"], ["變", "変"], ["處", "処"], ["獨", "独"],
  ["惡", "悪"], ["壓", "圧"], ["圍", "囲"], ["壹", "壱"], ["逸", "逸"],
  ["穩", "穏"], ["假", "仮"], ["殼", "殻"], ["卷", "巻"], ["嚴", "厳"],
  ["險", "険"], ["檢", "検"], ["獻", "献"], ["廣", "広"], ["濟", "済"],
  ["雜", "雑"], ["殘", "残"], ["絲", "糸"], ["濕", "湿"], ["從", "従"],
  ["縱", "縦"], ["燒", "焼"], ["條", "条"], ["淨", "浄"], ["劍", "剣"],
  ["壯", "壮"], ["爭", "争"], ["藏", "蔵"], ["屬", "属"], ["對", "対"],
  ["擇", "択"], ["擔", "担"], ["斷", "断"], ["遲", "遅"], ["晝", "昼"],
  ["聽", "聴"], ["遞", "逓"], ["轉", "転"], ["當", "当"], ["屆", "届"],
  ["腦", "脳"], ["廢", "廃"], ["麥", "麦"], ["拂", "払"], ["佛", "仏"],
  ["竝", "並"], ["餠", "餅"], ["禮", "礼"], ["靈", "霊"], ["爐", "炉"],
  ["灣", "湾"], ["惠", "恵"], ["攝", "摂"], ["增", "増"],
]);

/** Build a regex that matches any old-form kanji */
const OLD_KANJI_PATTERN = new RegExp(
  `[${[...OLD_TO_NEW_KANJI.keys()].join("")}]`,
  "g",
);

class ME2_4_KanjiFontRule extends AbstractL1Rule {
  constructor(meta: JsonRuleMeta) {
    super(meta, {
      id: "me2-kanji-font",
      name: "Old-form Kanji Detection",
      nameJa: "旧字体検出",
      description: "Detect old-form kanji and suggest standard forms",
      descriptionJa: "常用漢字表の通用字体を使用し、旧字体を検出します",
      defaultConfig: { enabled: true, severity: "warning" },
    });
  }

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled || !text) return [];

    const issues: LintIssue[] = [];
    for (const match of text.matchAll(OLD_KANJI_PATTERN)) {
      if (match.index === undefined) continue;
      const oldChar = match[0];
      const newChar = OLD_TO_NEW_KANJI.get(oldChar);
      if (!newChar) continue;

      issues.push({
        ruleId: this.id,
        severity: config.severity,
        message: `Old-form kanji "${oldChar}" detected; use standard form "${newChar}" (原稿編集 第2版 ${this.meta.sourceReference})`,
        messageJa: `原稿編集 第2版に基づき、旧字体「${oldChar}」を通用字体「${newChar}」に修正してください`,
        from: match.index,
        to: match.index + 1,
        originalText: oldChar,
        reference: { ...ME2_REF, section: this.meta.sourceReference },
        fix: {
          label: `Replace "${oldChar}" with "${newChar}"`,
          labelJa: `「${oldChar}」を「${newChar}」に置換`,
          replacement: newChar,
        },
      });
    }
    return issues;
  }
}

// ---------------------------------------------------------------------------
// ME2_8: Katakana for Foreign Words (外来語・擬音語の片仮名表記)
// ---------------------------------------------------------------------------

/**
 * Common onomatopoeia written in hiragana that should be katakana.
 * Only flag clear-cut cases to reduce false positives.
 */
const HIRAGANA_ONOMATOPOEIA: ReadonlyMap<string, string> = new Map([
  ["わんわん", "ワンワン"], ["にゃーにゃー", "ニャーニャー"],
  ["がたがた", "ガタガタ"], ["ばたばた", "バタバタ"],
  ["ごろごろ", "ゴロゴロ"], ["ぴかぴか", "ピカピカ"],
  ["ぎらぎら", "ギラギラ"], ["どんどん", "ドンドン"],
  ["ばんばん", "バンバン"], ["ぱちぱち", "パチパチ"],
]);

/**
 * Common foreign loanwords sometimes incorrectly written in hiragana.
 * Keep this list conservative to avoid false positives.
 */
const HIRAGANA_LOANWORDS: ReadonlyMap<string, string> = new Map([
  ["すきゃなー", "スキャナー"], ["こんぴゅーたー", "コンピューター"],
  ["ぱそこん", "パソコン"], ["てれび", "テレビ"],
  ["らじお", "ラジオ"], ["たばこ", "タバコ"],
  ["えねるぎー", "エネルギー"], ["あるばいと", "アルバイト"],
]);

class ME2_8_KatakanaForeignRule extends AbstractL1Rule {
  private patterns: ReadonlyArray<[RegExp, string, string]>;

  constructor(meta: JsonRuleMeta) {
    super(meta, {
      id: "me2-katakana-foreign",
      name: "Katakana for Foreign Words",
      nameJa: "外来語・擬音語の片仮名表記",
      description: "Foreign words and onomatopoeia should use katakana",
      descriptionJa: "外来語・擬声語・擬音語は片仮名で表記します",
      defaultConfig: { enabled: true, severity: "info" },
    });

    // Build patterns from maps
    const entries: Array<[RegExp, string, string]> = [];
    for (const [hiragana, katakana] of HIRAGANA_ONOMATOPOEIA) {
      entries.push([new RegExp(hiragana, "g"), hiragana, katakana]);
    }
    for (const [hiragana, katakana] of HIRAGANA_LOANWORDS) {
      entries.push([new RegExp(hiragana, "g"), hiragana, katakana]);
    }
    this.patterns = entries;
  }

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled || !text) return [];

    const issues: LintIssue[] = [];
    for (const [regex, hiragana, katakana] of this.patterns) {
      // Reset lastIndex for global regex
      regex.lastIndex = 0;
      for (const match of text.matchAll(regex)) {
        if (match.index === undefined) continue;
        issues.push({
          ruleId: this.id,
          severity: config.severity,
          message: `"${hiragana}" should be written in katakana as "${katakana}" (原稿編集 第2版 ${this.meta.sourceReference})`,
          messageJa: `原稿編集 第2版に基づき、「${hiragana}」は片仮名「${katakana}」で表記してください`,
          from: match.index,
          to: match.index + hiragana.length,
          originalText: hiragana,
          reference: { ...ME2_REF, section: this.meta.sourceReference },
          fix: {
            label: `Replace with "${katakana}"`,
            labelJa: `「${katakana}」に置換`,
            replacement: katakana,
          },
        });
      }
    }
    return issues;
  }
}

// ---------------------------------------------------------------------------
// ME2_9: Foreign Word Long Vowel Mark (外来語末尾の長音符号)
// ---------------------------------------------------------------------------

/**
 * Common foreign loanwords that should keep the trailing long vowel mark.
 * Pattern: 3+ mora katakana words ending without "ー" where it should be present.
 */
const MISSING_CHOUON: ReadonlyMap<string, string> = new Map([
  ["スキャナ", "スキャナー"], ["コンピュータ", "コンピューター"],
  ["フォルダ", "フォルダー"], ["プリンタ", "プリンター"],
  ["サーバ", "サーバー"], ["ブラウザ", "ブラウザー"],
  ["ドライバ", "ドライバー"], ["マネージャ", "マネージャー"],
  ["プレーヤ", "プレーヤー"], ["メモリ", "メモリー"],
  ["カテゴリ", "カテゴリー"], ["エネルギ", "エネルギー"],
  ["タイマ", "タイマー"], ["モニタ", "モニター"],
  ["バッファ", "バッファー"], ["レジスタ", "レジスター"],
  ["パラメタ", "パラメーター"], ["プロセッサ", "プロセッサー"],
  ["コントローラ", "コントローラー"], ["コンテナ", "コンテナー"],
  ["カウンタ", "カウンター"], ["アダプタ", "アダプター"],
  ["スピーカ", "スピーカー"], ["センサ", "センサー"],
  ["フィルタ", "フィルター"], ["ルータ", "ルーター"],
  ["ユーザ", "ユーザー"], ["トリガ", "トリガー"],
  ["ヘッダ", "ヘッダー"], ["フッタ", "フッター"],
]);

class ME2_9_ForeignWordLongVowelRule extends AbstractL1Rule {
  private patterns: ReadonlyArray<[RegExp, string, string]>;

  constructor(meta: JsonRuleMeta) {
    super(meta, {
      id: "me2-foreign-long-vowel",
      name: "Foreign Word Long Vowel Mark",
      nameJa: "外来語末尾の長音符号",
      description: "Foreign words ending in -er/-or/-ar should keep long vowel mark",
      descriptionJa: "3音以上の外来語の末尾の長音符号「ー」を省略しません",
      defaultConfig: { enabled: true, severity: "warning" },
    });

    // Build patterns: match the short form NOT followed by ー
    const entries: Array<[RegExp, string, string]> = [];
    for (const [short, long] of MISSING_CHOUON) {
      // Match the short form when NOT followed by ー (negative lookahead)
      entries.push([new RegExp(`${short}(?!ー)`, "g"), short, long]);
    }
    this.patterns = entries;
  }

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled || !text) return [];

    const issues: LintIssue[] = [];
    for (const [regex, short, long] of this.patterns) {
      regex.lastIndex = 0;
      for (const match of text.matchAll(regex)) {
        if (match.index === undefined) continue;
        issues.push({
          ruleId: this.id,
          severity: config.severity,
          message: `"${short}" should include long vowel mark: "${long}" (原稿編集 第2版 ${this.meta.sourceReference})`,
          messageJa: `原稿編集 第2版に基づき、「${short}」は長音符号を付けて「${long}」と表記してください`,
          from: match.index,
          to: match.index + short.length,
          originalText: short,
          reference: { ...ME2_REF, section: this.meta.sourceReference },
          fix: {
            label: `Replace with "${long}"`,
            labelJa: `「${long}」に置換`,
            replacement: long,
          },
        });
      }
    }
    return issues;
  }
}

// ---------------------------------------------------------------------------
// ME2_11: Vertical Text Kanji Numerals (縦組の漢数字)
// ---------------------------------------------------------------------------

/**
 * Detect Arabic numerals in text (for vertical text mode).
 * Only flags sequences of digits, since the user must opt-in to vertical mode.
 */
const ARABIC_NUMERAL_PATTERN = /\d+/g;

/** Simple Arabic-to-kanji digit map */
const ARABIC_TO_KANJI: Record<string, string> = {
  "0": "〇", "1": "一", "2": "二", "3": "三", "4": "四",
  "5": "五", "6": "六", "7": "七", "8": "八", "9": "九",
};

function arabicToKanjiNumerals(arabic: string): string {
  return arabic.split("").map((ch) => ARABIC_TO_KANJI[ch] ?? ch).join("");
}

class ME2_11_VerticalNumbersRule extends AbstractL1Rule {
  constructor(meta: JsonRuleMeta) {
    super(meta, {
      id: "me2-vertical-numbers",
      name: "Kanji Numerals in Vertical Text",
      nameJa: "縦組の漢数字使用",
      description: "Vertical text should use kanji numerals instead of Arabic",
      descriptionJa: "縦組では漢数字を使用します",
      defaultConfig: { enabled: false, severity: "info" },
    });
  }

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled || !text) return [];

    const issues: LintIssue[] = [];
    for (const match of text.matchAll(ARABIC_NUMERAL_PATTERN)) {
      if (match.index === undefined) continue;
      const arabic = match[0];
      const kanji = arabicToKanjiNumerals(arabic);

      issues.push({
        ruleId: this.id,
        severity: config.severity,
        message: `Arabic numeral "${arabic}" found; consider kanji "${kanji}" for vertical text (原稿編集 第2版 ${this.meta.sourceReference})`,
        messageJa: `原稿編集 第2版に基づき、縦組では「${arabic}」を漢数字「${kanji}」で表記してください`,
        from: match.index,
        to: match.index + arabic.length,
        originalText: arabic,
        reference: { ...ME2_REF, section: this.meta.sourceReference },
        fix: {
          label: `Replace with "${kanji}"`,
          labelJa: `「${kanji}」に置換`,
          replacement: kanji,
        },
      });
    }
    return issues;
  }
}

// ---------------------------------------------------------------------------
// ME2_12: Horizontal Text Arabic Numerals (横組のアラビア数字)
// ---------------------------------------------------------------------------

/**
 * Detect kanji numeral sequences that may be better as Arabic numerals in
 * horizontal text. Only flags clear numeric kanji sequences.
 */
const KANJI_NUMERAL_SEQUENCE = /[一二三四五六七八九〇十百千万億兆]{2,}/g;

/** Idiomatic kanji-number expressions that should NOT be flagged */
const KANJI_NUMBER_EXCEPTIONS = new Set([
  "一人", "二人", "三人", "一つ", "二つ", "三つ", "四つ", "五つ",
  "一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月",
  "九月", "十月", "十一月", "十二月",
  "一日", "二日", "三日", "一度", "二度", "三度",
  "一方", "一般", "一部", "一体", "一応", "一切", "一時",
  "二重", "三角", "四角", "万一", "一番", "二番", "三番",
  "万全", "百科", "千代", "万年", "億劫",
]);

class ME2_12_HorizontalNumbersRule extends AbstractL1Rule {
  constructor(meta: JsonRuleMeta) {
    super(meta, {
      id: "me2-horizontal-numbers",
      name: "Arabic Numerals in Horizontal Text",
      nameJa: "横組のアラビア数字使用",
      description: "Horizontal text should use Arabic numerals instead of kanji",
      descriptionJa: "横組ではアラビア数字を使用します",
      defaultConfig: { enabled: false, severity: "info" },
    });
  }

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled || !text) return [];

    const issues: LintIssue[] = [];
    for (const match of text.matchAll(KANJI_NUMERAL_SEQUENCE)) {
      if (match.index === undefined) continue;
      const kanjiNum = match[0];

      // Skip idiomatic expressions
      // Check if the matched text plus surrounding context forms an exception
      const contextStart = Math.max(0, match.index - 1);
      const contextEnd = Math.min(text.length, match.index + kanjiNum.length + 2);
      const context = text.slice(contextStart, contextEnd);
      let isException = false;
      for (const exc of KANJI_NUMBER_EXCEPTIONS) {
        if (context.includes(exc)) {
          isException = true;
          break;
        }
      }
      if (isException) continue;

      issues.push({
        ruleId: this.id,
        severity: config.severity,
        message: `Kanji numeral "${kanjiNum}" found; consider Arabic numerals for horizontal text (原稿編集 第2版 ${this.meta.sourceReference})`,
        messageJa: `原稿編集 第2版に基づき、横組では「${kanjiNum}」をアラビア数字で表記することを検討してください`,
        from: match.index,
        to: match.index + kanjiNum.length,
        originalText: kanjiNum,
        reference: { ...ME2_REF, section: this.meta.sourceReference },
      });
    }
    return issues;
  }
}

// ---------------------------------------------------------------------------
// ME2_13: Unit Symbols (単位記号)
// ---------------------------------------------------------------------------

/**
 * Detect unit symbols that may need orientation-appropriate formatting.
 * Flags roman unit symbols without a space before them (horizontal mode).
 */
const UNIT_SYMBOL_NO_SPACE = /(\d)(km|cm|mm|m|kg|g|mg|ml|L|dB|Hz|lx|cd)\b/g;

class ME2_13_UnitSymbolsRule extends AbstractL1Rule {
  constructor(meta: JsonRuleMeta) {
    super(meta, {
      id: "me2-unit-symbols",
      name: "Unit Symbol Formatting",
      nameJa: "単位記号の表記",
      description: "Check unit symbol formatting (space between number and unit in horizontal text)",
      descriptionJa: "横組では数値と欧字単位記号の間にスペースを入れます",
      defaultConfig: { enabled: false, severity: "info" },
    });
  }

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled || !text) return [];

    const issues: LintIssue[] = [];
    for (const match of text.matchAll(UNIT_SYMBOL_NO_SPACE)) {
      if (match.index === undefined) continue;
      const fullMatch = match[0];
      const digit = match[1];
      const unit = match[2];
      const replacement = `${digit} ${unit}`;

      issues.push({
        ruleId: this.id,
        severity: config.severity,
        message: `Missing space between number and unit "${unit}" in horizontal text (原稿編集 第2版 ${this.meta.sourceReference})`,
        messageJa: `原稿編集 第2版に基づき、横組では数値と単位記号「${unit}」の間にスペースを入れてください`,
        from: match.index,
        to: match.index + fullMatch.length,
        originalText: fullMatch,
        reference: { ...ME2_REF, section: this.meta.sourceReference },
        fix: {
          label: `Add space: "${replacement}"`,
          labelJa: `スペースを挿入: 「${replacement}」`,
          replacement,
        },
      });
    }
    return issues;
  }
}

// ---------------------------------------------------------------------------
// ME2_14: Currency/Percent Symbol Spacing (通貨・百分率記号の密着)
// ---------------------------------------------------------------------------

/**
 * Detect spaces between currency/percent symbols and numbers.
 * Pre-positioned symbols: ¥, $, €, £
 * Post-positioned symbols: %, ‰
 */
const PRE_SYMBOL_SPACE = /([¥$€£])\s+(\d)/g;
const POST_SYMBOL_SPACE = /(\d)\s+([%‰])/g;

class ME2_14_CurrencyPercentRule extends AbstractL1Rule {
  constructor(meta: JsonRuleMeta) {
    super(meta, {
      id: "me2-currency-percent",
      name: "Currency/Percent Symbol Spacing",
      nameJa: "通貨・百分率記号の密着",
      description: "Currency and percent symbols should be adjacent to numbers without space",
      descriptionJa: "通貨記号・百分率記号は数字に密着させます",
      defaultConfig: { enabled: true, severity: "warning" },
    });
  }

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled || !text) return [];

    const issues: LintIssue[] = [];

    // Pre-positioned symbols with space: "¥ 300" -> "¥300"
    for (const match of text.matchAll(PRE_SYMBOL_SPACE)) {
      if (match.index === undefined) continue;
      const fullMatch = match[0];
      const symbol = match[1];
      const digit = match[2];
      const replacement = `${symbol}${digit}`;

      issues.push({
        ruleId: this.id,
        severity: config.severity,
        message: `Remove space between "${symbol}" and number (原稿編集 第2版 ${this.meta.sourceReference})`,
        messageJa: `原稿編集 第2版に基づき、「${symbol}」と数字の間のスペースを削除してください`,
        from: match.index,
        to: match.index + fullMatch.length,
        originalText: fullMatch,
        reference: { ...ME2_REF, section: this.meta.sourceReference },
        fix: {
          label: `Remove space: "${replacement}"`,
          labelJa: `スペースを削除: 「${replacement}」`,
          replacement,
        },
      });
    }

    // Post-positioned symbols with space: "25 %" -> "25%"
    for (const match of text.matchAll(POST_SYMBOL_SPACE)) {
      if (match.index === undefined) continue;
      const fullMatch = match[0];
      const digit = match[1];
      const symbol = match[2];
      const replacement = `${digit}${symbol}`;

      issues.push({
        ruleId: this.id,
        severity: config.severity,
        message: `Remove space between number and "${symbol}" (原稿編集 第2版 ${this.meta.sourceReference})`,
        messageJa: `原稿編集 第2版に基づき、数字と「${symbol}」の間のスペースを削除してください`,
        from: match.index,
        to: match.index + fullMatch.length,
        originalText: fullMatch,
        reference: { ...ME2_REF, section: this.meta.sourceReference },
        fix: {
          label: `Remove space: "${replacement}"`,
          labelJa: `スペースを削除: 「${replacement}」`,
          replacement,
        },
      });
    }

    return issues;
  }
}

// ---------------------------------------------------------------------------
// ME2_15: Punctuation Consistency (句読点の統一)
// ---------------------------------------------------------------------------

/**
 * Detect mixed punctuation styles.
 * Japanese has multiple comma/period pairs:
 *   - 、。 (standard Japanese)
 *   - ，．(academic / horizontal text)
 *   - ,。(mixed)
 *
 * This rule flags text that uses both comma styles or both period styles.
 */
const JP_COMMA = /、/g;
const WESTERN_COMMA = /，/g;
const JP_PERIOD = /。/g;
const WESTERN_PERIOD = /．/g;

class ME2_15_PunctuationConsistencyRule extends AbstractL1Rule {
  constructor(meta: JsonRuleMeta) {
    super(meta, {
      id: "me2-punctuation-consistency",
      name: "Punctuation Set Consistency",
      nameJa: "句読点セットの統一",
      description: "Check for mixed use of punctuation styles (、。 vs ，．)",
      descriptionJa: "句読点セットが統一されているか確認します",
      defaultConfig: { enabled: true, severity: "warning" },
    });
  }

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled || !text) return [];

    const issues: LintIssue[] = [];

    // Count occurrences of each style
    const jpCommaCount = (text.match(JP_COMMA) ?? []).length;
    const westernCommaCount = (text.match(WESTERN_COMMA) ?? []).length;
    const jpPeriodCount = (text.match(JP_PERIOD) ?? []).length;
    const westernPeriodCount = (text.match(WESTERN_PERIOD) ?? []).length;

    // Only flag if both styles are present (mixed usage)
    const hasCommaConflict = jpCommaCount > 0 && westernCommaCount > 0;
    const hasPeriodConflict = jpPeriodCount > 0 && westernPeriodCount > 0;

    if (!hasCommaConflict && !hasPeriodConflict) return [];

    // Flag the minority style punctuation marks
    if (hasCommaConflict) {
      // Flag the less-used comma style
      const flagWestern = jpCommaCount >= westernCommaCount;
      const pattern = flagWestern ? WESTERN_COMMA : JP_COMMA;
      const flaggedChar = flagWestern ? "，" : "、";
      const suggestedChar = flagWestern ? "、" : "，";

      for (const match of text.matchAll(pattern)) {
        if (match.index === undefined) continue;
        issues.push({
          ruleId: this.id,
          severity: config.severity,
          message: `Mixed comma style: "${flaggedChar}" found alongside "${suggestedChar}"; unify punctuation (原稿編集 第2版 ${this.meta.sourceReference})`,
          messageJa: `原稿編集 第2版に基づき、読点「${flaggedChar}」と「${suggestedChar}」が混在しています。統一してください`,
          from: match.index,
          to: match.index + 1,
          originalText: flaggedChar,
          reference: { ...ME2_REF, section: this.meta.sourceReference },
          fix: {
            label: `Replace with "${suggestedChar}"`,
            labelJa: `「${suggestedChar}」に置換`,
            replacement: suggestedChar,
          },
        });
      }
    }

    if (hasPeriodConflict) {
      const flagWestern = jpPeriodCount >= westernPeriodCount;
      const pattern = flagWestern ? WESTERN_PERIOD : JP_PERIOD;
      const flaggedChar = flagWestern ? "．" : "。";
      const suggestedChar = flagWestern ? "。" : "．";

      for (const match of text.matchAll(pattern)) {
        if (match.index === undefined) continue;
        issues.push({
          ruleId: this.id,
          severity: config.severity,
          message: `Mixed period style: "${flaggedChar}" found alongside "${suggestedChar}"; unify punctuation (原稿編集 第2版 ${this.meta.sourceReference})`,
          messageJa: `原稿編集 第2版に基づき、句点「${flaggedChar}」と「${suggestedChar}」が混在しています。統一してください`,
          from: match.index,
          to: match.index + 1,
          originalText: flaggedChar,
          reference: { ...ME2_REF, section: this.meta.sourceReference },
          fix: {
            label: `Replace with "${suggestedChar}"`,
            labelJa: `「${suggestedChar}」に置換`,
            replacement: suggestedChar,
          },
        });
      }
    }

    return issues;
  }
}

// ---------------------------------------------------------------------------
// ME2_17: Repetition Mark Usage (くり返し符号の用法)
// ---------------------------------------------------------------------------

/**
 * Detect cases where the kanji repetition mark 々 could be used but isn't.
 * E.g., "人びと" -> "人々", "国ぐに" -> "国々"
 *
 * Also detect misuse of hiragana/katakana repetition marks (ゝ, ゞ, ヽ, ヾ)
 * in general prose (they are only acceptable in children's books).
 */
const KANA_REPETITION_MARKS = /[ゝゞヽヾ]/g;

/** Common words where 々 should be used instead of kana alternatives */
const NODO_REPLACEMENTS: ReadonlyMap<string, string> = new Map([
  ["人びと", "人々"], ["国ぐに", "国々"], ["山やま", "山々"],
  ["村むら", "村々"], ["島じま", "島々"], ["神がみ", "神々"],
  ["木ぎ", "木々"], ["日び", "日々"], ["花ばな", "花々"],
  ["家いえ", "家々"], ["色いろ", "色々"], ["時どき", "時々"],
  ["我われ", "我々"], ["年ねん", "年々"], ["月づき", "月々"],
]);

class ME2_17_RepetitionMarkRule extends AbstractL1Rule {
  private nodoPatterns: ReadonlyArray<[RegExp, string, string]>;

  constructor(meta: JsonRuleMeta) {
    super(meta, {
      id: "me2-repetition-marks",
      name: "Repetition Mark Usage",
      nameJa: "くり返し符号の用法",
      description: "Check proper use of repetition marks (々, ゝ, ゞ)",
      descriptionJa: "くり返し符号（々、ゝ、ゞ）の適切な使用をチェックします",
      defaultConfig: { enabled: true, severity: "info" },
    });

    const entries: Array<[RegExp, string, string]> = [];
    for (const [wrong, correct] of NODO_REPLACEMENTS) {
      entries.push([new RegExp(wrong, "g"), wrong, correct]);
    }
    this.nodoPatterns = entries;
  }

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (!config.enabled || !text) return [];

    const issues: LintIssue[] = [];

    // Detect hiragana/katakana repetition marks (ゝ, ゞ, ヽ, ヾ)
    for (const match of text.matchAll(KANA_REPETITION_MARKS)) {
      if (match.index === undefined) continue;
      const mark = match[0];
      issues.push({
        ruleId: this.id,
        severity: config.severity,
        message: `Kana repetition mark "${mark}" is not standard in general prose (原稿編集 第2版 ${this.meta.sourceReference})`,
        messageJa: `原稿編集 第2版に基づき、一般書では仮名のくり返し符号「${mark}」は使用しません`,
        from: match.index,
        to: match.index + 1,
        originalText: mark,
        reference: { ...ME2_REF, section: this.meta.sourceReference },
      });
    }

    // Detect words that should use 々 instead of kana repetition
    for (const [regex, wrong, correct] of this.nodoPatterns) {
      regex.lastIndex = 0;
      for (const match of text.matchAll(regex)) {
        if (match.index === undefined) continue;
        issues.push({
          ruleId: this.id,
          severity: config.severity,
          message: `"${wrong}" should use repetition mark: "${correct}" (原稿編集 第2版 ${this.meta.sourceReference})`,
          messageJa: `原稿編集 第2版に基づき、「${wrong}」はくり返し符号を使い「${correct}」と表記してください`,
          from: match.index,
          to: match.index + wrong.length,
          originalText: wrong,
          reference: { ...ME2_REF, section: this.meta.sourceReference },
          fix: {
            label: `Replace with "${correct}"`,
            labelJa: `「${correct}」に置換`,
            replacement: correct,
          },
        });
      }
    }

    return issues;
  }
}

// ---------------------------------------------------------------------------
// Factory function
// ---------------------------------------------------------------------------

const BOOK_TITLE = "原稿編集 第2版";

/** Rule ID -> Rule class constructor mapping */
const RULE_CONSTRUCTORS: Record<string, new (meta: JsonRuleMeta) => AbstractL1Rule> = {
  rule_ME2_4_kanji_font: ME2_4_KanjiFontRule,
  rule_ME2_8_katakana: ME2_8_KatakanaForeignRule,
  rule_ME2_9_foreign_words: ME2_9_ForeignWordLongVowelRule,
  rule_ME2_11_vertical_numbers: ME2_11_VerticalNumbersRule,
  rule_ME2_12_horizontal_numbers: ME2_12_HorizontalNumbersRule,
  rule_ME2_13_unit_symbols: ME2_13_UnitSymbolsRule,
  rule_ME2_14_pre_post_symbols: ME2_14_CurrencyPercentRule,
  rule_ME2_15_punctuation: ME2_15_PunctuationConsistencyRule,
  rule_ME2_17_repetition_symbols: ME2_17_RepetitionMarkRule,
};

/**
 * Create all manuscript-editing L1 rules from rules.json data.
 * Returns an array of instantiated AbstractL1Rule subclasses.
 */
export function createManuscriptL1Rules(): AbstractL1Rule[] {
  const entries = getJsonRulesByBook(BOOK_TITLE).filter(
    (r) => r.Level === "L1",
  );

  const rules: AbstractL1Rule[] = [];
  for (const entry of entries) {
    const Ctor = RULE_CONSTRUCTORS[entry.Rule_ID];
    if (!Ctor) continue; // skip rules without implementation
    const meta = toMeta(entry, BOOK_TITLE);
    rules.push(new Ctor(meta));
  }

  return rules;
}
