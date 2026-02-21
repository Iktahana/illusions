import { describe, it, expect } from "vitest";

import type { Token } from "@/lib/nlp-client/types";

import { ConjunctionOveruseRule } from "../conjunction-overuse";

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

describe("conjunction-overuse", () => {
  const rule = new ConjunctionOveruseRule();
  const config = rule.defaultConfig;

  it("should have correct metadata", () => {
    expect(rule.id).toBe("conjunction-overuse");
    expect(rule.level).toBe("L2");
  });

  it("should return no issues for empty text", () => {
    expect(rule.lintWithTokens("", [], config)).toHaveLength(0);
  });

  it("should return no issues for empty tokens", () => {
    expect(rule.lintWithTokens("text", [], config)).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // Detection: 3+ consecutive conjunction-starting sentences
  // -----------------------------------------------------------------------
  it("should detect 3 consecutive conjunction-starting sentences", () => {
    // しかし彼は来た。だから帰った。そして寝た。
    const text = "しかし彼は来た。だから帰った。そして寝た。";
    const tokens: Token[] = [
      mockToken("しかし", "接続詞", 0),
      mockToken("彼", "名詞", 3),
      mockToken("は", "助詞", 4),
      mockToken("来", "動詞", 5),
      mockToken("た", "助動詞", 6),
      // sentence break at 。(index 7)
      mockToken("だから", "接続詞", 8),
      mockToken("帰っ", "動詞", 11),
      mockToken("た", "助動詞", 13),
      // sentence break at 。(index 14)
      mockToken("そして", "接続詞", 15),
      mockToken("寝", "動詞", 18),
      mockToken("た", "助動詞", 19),
    ];

    const issues = rule.lintWithTokens(text, tokens, config);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].ruleId).toBe("conjunction-overuse");
    expect(issues[0].message).toContain("3");
  });

  // -----------------------------------------------------------------------
  // No detection: Below threshold
  // -----------------------------------------------------------------------
  it("should not flag 2 consecutive conjunction-starting sentences", () => {
    const text = "しかし彼は来た。だから帰った。";
    const tokens: Token[] = [
      mockToken("しかし", "接続詞", 0),
      mockToken("彼", "名詞", 3),
      mockToken("は", "助詞", 4),
      mockToken("来", "動詞", 5),
      mockToken("た", "助動詞", 6),
      mockToken("だから", "接続詞", 8),
      mockToken("帰っ", "動詞", 11),
      mockToken("た", "助動詞", 13),
    ];

    const issues = rule.lintWithTokens(text, tokens, config);
    expect(issues).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // Mixed sentences (conjunction and non-conjunction)
  // -----------------------------------------------------------------------
  it("should not flag when non-conjunction sentence breaks the run", () => {
    const text = "しかし彼は来た。彼は帰った。そして寝た。";
    const tokens: Token[] = [
      mockToken("しかし", "接続詞", 0),
      mockToken("彼", "名詞", 3),
      mockToken("は", "助詞", 4),
      mockToken("来", "動詞", 5),
      mockToken("た", "助動詞", 6),
      // second sentence starts with noun, not conjunction
      mockToken("彼", "名詞", 8),
      mockToken("は", "助詞", 9),
      mockToken("帰っ", "動詞", 10),
      mockToken("た", "助動詞", 12),
      mockToken("そして", "接続詞", 14),
      mockToken("寝", "動詞", 17),
      mockToken("た", "助動詞", 18),
    ];

    const issues = rule.lintWithTokens(text, tokens, config);
    expect(issues).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // Custom threshold
  // -----------------------------------------------------------------------
  it("should respect custom threshold", () => {
    const text = "しかし彼は来た。だから帰った。";
    const tokens: Token[] = [
      mockToken("しかし", "接続詞", 0),
      mockToken("彼", "名詞", 3),
      mockToken("は", "助詞", 4),
      mockToken("来", "動詞", 5),
      mockToken("た", "助動詞", 6),
      mockToken("だから", "接続詞", 8),
      mockToken("帰っ", "動詞", 11),
      mockToken("た", "助動詞", 13),
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
    const issues = rule.lint("しかし彼は来た。だから帰った。そして寝た。", config);
    expect(issues).toHaveLength(0);
  });
});
