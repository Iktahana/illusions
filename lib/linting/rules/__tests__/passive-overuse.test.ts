import { describe, it, expect } from "vitest";

import type { Token } from "@/lib/nlp-client/types";

import { PassiveOveruseRule } from "../passive-overuse";

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

describe("passive-overuse", () => {
  const rule = new PassiveOveruseRule();
  const config = rule.defaultConfig;

  it("should have correct metadata", () => {
    expect(rule.id).toBe("passive-overuse");
    expect(rule.level).toBe("L2");
  });

  it("should return no issues for empty text", () => {
    expect(rule.lintWithTokens("", [], config)).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // Detection: 3+ consecutive passive sentences
  // -----------------------------------------------------------------------
  it("should detect consecutive passive-voice sentences", () => {
    // 3 sentences each with passive auxiliary
    const text = "彼は叱られた。彼女は褒められた。犬に噛まれた。";
    const tokens: Token[] = [
      // Sentence 1: 叱られた
      mockToken("彼", "名詞", 0),
      mockToken("は", "助詞", 1),
      mockToken("叱ら", "動詞", 2, "自立"),
      mockToken("れ", "動詞", 4, "接尾", "れる"),
      mockToken("た", "助動詞", 5),
      // 。 at index 6
      // Sentence 2: 褒められた
      mockToken("彼女", "名詞", 7),
      mockToken("は", "助詞", 9),
      mockToken("褒め", "動詞", 10, "自立"),
      mockToken("られ", "動詞", 12, "接尾", "られる"),
      mockToken("た", "助動詞", 14),
      // 。 at index 15
      // Sentence 3: 噛まれた
      mockToken("犬", "名詞", 16),
      mockToken("に", "助詞", 17),
      mockToken("噛ま", "動詞", 18, "自立"),
      mockToken("れ", "動詞", 20, "非自立", "れる"),
      mockToken("た", "助動詞", 21),
    ];

    const issues = rule.lintWithTokens(text, tokens, config);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].ruleId).toBe("passive-overuse");
    expect(issues[0].message).toContain("3");
  });

  // -----------------------------------------------------------------------
  // No detection: below threshold
  // -----------------------------------------------------------------------
  it("should not flag 2 consecutive passive sentences", () => {
    const text = "彼は叱られた。彼女は褒められた。";
    const tokens: Token[] = [
      mockToken("彼", "名詞", 0),
      mockToken("は", "助詞", 1),
      mockToken("叱ら", "動詞", 2, "自立"),
      mockToken("れ", "動詞", 4, "接尾", "れる"),
      mockToken("た", "助動詞", 5),
      mockToken("彼女", "名詞", 7),
      mockToken("は", "助詞", 9),
      mockToken("褒め", "動詞", 10, "自立"),
      mockToken("られ", "動詞", 12, "接尾", "られる"),
      mockToken("た", "助動詞", 14),
    ];

    const issues = rule.lintWithTokens(text, tokens, config);
    expect(issues).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // Active voice sentences should not trigger
  // -----------------------------------------------------------------------
  it("should not flag active voice sentences", () => {
    const text = "彼は走った。彼女は泳いだ。犬は吠えた。";
    const tokens: Token[] = [
      mockToken("彼", "名詞", 0),
      mockToken("は", "助詞", 1),
      mockToken("走っ", "動詞", 2, "自立"),
      mockToken("た", "助動詞", 4),
      mockToken("彼女", "名詞", 6),
      mockToken("は", "助詞", 8),
      mockToken("泳い", "動詞", 9, "自立"),
      mockToken("だ", "助動詞", 11),
      mockToken("犬", "名詞", 13),
      mockToken("は", "助詞", 14),
      mockToken("吠え", "動詞", 15, "自立"),
      mockToken("た", "助動詞", 17),
    ];

    const issues = rule.lintWithTokens(text, tokens, config);
    expect(issues).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // Custom threshold
  // -----------------------------------------------------------------------
  it("should respect custom threshold", () => {
    const text = "彼は叱られた。彼女は褒められた。";
    const tokens: Token[] = [
      mockToken("彼", "名詞", 0),
      mockToken("は", "助詞", 1),
      mockToken("叱ら", "動詞", 2, "自立"),
      mockToken("れ", "動詞", 4, "接尾", "れる"),
      mockToken("た", "助動詞", 5),
      mockToken("彼女", "名詞", 7),
      mockToken("は", "助詞", 9),
      mockToken("褒め", "動詞", 10, "自立"),
      mockToken("られ", "動詞", 12, "接尾", "られる"),
      mockToken("た", "助動詞", 14),
    ];

    const customConfig = {
      ...config,
      options: { threshold: 2 },
    };
    const issues = rule.lintWithTokens(text, tokens, customConfig);
    expect(issues.length).toBeGreaterThan(0);
  });

  // -----------------------------------------------------------------------
  // lint() method should return empty (L2 rule)
  // -----------------------------------------------------------------------
  it("should return empty from lint() method", () => {
    const issues = rule.lint("彼は叱られた。", config);
    expect(issues).toHaveLength(0);
  });
});
