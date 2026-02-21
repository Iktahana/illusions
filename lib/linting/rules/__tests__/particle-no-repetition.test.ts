import { describe, it, expect } from "vitest";

import { ParticleNoRepetitionRule } from "../particle-no-repetition";

describe("particle-no-repetition", () => {
  const rule = new ParticleNoRepetitionRule();
  const config = rule.defaultConfig;

  it("should have correct metadata", () => {
    expect(rule.id).toBe("particle-no-repetition");
    expect(rule.level).toBe("L1");
  });

  it("should return no issues for empty text", () => {
    expect(rule.lint("", config)).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // Detection of excessive particle usage
  // -----------------------------------------------------------------------
  it("should detect excessive particle usage (4+ occurrences)", () => {
    const text = "私の友人の兄の会社の社長が来た。";
    const issues = rule.lint(text, config);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].ruleId).toBe("particle-no-repetition");
  });

  it("should not flag text with few particle usages", () => {
    const text = "私の友人が来た。";
    const issues = rule.lint(text, config);
    expect(issues).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // Exception words (this, that, etc.)
  // -----------------------------------------------------------------------
  it("should exclude exception words like 'この', 'その'", () => {
    // "この" and "その" contain の but are not particle usage
    const text = "この問題のことをその人に聞いた。";
    const issues = rule.lint(text, config);
    expect(issues).toHaveLength(0);
  });

  it("should exclude 'ものの' from particle count", () => {
    const text = "努力したものの結果は出なかった。";
    const issues = rule.lint(text, config);
    expect(issues).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // Custom threshold
  // -----------------------------------------------------------------------
  it("should respect custom threshold", () => {
    const text = "私の友人の兄が来た。"; // 2 instances of の
    const strictConfig = {
      ...config,
      options: { threshold: 2 },
    };
    const issues = rule.lint(text, strictConfig);
    expect(issues.length).toBeGreaterThan(0);
  });

  // -----------------------------------------------------------------------
  // Dialogue masking
  // -----------------------------------------------------------------------
  it("should skip dialogue content", () => {
    const text = "「私の友人の兄の会社の社長です」と言った。";
    const issues = rule.lint(text, config);
    expect(issues).toHaveLength(0);
  });
});
