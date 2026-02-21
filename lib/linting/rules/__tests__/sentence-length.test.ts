import { describe, it, expect } from "vitest";

import { SentenceLengthRule } from "../sentence-length";

describe("sentence-length", () => {
  const rule = new SentenceLengthRule();
  const config = rule.defaultConfig;

  it("should have correct metadata", () => {
    expect(rule.id).toBe("sentence-length");
    expect(rule.level).toBe("L1");
  });

  it("should return no issues for empty text", () => {
    expect(rule.lint("", config)).toHaveLength(0);
  });

  it("should not flag short sentences", () => {
    const issues = rule.lint("今日は天気が良い。", config);
    expect(issues).toHaveLength(0);
  });

  it("should detect sentences exceeding default threshold (100 chars)", () => {
    // Build a sentence > 100 characters
    const longSentence = "あ".repeat(101) + "。";
    const issues = rule.lint(longSentence, config);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].ruleId).toBe("sentence-length");
    expect(issues[0].message).toContain("101");
    expect(issues[0].message).toContain("100");
  });

  it("should not flag sentence exactly at threshold", () => {
    const exactSentence = "あ".repeat(100) + "。";
    const issues = rule.lint(exactSentence, config);
    expect(issues).toHaveLength(0);
  });

  it("should respect custom maxLength option", () => {
    const customConfig = {
      ...config,
      options: { maxLength: 10 },
    };
    // 15 characters (excluding 。), exceeds maxLength of 10
    const text = "これは十文字を超える文章です。";
    const issues = rule.lint(text, customConfig);
    expect(issues.length).toBeGreaterThan(0);
  });

  it("should exclude dialogue content from length count", () => {
    // Dialogue is masked to 〇, then those are excluded from effective length
    const dialogue = "「" + "あ".repeat(80) + "」" + "い".repeat(10) + "。";
    const issues = rule.lint(dialogue, config);
    // Effective length should be 10, not 92
    expect(issues).toHaveLength(0);
  });

  it("should handle multiple sentences", () => {
    const shortSentence = "短い文章です。";
    const longSentence = "あ".repeat(101) + "。";
    const text = shortSentence + longSentence;
    const issues = rule.lint(text, config);
    expect(issues.length).toBe(1);
  });
});
