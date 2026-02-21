import { describe, it, expect } from "vitest";

import type { Token } from "@/lib/nlp-client/types";

import { TaigenDomeOveruseRule } from "../taigen-dome-overuse";

/** Helper to create a mock token */
function mockToken(
  surface: string,
  pos: string,
  start: number,
  detail1 = "*",
): Token {
  return {
    surface,
    pos,
    pos_detail_1: detail1,
    pos_detail_2: "*",
    pos_detail_3: "*",
    conjugation_type: "",
    conjugation_form: "",
    basic_form: surface,
    reading: "",
    pronunciation: "",
    start,
    end: start + surface.length,
  };
}

describe("taigen-dome-overuse", () => {
  const rule = new TaigenDomeOveruseRule();
  const config = rule.defaultConfig;

  it("should have correct metadata", () => {
    expect(rule.id).toBe("taigen-dome-overuse");
    expect(rule.level).toBe("L2");
  });

  it("should return no issues for empty text", () => {
    expect(rule.lintWithTokens("", [], config)).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // Detection: 4+ consecutive noun-ending sentences
  // -----------------------------------------------------------------------
  it("should detect consecutive taigen-dome sentences (default threshold 4)", () => {
    // 4 sentences each ending with a noun
    const text = "青い空。白い雲。赤い花。大きな山。";
    const tokens: Token[] = [
      mockToken("青い", "形容詞", 0),
      mockToken("空", "名詞", 2),
      // 。 at index 3
      mockToken("白い", "形容詞", 4),
      mockToken("雲", "名詞", 6),
      // 。 at index 7
      mockToken("赤い", "形容詞", 8),
      mockToken("花", "名詞", 10),
      // 。 at index 11
      mockToken("大きな", "形容詞", 12),
      mockToken("山", "名詞", 15),
      // 。 at index 16
    ];

    const issues = rule.lintWithTokens(text, tokens, config);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].ruleId).toBe("taigen-dome-overuse");
    expect(issues[0].message).toContain("4");
  });

  // -----------------------------------------------------------------------
  // No detection: below threshold
  // -----------------------------------------------------------------------
  it("should not flag fewer than threshold consecutive taigen-dome", () => {
    const text = "青い空。白い雲。赤い花。";
    const tokens: Token[] = [
      mockToken("青い", "形容詞", 0),
      mockToken("空", "名詞", 2),
      mockToken("白い", "形容詞", 4),
      mockToken("雲", "名詞", 6),
      mockToken("赤い", "形容詞", 8),
      mockToken("花", "名詞", 10),
    ];

    const issues = rule.lintWithTokens(text, tokens, config);
    expect(issues).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // Mixed endings break the run
  // -----------------------------------------------------------------------
  it("should not flag when verb-ending sentence breaks the run", () => {
    const text = "青い空。風が吹いた。白い雲。赤い花。";
    const tokens: Token[] = [
      mockToken("青い", "形容詞", 0),
      mockToken("空", "名詞", 2),
      // 。 at 3, sentence 2 ends with verb
      mockToken("風", "名詞", 4),
      mockToken("が", "助詞", 5),
      mockToken("吹い", "動詞", 6),
      mockToken("た", "助動詞", 8),
      // 。 at 9
      mockToken("白い", "形容詞", 10),
      mockToken("雲", "名詞", 12),
      mockToken("赤い", "形容詞", 14),
      mockToken("花", "名詞", 16),
    ];

    const issues = rule.lintWithTokens(text, tokens, config);
    expect(issues).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // Custom threshold
  // -----------------------------------------------------------------------
  it("should respect custom threshold", () => {
    const text = "青い空。白い雲。";
    const tokens: Token[] = [
      mockToken("青い", "形容詞", 0),
      mockToken("空", "名詞", 2),
      mockToken("白い", "形容詞", 4),
      mockToken("雲", "名詞", 6),
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
    const issues = rule.lint("青い空。", config);
    expect(issues).toHaveLength(0);
  });
});
