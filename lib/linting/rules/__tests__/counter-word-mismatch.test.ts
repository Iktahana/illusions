import { describe, it, expect } from "vitest";

import type { Token } from "@/lib/nlp-client/types";

import { CounterWordMismatchRule } from "../counter-word-mismatch";

/** Helper to create a mock token */
function mockToken(
  surface: string,
  pos: string,
  start: number,
  detail1 = "*",
  detail2 = "*",
  basic = surface,
): Token {
  return {
    surface,
    pos,
    pos_detail_1: detail1,
    pos_detail_2: detail2,
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

describe("counter-word-mismatch", () => {
  const rule = new CounterWordMismatchRule();
  const config = rule.defaultConfig;

  it("should have correct metadata", () => {
    expect(rule.id).toBe("counter-word-mismatch");
    expect(rule.level).toBe("L2");
  });

  it("should return no issues for empty text", () => {
    expect(rule.lintWithTokens("", [], config)).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // Detection: wrong counter for animals
  // -----------------------------------------------------------------------
  it("should detect '人' counter used for animals", () => {
    // "犬3人" - dogs counted with people counter
    const text = "犬が3人います。";
    const tokens: Token[] = [
      mockToken("犬", "名詞", 0, "一般"),
      mockToken("が", "助詞", 1),
      mockToken("3", "名詞", 2, "数"),
      mockToken("人", "名詞", 3, "接尾", "助数詞"),
      mockToken("い", "動詞", 4, "自立"),
      mockToken("ます", "助動詞", 5),
    ];

    const issues = rule.lintWithTokens(text, tokens, config);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].ruleId).toBe("counter-word-mismatch");
    expect(issues[0].fix?.replacement).toBe("匹");
  });

  // -----------------------------------------------------------------------
  // Detection: wrong counter for people
  // -----------------------------------------------------------------------
  it("should detect '匹' counter used for people", () => {
    const text = "学生が3匹います。";
    const tokens: Token[] = [
      mockToken("学生", "名詞", 0, "一般"),
      mockToken("が", "助詞", 2),
      mockToken("3", "名詞", 3, "数"),
      mockToken("匹", "名詞", 4, "接尾", "助数詞"),
      mockToken("い", "動詞", 5, "自立"),
      mockToken("ます", "助動詞", 6),
    ];

    const issues = rule.lintWithTokens(text, tokens, config);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].fix?.replacement).toBe("人");
  });

  // -----------------------------------------------------------------------
  // Detection: wrong counter for flat objects
  // -----------------------------------------------------------------------
  it("should detect '本' counter used for flat objects", () => {
    const text = "紙を3本使った。";
    const tokens: Token[] = [
      mockToken("紙", "名詞", 0, "一般"),
      mockToken("を", "助詞", 1),
      mockToken("3", "名詞", 2, "数"),
      mockToken("本", "名詞", 3, "接尾", "助数詞"),
      mockToken("使っ", "動詞", 4, "自立"),
      mockToken("た", "助動詞", 6),
    ];

    const issues = rule.lintWithTokens(text, tokens, config);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].fix?.replacement).toBe("枚");
  });

  // -----------------------------------------------------------------------
  // No detection: correct counter
  // -----------------------------------------------------------------------
  it("should not flag correct counter usage", () => {
    const text = "犬が3匹いる。";
    const tokens: Token[] = [
      mockToken("犬", "名詞", 0, "一般"),
      mockToken("が", "助詞", 1),
      mockToken("3", "名詞", 2, "数"),
      mockToken("匹", "名詞", 3, "接尾", "助数詞"),
      mockToken("いる", "動詞", 4, "自立"),
    ];

    const issues = rule.lintWithTokens(text, tokens, config);
    expect(issues).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // No detection: no nearby noun
  // -----------------------------------------------------------------------
  it("should not flag when no nearby noun is found", () => {
    const text = "3匹いる。";
    const tokens: Token[] = [
      mockToken("3", "名詞", 0, "数"),
      mockToken("匹", "名詞", 1, "接尾", "助数詞"),
      mockToken("いる", "動詞", 2, "自立"),
    ];

    const issues = rule.lintWithTokens(text, tokens, config);
    expect(issues).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // lint() method should return empty (L2 rule)
  // -----------------------------------------------------------------------
  it("should return empty from lint() method", () => {
    const issues = rule.lint("犬が3人います。", config);
    expect(issues).toHaveLength(0);
  });
});
