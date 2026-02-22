import { describe, it, expect } from "vitest";

import { EraYearValidatorRule } from "../era-year-validator";

describe("era-year-validator", () => {
  const rule = new EraYearValidatorRule();
  const config = rule.defaultConfig;

  it("should have correct metadata", () => {
    expect(rule.id).toBe("era-year-validator");
    expect(rule.level).toBe("L1");
  });

  it("should return no issues for empty text", () => {
    expect(rule.lint("", config)).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // Correct era-year pairs
  // -----------------------------------------------------------------------
  describe("correct era-year pairs", () => {
    it("should pass correct Reiwa year", () => {
      const issues = rule.lint("令和5年（2023年）に施行。", config);
      expect(issues).toHaveLength(0);
    });

    it("should pass correct Heisei year", () => {
      const issues = rule.lint("平成31年（2019年）の出来事。", config);
      expect(issues).toHaveLength(0);
    });

    it("should pass correct Showa year", () => {
      const issues = rule.lint("昭和64年（1989年）のこと。", config);
      expect(issues).toHaveLength(0);
    });

    it("should pass gannen (first year) notation", () => {
      const issues = rule.lint("令和元年（2019年）に始まった。", config);
      expect(issues).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Incorrect era-year pairs
  // -----------------------------------------------------------------------
  describe("mismatched era-year pairs", () => {
    it("should detect Reiwa mismatch", () => {
      const issues = rule.lint("令和5年（2022年）に施行。", config);
      expect(issues).toHaveLength(1);
      expect(issues[0].ruleId).toBe("era-year-validator");
      expect(issues[0].message).toContain("2023");
      expect(issues[0].fix?.replacement).toContain("2023");
    });

    it("should detect Heisei mismatch", () => {
      const issues = rule.lint("平成30年（2017年）の出来事。", config);
      expect(issues).toHaveLength(1);
      expect(issues[0].message).toContain("2018");
    });

    it("should detect gannen (first year) mismatch", () => {
      const issues = rule.lint("令和元年（2020年）に始まった。", config);
      expect(issues).toHaveLength(1);
      expect(issues[0].message).toContain("2019");
    });
  });

  // -----------------------------------------------------------------------
  // Full-width / half-width parentheses
  // -----------------------------------------------------------------------
  describe("parenthesis styles", () => {
    it("should handle half-width parentheses", () => {
      const issues = rule.lint("令和5年(2022年)に施行。", config);
      expect(issues).toHaveLength(1);
    });

    it("should preserve parenthesis style in fix", () => {
      const fullWidth = rule.lint("令和5年（2022年）に施行。", config);
      expect(fullWidth[0].fix?.replacement).toContain("\uFF08");

      const halfWidth = rule.lint("令和5年(2022年)に施行。", config);
      expect(halfWidth[0].fix?.replacement).toContain("(");
    });
  });

  // -----------------------------------------------------------------------
  // Dialogue masking
  // -----------------------------------------------------------------------
  it("should skip era years inside dialogue", () => {
    const issues = rule.lint("「令和5年（2022年）です」と言った。", config);
    expect(issues).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // Text without era patterns
  // -----------------------------------------------------------------------
  it("should return no issues for text without era patterns", () => {
    const issues = rule.lint("今日は良い天気です。", config);
    expect(issues).toHaveLength(0);
  });
});
