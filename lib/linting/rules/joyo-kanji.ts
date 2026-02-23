import { AbstractLintRule } from "../base-rule";
import { JINMEIYO_KANJI_SET } from "../data/jinmeiyo-kanji";
import { JOYO_KANJI_SET } from "../data/joyo-kanji";
import { maskDialogue } from "../helpers/dialogue-mask";
import type { LintIssue, LintRuleConfig, LintReference , CorrectionEngine} from "../types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STANDARD_REF: LintReference = {
  standard: "文化庁 常用漢字表 (2010)",
};

/**
 * Common words containing non-Joyo kanji (or words where hiragana is
 * preferred in formal writing) paired with their hiragana replacements.
 *
 * When the rule detects these compound patterns in the text it will suggest
 * replacing the whole word with hiragana, rather than flagging each kanji
 * character individually.
 */
const NON_JOYO_SUGGESTIONS: ReadonlyMap<string, string> = new Map([
  ["所謂", "いわゆる"],
  ["予め", "あらかじめ"],
  ["敢えて", "あえて"],
  ["即ち", "すなわち"],
  ["但し", "ただし"],
  ["尚", "なお"],
  ["概ね", "おおむね"],
  ["殆ど", "ほとんど"],
  ["暫く", "しばらく"],
  ["僅か", "わずか"],
  ["稀", "まれ"],
  ["嘗て", "かつて"],
  ["漸く", "ようやく"],
  ["辛うじて", "かろうじて"],
  ["流石", "さすが"],
  ["拘わらず", "かかわらず"],
  ["勿論", "もちろん"],
  ["迄", "まで"],
  ["筈", "はず"],
  ["殊に", "ことに"],
  ["頗る", "すこぶる"],
  ["寧ろ", "むしろ"],
  ["凡そ", "およそ"],
  ["屡々", "しばしば"],
  ["悉く", "ことごとく"],
  ["畢竟", "ひっきょう"],
  ["蔑ろ", "ないがしろ"],
  // Additional compound word suggestions
  ["蝶々", "ちょうちょ"],
  ["鉤括弧", "かぎかっこ"],
  ["躊躇", "ちゅうちょ"],
  ["齟齬", "そご"],
  ["逡巡", "しゅんじゅん"],
  ["慟哭", "どうこく"],
  ["忖度", "そんたく"],
  ["蹉跌", "さてつ"],
  ["瑕疵", "かし"],
  ["矜持", "きょうじ"],
  ["咄嗟", "とっさ"],
  ["弄ぶ", "もてあそぶ"],
  ["嘲る", "あざける"],
  ["呟く", "つぶやく"],
  ["囁く", "ささやく"],
  ["躓く", "つまずく"],
  ["蔑む", "さげすむ"],
]);

/**
 * Rule-specific options for JoyoKanjiRule.
 */
interface JoyoKanjiOptions {
  /**
   * When true (default), kanji in the official Jinmeiyo set (人名用漢字)
   * are not flagged as non-Joyo. This is useful because Jinmeiyo kanji are
   * legally approved for use in personal names and commonly appear in
   * Japanese text.
   */
  allowJinmeiyo: boolean;
}

/**
 * Regex that matches CJK Unified Ideographs (BMP + Extension B for 𠮟).
 *
 * Ranges covered:
 *   U+4E00..U+9FFF  — CJK Unified Ideographs
 *   U+3400..U+4DBF  — CJK Unified Ideographs Extension A
 *   U+20000..U+2A6DF — CJK Unified Ideographs Extension B (for 𠮟 U+20B9F)
 *
 * The `u` flag is required so that surrogate pairs are treated as single
 * code points.
 */
const CJK_KANJI_REGEX = /[\u4e00-\u9fff\u3400-\u4dbf\u{20000}-\u{2a6df}]/gu;

// ---------------------------------------------------------------------------
// Rule implementation
// ---------------------------------------------------------------------------

