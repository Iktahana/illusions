import { describe, it, expect } from "vitest";

import type { Token } from "@/lib/nlp-client/types";

import { WordRepetitionRule } from "../word-repetition";

/** Helper to create a mock token */
function mockToken(
  surface: string,
  pos: string,
  start: number,
  detail1 = "*",
  basic = surface,
): Token {
  return {
    surface,
    pos,
    pos_detail_1: detail1,
    pos_detail_2: "*",
    pos_detail_3: "*",
    conjugation_type: "",
    conjugation_form: "",
    basic_form: basic,
    reading: "",
    pronunciation: "",
    start,
    end: start + surface.length,
  };
}

describe("word-repetition", () => {
  const rule = new WordRepetitionRule();
  const config = rule.defaultConfig;

  it("should have correct metadata", () => {
    expect(rule.id).toBe("word-repetition");
    expect(rule.level).toBe("L2");
  });

  it("should return no issues for empty text", () => {
    expect(rule.lintWithTokens("", [], config)).toHaveLength(0);
  });

  it("should return no issues for empty tokens", () => {
    expect(rule.lintWithTokens("text", [], config)).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // Detection: repeated content words
  // -----------------------------------------------------------------------
  it("should detect repeated content words within sliding window", () => {
    // 5 sentences with "問題" appearing 3 times (threshold=3, windowSize=5)
    // splitIntoSentences splits on 。, with from/to offsets:
    // Sentence 1: from=0  to=7   "問題が発生した"
    // Sentence 2: from=8  to=15  "問題を解決する"
    // Sentence 3: from=16 to=22  "問題は深刻だ"
    // Sentence 4: from=23 to=30  "別の事が起きた"
    // Sentence 5: from=31 to=36  "最後の話だ"
    const text =
      "問題が発生した。問題を解決する。問題は深刻だ。別の事が起きた。最後の話だ。";
    const tokens: Token[] = [
      // Sentence 1 (0-7): 問題が発生した
      mockToken("問題", "名詞", 0, "一般"),   // 0-2
      mockToken("が", "助詞", 2),             // 2-3
      mockToken("発生", "名詞", 3, "一般"),   // 3-5
      mockToken("し", "動詞", 5),             // 5-6
      mockToken("た", "助動詞", 6),           // 6-7
      // Sentence 2 (8-15): 問題を解決する
      mockToken("問題", "名詞", 8, "一般"),   // 8-10
      mockToken("を", "助詞", 10),            // 10-11
      mockToken("解決", "名詞", 11, "一般"),  // 11-13
      mockToken("する", "動詞", 13),          // 13-15
      // Sentence 3 (16-22): 問題は深刻だ
      mockToken("問題", "名詞", 16, "一般"),  // 16-18
      mockToken("は", "助詞", 18),            // 18-19
      mockToken("深刻", "名詞", 19, "一般"),  // 19-21
      mockToken("だ", "助動詞", 21),          // 21-22
      // Sentence 4 (23-30): 別の事が起きた
      mockToken("別", "名詞", 23, "一般"),    // single char, excluded
      mockToken("の", "助詞", 24),            // 24-25
      mockToken("事", "名詞", 25, "一般"),    // single char, excluded
      mockToken("が", "助詞", 26),            // 26-27
      mockToken("起き", "動詞", 27, "自立"),  // 27-29
      mockToken("た", "助動詞", 29),          // 29-30
      // Sentence 5 (31-36): 最後の話だ
      mockToken("最後", "名詞", 31, "一般"),  // 31-33
      mockToken("の", "助詞", 33),            // 33-34
      mockToken("話", "名詞", 34, "一般"),    // single char, excluded
      mockToken("だ", "助動詞", 35),          // 35-36
    ];

    const issues = rule.lintWithTokens(text, tokens, config);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].ruleId).toBe("word-repetition");
  });

  // -----------------------------------------------------------------------
  // No detection: below threshold
  // -----------------------------------------------------------------------
  it("should not flag words that appear fewer than threshold times", () => {
    const text = "問題が発生した。問題を解決する。別の話だ。新しい計画だ。最後の決定だ。";
    const tokens: Token[] = [
      mockToken("問題", "名詞", 0, "一般"),
      mockToken("が", "助詞", 2),
      mockToken("発生", "名詞", 3, "一般"),
      mockToken("し", "動詞", 5),
      mockToken("た", "助動詞", 6),
      mockToken("問題", "名詞", 8, "一般"),
      mockToken("を", "助詞", 10),
      mockToken("解決", "名詞", 11, "一般"),
      mockToken("する", "動詞", 13),
      mockToken("別", "名詞", 15, "一般"),
      mockToken("の", "助詞", 16),
      mockToken("話", "名詞", 17, "一般"),
      mockToken("だ", "助動詞", 18),
      mockToken("新しい", "形容詞", 20, "自立"),
      mockToken("計画", "名詞", 23, "一般"),
      mockToken("だ", "助動詞", 25),
      mockToken("最後", "名詞", 27, "一般"),
      mockToken("の", "助詞", 29),
      mockToken("決定", "名詞", 30, "一般"),
      mockToken("だ", "助動詞", 32),
    ];

    const issues = rule.lintWithTokens(text, tokens, config);
    // "問題" appears only 2 times (below default threshold 3)
    expect(issues).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // Exclusions: single-char words, proper nouns, functional words
  // -----------------------------------------------------------------------
  it("should exclude single-character content words", () => {
    // Single char tokens should not be counted
    const text = "日が来た。日が暮れた。日が差した。日が沈んだ。日が昇った。";
    const tokens: Token[] = [];
    const sentences = text.split("。").filter(Boolean);
    let pos = 0;
    for (const s of sentences) {
      tokens.push(mockToken("日", "名詞", pos, "一般"));
      pos += s.length + 1; // +1 for 。
    }

    const issues = rule.lintWithTokens(text, tokens, config);
    // "日" is single character, so should be excluded
    expect(issues).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // lint() method should return empty (L2 rule)
  // -----------------------------------------------------------------------
  it("should return empty from lint() method", () => {
    const issues = rule.lint("問題が発生した。", config);
    expect(issues).toHaveLength(0);
  });
});
