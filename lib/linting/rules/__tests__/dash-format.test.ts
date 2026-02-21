import { describe, it, expect } from "vitest";

import { DashFormatRule } from "../dash-format";

describe("dash-format", () => {
  const rule = new DashFormatRule();
  const config = rule.defaultConfig;

  it("should have correct metadata", () => {
    expect(rule.id).toBe("dash-format");
    expect(rule.level).toBe("L1");
  });

  it("should return no issues for empty text", () => {
    expect(rule.lint("", config)).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // Sub-check 1: Single em dash
  // -----------------------------------------------------------------------
  describe("single em dash", () => {
    it("should detect single HORIZONTAL BAR", () => {
      const issues = rule.lint("彼は\u2015思い出した。", config);
      const dashIssues = issues.filter(
        (i) => i.message.includes("Single em dash"),
      );
      expect(dashIssues.length).toBeGreaterThan(0);
      expect(dashIssues[0].fix?.replacement).toBe("\u2015\u2015");
    });

    it("should detect single EM DASH", () => {
      const issues = rule.lint("彼は\u2014思い出した。", config);
      const dashIssues = issues.filter(
        (i) => i.message.includes("Single em dash"),
      );
      expect(dashIssues.length).toBeGreaterThan(0);
    });

    it("should not flag paired dashes", () => {
      const issues = rule.lint("彼は\u2015\u2015思い出した。", config);
      const dashIssues = issues.filter(
        (i) => i.message.includes("Single em dash"),
      );
      expect(dashIssues).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Sub-check 2: ASCII double hyphen
  // -----------------------------------------------------------------------
  describe("ASCII double hyphen", () => {
    it("should detect ASCII double hyphen (--)", () => {
      const issues = rule.lint("彼は--思い出した。", config);
      const hyphenIssues = issues.filter(
        (i) => i.message.includes("ASCII double hyphen"),
      );
      expect(hyphenIssues.length).toBeGreaterThan(0);
      expect(hyphenIssues[0].fix?.replacement).toBe("\u2015\u2015");
    });

    it("should skip triple hyphens (---)", () => {
      const issues = rule.lint("彼は---思い出した。", config);
      const hyphenIssues = issues.filter(
        (i) => i.message.includes("ASCII double hyphen"),
      );
      expect(hyphenIssues).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Sub-check 3: Katakana long vowel confusion
  // -----------------------------------------------------------------------
  describe("katakana long vowel confusion", () => {
    it("should detect katakana long vowel mark in non-katakana context", () => {
      // ー preceded by hiragana
      const issues = rule.lint("彼はー思い出した。", config);
      const longVowelIssues = issues.filter(
        (i) => i.message.includes("Katakana long vowel mark"),
      );
      expect(longVowelIssues.length).toBeGreaterThan(0);
    });

    it("should not flag katakana long vowel after katakana", () => {
      const issues = rule.lint("コンピューター。", config);
      const longVowelIssues = issues.filter(
        (i) => i.message.includes("Katakana long vowel mark"),
      );
      expect(longVowelIssues).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Clean text
  // -----------------------------------------------------------------------
  it("should not flag text without dash issues", () => {
    const issues = rule.lint("今日は天気が良い。", config);
    expect(issues).toHaveLength(0);
  });
});