/**
 * Joyo Kanji Rule (L1)
 *
 * Detects kanji characters that fall outside the official 2,136 Joyo kanji
 * set defined in the 2010 revision of 文化庁「常用漢字表」.
 *
 * Detection strategy:
 * 1. First scan for known compound words (NON_JOYO_SUGGESTIONS) and offer
 *    hiragana replacements.
 * 2. Then scan for individual non-Joyo kanji that were not already covered
 *    by a compound match.
 *
 * When `options.allowJinmeiyo` is true (default), kanji in the official
 * Jinmeiyo set (人名用漢字) are excluded from detection in Phase 2.
 *
 * Reference: 文化庁 常用漢字表 (2010)
 */
export class JoyoKanjiRule extends AbstractLintRule {
  readonly id = "joyo-kanji";
  override engine: CorrectionEngine = "regex";
  readonly name = "Joyo kanji validation";
  readonly nameJa = "常用漢字バリデーション";
  readonly description = "Detect kanji outside the official Joyo kanji set";
  readonly descriptionJa = "常用漢字表外の漢字を検出";
  readonly level = "L1" as const;
  readonly defaultConfig: LintRuleConfig = {
    enabled: true,
    severity: "info",
    skipDialogue: true,
    options: { allowJinmeiyo: true } satisfies JoyoKanjiOptions,
  };

  lint(text: string, config: LintRuleConfig): LintIssue[] {
    if (text.length === 0) return [];

    const maskedText = config.skipDialogue ? maskDialogue(text) : text;
    const options = (config.options ?? this.defaultConfig.options) as
      | JoyoKanjiOptions
      | undefined;
    const allowJinmeiyo = options?.allowJinmeiyo ?? true;

    const issues: LintIssue[] = [];

    // Track character positions already covered by compound matches so
    // that the individual kanji scan does not duplicate them.
    const coveredRanges: Array<{ from: number; to: number }> = [];

    // -----------------------------------------------------------------
    // Phase 1: Compound word suggestions
    // -----------------------------------------------------------------
    for (const [word, hiragana] of NON_JOYO_SUGGESTIONS) {
      let searchFrom = 0;
      while (searchFrom <= maskedText.length - word.length) {
        const idx = maskedText.indexOf(word, searchFrom);
        if (idx === -1) break;

        const from = idx;
        const to = idx + word.length;

        coveredRanges.push({ from, to });

        issues.push({
          ruleId: this.id,
          severity: config.severity,
          message: `"${word}" is commonly written in hiragana as "${hiragana}" in formal writing.`,
          messageJa: `文化庁 常用漢字表(2010)に基づき、「${word}」はひらがな「${hiragana}」での表記が推奨されます`,
          from,
          to,
          reference: STANDARD_REF,
          fix: {
            label: `Replace with "${hiragana}"`,
            labelJa: `「${hiragana}」に置換`,
            replacement: hiragana,
          },
        });

        // Advance past this match to find further occurrences
        searchFrom = to;
      }
    }

    // -----------------------------------------------------------------
    // Phase 2: Individual non-Joyo kanji
    // -----------------------------------------------------------------
    // Iterate over the text using the Unicode-aware CJK regex
    let match: RegExpExecArray | null;
    // Reset lastIndex in case the regex was used before
    CJK_KANJI_REGEX.lastIndex = 0;

    while ((match = CJK_KANJI_REGEX.exec(maskedText)) !== null) {
      const char = match[0];
      const from = match.index;
      const to = from + char.length;

      // Skip if this character is part of the Joyo kanji set
      if (JOYO_KANJI_SET.has(char)) continue;

      // Skip if Jinmeiyo kanji are allowed and this character is in the set
      if (allowJinmeiyo && JINMEIYO_KANJI_SET.has(char)) continue;

      // Skip if this position is already covered by a compound match
      if (this.isPositionCovered(from, coveredRanges)) continue;

      issues.push({
        ruleId: this.id,
        severity: config.severity,
        message: `Non-Joyo kanji "${char}" detected.`,
        messageJa: `文化庁 常用漢字表(2010)に基づき、表外漢字「${char}」が使用されています`,
        from,
        to,
        reference: STANDARD_REF,
        // No fix suggestion for standalone characters (context-dependent)
      });
    }

    return issues;
  }

  /**
   * Check if a character position falls within any of the covered ranges.
   */
  private isPositionCovered(
    pos: number,
    ranges: ReadonlyArray<{ from: number; to: number }>,
  ): boolean {
    return ranges.some((r) => pos >= r.from && pos < r.to);
  }
}
