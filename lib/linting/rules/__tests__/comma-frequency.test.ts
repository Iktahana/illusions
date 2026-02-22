import { describe, it, expect } from "vitest";

import { CommaFrequencyRule } from "../comma-frequency";

describe("comma-frequency", () => {
  const rule = new CommaFrequencyRule();
  const config = rule.defaultConfig;

  it("should have correct metadata", () => {
    expect(rule.id).toBe("comma-frequency");
    expect(rule.level).toBe("L1");
  });

  it("should return no issues for empty text", () => {
    expect(rule.lint("", config)).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // Too many commas
  // -----------------------------------------------------------------------
  describe("too many commas", () => {
    it("should detect excessive comma density", () => {
      // High comma ratio: 5 commas in ~25 characters
      const text = "あ、い、う、え、お、かきくけこ。";
      const issues = rule.lint(text, config);
      const tooMany = issues.filter(
        (i) => i.message.includes("commas in"),
      );
      expect(tooMany.length).toBeGreaterThan(0);
    });

    it("should not flag moderate comma usage", () => {
      const text =
        "今日は天気が良く、気温も適度で、散歩には最適だった。";
      const issues = rule.lint(text, config);
      const tooMany = issues.filter(
        (i) => i.message.includes("commas in"),
      );
      expect(tooMany).toHaveLength(0);
    });

    it("should skip very short sentences", () => {
      // Less than 8 effective characters
      const issues = rule.lint("あ、い。", config);
      const tooMany = issues.filter(
        (i) => i.message.includes("commas in"),
      );
      expect(tooMany).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // No commas
  // -----------------------------------------------------------------------
  describe("no commas in long sentence", () => {
    it("should detect long sentence without commas", () => {
      // > 50 characters with no commas
      const text = "あ".repeat(55) + "。";
      const issues = rule.lint(text, config);
      const noComma = issues.filter(
        (i) => i.message.includes("no commas"),
      );
      expect(noComma.length).toBeGreaterThan(0);
    });

    it("should not flag short sentence without commas", () => {
      const issues = rule.lint("今日は天気が良い。", config);
      const noComma = issues.filter(
        (i) => i.message.includes("no commas"),
      );
      expect(noComma).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Custom options
  // -----------------------------------------------------------------------
  it("should respect custom maxCommaRatio", () => {
    const strictConfig = {
      ...config,
      options: { maxCommaRatio: 0.05, minLengthForComma: 50 },
    };
    // Build a sentence with moderate comma ratio
    const text = "あいうえおかきくけこ、さしすせそたちつてと、なにぬねの。";
    const issues = rule.lint(text, strictConfig);
    const tooMany = issues.filter(
      (i) => i.message.includes("commas in"),
    );
    expect(tooMany.length).toBeGreaterThan(0);
  });

  it("should respect custom minLengthForComma", () => {
    const relaxedConfig = {
      ...config,
      options: { maxCommaRatio: 0.125, minLengthForComma: 100 },
    };
    // 55 chars, no commas, but threshold is 100
    const text = "あ".repeat(55) + "。";
    const issues = rule.lint(text, relaxedConfig);
    const noComma = issues.filter(
      (i) => i.message.includes("no commas"),
    );
    expect(noComma).toHaveLength(0);
  });
});
