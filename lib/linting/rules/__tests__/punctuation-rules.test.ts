import { describe, it, expect } from "vitest";

import { PunctuationRule } from "../punctuation-rules";

describe("punctuation-rules", () => {
  const rule = new PunctuationRule();
  const config = rule.defaultConfig;

  it("should have correct metadata", () => {
    expect(rule.id).toBe("punctuation-rules");
    expect(rule.level).toBe("L1");
  });

  it("should return no issues for empty text", () => {
    expect(rule.lint("", config)).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // Sub-check 1: Bracket-internal period
  // -----------------------------------------------------------------------
  describe("bracket-internal period", () => {
    it("should detect period before closing bracket", () => {
      const issues = rule.lint("彼は「わかりました。」と答えた。", config);
      const bracketPeriod = issues.filter(
        (i) => i.message.includes("Period before closing bracket"),
      );
      expect(bracketPeriod.length).toBeGreaterThan(0);
      expect(bracketPeriod[0].fix?.replacement).toBe("」");
    });

    it("should not flag text without bracket-period pattern", () => {
      const issues = rule.lint("彼は「わかりました」と答えた。", config);
      const bracketPeriod = issues.filter(
        (i) => i.message.includes("Period before closing bracket"),
      );
      expect(bracketPeriod).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Sub-check 2: Ellipsis format
  // -----------------------------------------------------------------------
  describe("ellipsis format", () => {
    it("should detect single ellipsis character", () => {
      const issues = rule.lint("彼女は考えた…そして決めた。", config);
      const ellipsisIssues = issues.filter(
        (i) => i.message.includes("Ellipsis should be used in pairs"),
      );
      expect(ellipsisIssues.length).toBeGreaterThan(0);
      expect(ellipsisIssues[0].fix?.replacement).toBe("……");
    });

    it("should not flag paired ellipsis", () => {
      const issues = rule.lint("彼女は考えた……そして決めた。", config);
      const ellipsisIssues = issues.filter(
        (i) => i.message.includes("Ellipsis should be used in pairs"),
      );
      expect(ellipsisIssues).toHaveLength(0);
    });

    it("should detect middle dots used as ellipsis", () => {
      const issues = rule.lint("彼女は考えた・・・そして決めた。", config);
      const middleDotIssues = issues.filter(
        (i) => i.message.includes("Use ellipsis character instead of middle dots"),
      );
      expect(middleDotIssues.length).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // Sub-check 3: Bracket pairing
  // -----------------------------------------------------------------------
  describe("bracket pairing", () => {
    it("should detect mismatched brackets", () => {
      const issues = rule.lint("「彼は言った「ありがとう」", config);
      const bracketIssues = issues.filter(
        (i) => i.message.includes("Mismatched"),
      );
      expect(bracketIssues.length).toBeGreaterThan(0);
    });

    it("should not flag matched brackets", () => {
      const issues = rule.lint("「ありがとう」と言った。", config);
      const bracketIssues = issues.filter(
        (i) => i.message.includes("Mismatched"),
      );
      expect(bracketIssues).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Sub-check 4: Width consistency
  // -----------------------------------------------------------------------
  describe("width consistency", () => {
    it("should detect mixed full-width and half-width exclamation marks", () => {
      const issues = rule.lint("すごい！本当にすごい!驚いた！", config);
      const widthIssues = issues.filter(
        (i) => i.message.includes("Mixed"),
      );
      expect(widthIssues.length).toBeGreaterThan(0);
    });

    it("should not flag consistent full-width exclamation marks", () => {
      const issues = rule.lint("すごい！本当に！", config);
      const widthIssues = issues.filter(
        (i) => i.message.includes("Mixed"),
      );
      expect(widthIssues).toHaveLength(0);
    });

    it("should detect mixed question marks", () => {
      const issues = rule.lint("本当？本当に?", config);
      const widthIssues = issues.filter(
        (i) => i.message.includes("Mixed") && i.message.includes("question"),
      );
      expect(widthIssues.length).toBeGreaterThan(0);
    });
  });
});
