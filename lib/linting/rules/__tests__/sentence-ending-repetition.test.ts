import { describe, it, expect } from "vitest";

import { SentenceEndingRepetitionRule } from "../sentence-ending-repetition";

describe("sentence-ending-repetition", () => {
  const rule = new SentenceEndingRepetitionRule();
  const config = rule.defaultConfig;

  it("should have correct metadata", () => {
    expect(rule.id).toBe("sentence-ending-repetition");
    expect(rule.level).toBe("L1");
  });

  it("should return no issues for empty text", () => {
    expect(rule.lint("", config)).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // Detection of repeated endings
  // -----------------------------------------------------------------------
  it("should detect 3+ consecutive sentences with same ending", () => {
    // All 3 sentences end with ます
    const text = "彼は行きます。私も行きます。皆で行きます。";
    const issues = rule.lint(text, config);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].ruleId).toBe("sentence-ending-repetition");
  });

  it("should not flag 2 consecutive sentences with same ending (below threshold)", () => {
    const text = "彼は行きます。私も行きます。";
    const issues = rule.lint(text, config);
    expect(issues).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // No repetition
  // -----------------------------------------------------------------------
  it("should not flag varied sentence endings", () => {
    const text = "彼は行きます。私は走った。皆で泳いだ。";
    const issues = rule.lint(text, config);
    expect(issues).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // Custom threshold
  // -----------------------------------------------------------------------
  it("should respect custom threshold", () => {
    const text = "彼は行きます。私も行きます。";
    const strictConfig = {
      ...config,
      options: { threshold: 2 },
    };
    const issues = rule.lint(text, strictConfig);
    expect(issues.length).toBeGreaterThan(0);
  });

  // -----------------------------------------------------------------------
  // Fewer sentences than threshold
  // -----------------------------------------------------------------------
  it("should return no issues for single sentence", () => {
    const issues = rule.lint("一文だけです。", config);
    expect(issues).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // Long repeated runs
  // -----------------------------------------------------------------------
  it("should detect long runs of repeated endings", () => {
    const text =
      "彼はいます。私もいます。猫がいます。犬もいます。鳥がいます。";
    const issues = rule.lint(text, config);
    expect(issues.length).toBeGreaterThan(0);
  });
});
