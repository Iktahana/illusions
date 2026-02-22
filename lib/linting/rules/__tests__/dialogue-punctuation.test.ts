import { describe, it, expect } from "vitest";

import { DialoguePunctuationRule } from "../dialogue-punctuation";

describe("dialogue-punctuation", () => {
  const rule = new DialoguePunctuationRule();
  const config = rule.defaultConfig;

  it("should have correct metadata", () => {
    expect(rule.id).toBe("dialogue-punctuation");
    expect(rule.level).toBe("L1");
  });

  it("should return no issues for empty text", () => {
    expect(rule.lint("", config)).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // Sub-check 1: Nested brackets
  // -----------------------------------------------------------------------
  describe("nested brackets", () => {
    it("should detect nested single brackets inside single brackets", () => {
      const text = "「彼が「ありがとう」と言った」と話した。";
      const issues = rule.lint(text, config);
      const nestedIssues = issues.filter(
        (i) => i.message.includes("Nested dialogue"),
      );
      expect(nestedIssues.length).toBeGreaterThan(0);
      // Fix should suggest double brackets
      expect(nestedIssues[0].fix?.replacement).toContain("『");
      expect(nestedIssues[0].fix?.replacement).toContain("』");
    });

    it("should not flag when inner brackets already use double brackets", () => {
      const text = "「彼が『ありがとう』と言った」と話した。";
      const issues = rule.lint(text, config);
      const nestedIssues = issues.filter(
        (i) => i.message.includes("Nested dialogue"),
      );
      expect(nestedIssues).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Sub-check 2: Empty brackets
  // -----------------------------------------------------------------------
  describe("empty brackets", () => {
    it("should detect empty single brackets", () => {
      const issues = rule.lint("彼は「」と答えた。", config);
      const emptyIssues = issues.filter(
        (i) => i.message.includes("Empty brackets"),
      );
      expect(emptyIssues.length).toBeGreaterThan(0);
    });

    it("should detect empty double brackets", () => {
      const issues = rule.lint("彼は『』と答えた。", config);
      const emptyIssues = issues.filter(
        (i) => i.message.includes("Empty brackets"),
      );
      expect(emptyIssues.length).toBeGreaterThan(0);
    });

    it("should not flag non-empty brackets", () => {
      const issues = rule.lint("「ありがとう」と言った。", config);
      const emptyIssues = issues.filter(
        (i) => i.message.includes("Empty brackets"),
      );
      expect(emptyIssues).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Sub-check 3: Unclosed brackets
  // -----------------------------------------------------------------------
  describe("unclosed brackets", () => {
    it("should detect unmatched opening bracket", () => {
      const issues = rule.lint("「ありがとう、と言った。", config);
      const unclosedIssues = issues.filter(
        (i) => i.message.includes("Unmatched"),
      );
      expect(unclosedIssues.length).toBeGreaterThan(0);
    });

    it("should detect unmatched closing bracket", () => {
      const issues = rule.lint("ありがとう」と言った。", config);
      const unclosedIssues = issues.filter(
        (i) => i.message.includes("Unmatched"),
      );
      expect(unclosedIssues.length).toBeGreaterThan(0);
    });

    it("should not flag properly matched brackets", () => {
      const issues = rule.lint("「ありがとう」と言った。", config);
      const unclosedIssues = issues.filter(
        (i) => i.message.includes("Unmatched"),
      );
      expect(unclosedIssues).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Clean text without dialogue
  // -----------------------------------------------------------------------
  it("should not flag text without brackets", () => {
    const issues = rule.lint("今日は天気が良い。", config);
    expect(issues).toHaveLength(0);
  });
});
