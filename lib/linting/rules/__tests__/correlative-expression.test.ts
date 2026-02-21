import { describe, it, expect } from "vitest";

import { CorrelativeExpressionRule } from "../correlative-expression";

describe("correlative-expression", () => {
  const rule = new CorrelativeExpressionRule();
  const config = rule.defaultConfig;

  it("should have correct metadata", () => {
    expect(rule.id).toBe("correlative-expression");
    expect(rule.level).toBe("L1");
  });

  it("should return no issues for empty text", () => {
    expect(rule.lint("", config)).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // Negation correlatives
  // -----------------------------------------------------------------------
  describe("negation correlatives", () => {
    it("should not flag correct correlative: 決して...ない", () => {
      const issues = rule.lint("決して諦めない。", config);
      const correlative = issues.filter(
        (i) => i.ruleId === "correlative-expression",
      );
      expect(correlative).toHaveLength(0);
    });

    it("should detect mismatch: 決して without negative ending", () => {
      const issues = rule.lint("決して頑張る。", config);
      const correlative = issues.filter(
        (i) => i.ruleId === "correlative-expression",
      );
      expect(correlative.length).toBeGreaterThan(0);
    });

    it("should not flag correct: 全く...ません", () => {
      const issues = rule.lint("全く分かりません。", config);
      const correlative = issues.filter(
        (i) => i.ruleId === "correlative-expression",
      );
      expect(correlative).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Conjecture correlatives
  // -----------------------------------------------------------------------
  describe("conjecture correlatives", () => {
    it("should not flag correct: おそらく...だろう", () => {
      const issues = rule.lint("おそらく彼は来るだろう。", config);
      const correlative = issues.filter(
        (i) => i.ruleId === "correlative-expression",
      );
      expect(correlative).toHaveLength(0);
    });

    it("should detect mismatch: おそらく without conjecture ending", () => {
      const issues = rule.lint("おそらく彼は来る。", config);
      const correlative = issues.filter(
        (i) => i.ruleId === "correlative-expression",
      );
      expect(correlative.length).toBeGreaterThan(0);
    });

    it("should not flag correct: たぶん...だろう", () => {
      const issues = rule.lint("たぶん彼は来るだろう。", config);
      const correlative = issues.filter(
        (i) => i.ruleId === "correlative-expression",
      );
      expect(correlative).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Conditional correlatives
  // -----------------------------------------------------------------------
  describe("conditional correlatives", () => {
    it("should not flag correct: もし...たら", () => {
      // Sentence must END with conditional pattern
      const issues = rule.lint("もし時間があったら。", config);
      const correlative = issues.filter(
        (i) => i.ruleId === "correlative-expression",
      );
      expect(correlative).toHaveLength(0);
    });

    it("should detect mismatch: もし without conditional ending", () => {
      const issues = rule.lint("もし明日は晴れる。", config);
      const correlative = issues.filter(
        (i) => i.ruleId === "correlative-expression",
      );
      expect(correlative.length).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // Simile correlatives
  // -----------------------------------------------------------------------
  describe("simile correlatives", () => {
    it("should not flag correct: まるで...ようだ", () => {
      const issues = rule.lint("まるで夢のようだ。", config);
      const correlative = issues.filter(
        (i) => i.ruleId === "correlative-expression",
      );
      expect(correlative).toHaveLength(0);
    });

    it("should detect mismatch: まるで without simile ending", () => {
      const issues = rule.lint("まるで夢だった。", config);
      const correlative = issues.filter(
        (i) => i.ruleId === "correlative-expression",
      );
      expect(correlative.length).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // Interrogative correlatives
  // -----------------------------------------------------------------------
  describe("interrogative correlatives", () => {
    it("should not flag correct: なぜ...か", () => {
      const issues = rule.lint("なぜ彼は来なかったのか。", config);
      const correlative = issues.filter(
        (i) => i.ruleId === "correlative-expression",
      );
      expect(correlative).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Text without correlatives
  // -----------------------------------------------------------------------
  it("should return no issues for text without correlative adverbs", () => {
    const issues = rule.lint("今日は天気が良い。", config);
    expect(issues).toHaveLength(0);
  });
});
