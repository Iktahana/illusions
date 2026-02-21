import { describe, it, expect } from "vitest";

import { NumberFormatRule } from "../number-format";

describe("number-format", () => {
  const rule = new NumberFormatRule();
  const config = rule.defaultConfig;

  it("should have correct metadata", () => {
    expect(rule.id).toBe("number-format");
    expect(rule.level).toBe("L1");
  });

  it("should return no issues for empty text", () => {
    expect(rule.lint("", config)).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // Horizontal mode (default): flag kanji numerals
  // -----------------------------------------------------------------------
  describe("horizontal mode", () => {
    it("should detect kanji numerals in horizontal text", () => {
      const issues = rule.lint("彼は三百五十円を支払った。", config);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].ruleId).toBe("number-format");
      expect(issues[0].fix?.replacement).toBe("350");
    });

    it("should not flag idiomatic kanji expressions", () => {
      const issues = rule.lint("一人で歩いた。", config);
      expect(issues).toHaveLength(0);
    });

    it("should not flag place names with kanji numbers", () => {
      const issues = rule.lint("九州に行く。", config);
      expect(issues).toHaveLength(0);
    });

    it("should not flag common set phrases", () => {
      const issues = rule.lint("一生懸命に勉強する。", config);
      expect(issues).toHaveLength(0);
    });

    it("should skip dialogue content", () => {
      // Dialogue is masked, so kanji numbers inside should not be flagged
      const issues = rule.lint("「三百円です」と言った。", config);
      expect(issues).toHaveLength(0);
    });

    it("should detect large numbers without commas", () => {
      const issues = rule.lint("合計は10000000円です。", config);
      const commaIssues = issues.filter(
        (i) => i.message.includes("comma separators"),
      );
      expect(commaIssues.length).toBeGreaterThan(0);
    });

    it("should not flag 4-digit numbers (likely years)", () => {
      const issues = rule.lint("2023年に完成した。", config);
      const commaIssues = issues.filter(
        (i) => i.message.includes("comma separators"),
      );
      expect(commaIssues).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Vertical mode: flag Arabic numerals
  // -----------------------------------------------------------------------
  describe("vertical mode", () => {
    const verticalConfig = {
      ...config,
      options: { isVertical: true },
    };

    it("should detect Arabic numerals in vertical text", () => {
      const issues = rule.lint("彼は350円を支払った。", verticalConfig);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].fix?.replacement).toBe("三百五十");
    });

    it("should not flag kanji numerals in vertical text", () => {
      const issues = rule.lint("彼は三百五十円を支払った。", verticalConfig);
      expect(issues).toHaveLength(0);
    });
  });
});
