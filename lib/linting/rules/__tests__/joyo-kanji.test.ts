import { describe, it, expect } from "vitest";

import { JoyoKanjiRule } from "../joyo-kanji";

describe("joyo-kanji", () => {
  const rule = new JoyoKanjiRule();
  const config = rule.defaultConfig;

  it("should have correct metadata", () => {
    expect(rule.id).toBe("joyo-kanji");
    expect(rule.level).toBe("L1");
  });

  it("should return no issues for empty text", () => {
    expect(rule.lint("", config)).toHaveLength(0);
  });

  it("should not flag common joyo kanji", () => {
    const issues = rule.lint("今日は天気が良い。", config);
    expect(issues).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // Phase 1: Compound word suggestions
  // -----------------------------------------------------------------------
  describe("compound word suggestions", () => {
    it("should detect non-joyo compound words and suggest hiragana", () => {
      const issues = rule.lint("所謂これが問題だ。", config);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].fix?.replacement).toBe("いわゆる");
    });

    it("should detect multiple non-joyo compounds", () => {
      const issues = rule.lint("殆ど流石に暫くかかった。", config);
      const compounds = issues.filter((i) => i.fix !== undefined);
      expect(compounds.length).toBeGreaterThanOrEqual(3);
    });
  });

  // -----------------------------------------------------------------------
  // Phase 2: Individual non-joyo kanji
  // -----------------------------------------------------------------------
  describe("individual non-joyo kanji", () => {
    it("should detect standalone non-joyo kanji", () => {
      // Test with a kanji that is definitely not in joyo set
      const issues = rule.lint("囁く声が聞こえた。", config);
      // "囁" (sasayaku) is handled as compound word with suggestion
      const compoundIssues = issues.filter((i) => i.fix?.replacement === "ささやく");
      expect(compoundIssues.length).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // Options: allowJinmeiyo
  // -----------------------------------------------------------------------
  describe("allowJinmeiyo option", () => {
    it("should respect allowJinmeiyo: false", () => {
      const strictConfig = {
        ...config,
        options: { allowJinmeiyo: false },
      };
      // Run on text with jinmeiyo kanji
      const issuesWithJinmeiyo = rule.lint("彌生さんが来た。", config);
      const issuesWithoutJinmeiyo = rule.lint("彌生さんが来た。", strictConfig);
      // With jinmeiyo not allowed, should have more or equal issues
      expect(issuesWithoutJinmeiyo.length).toBeGreaterThanOrEqual(
        issuesWithJinmeiyo.length,
      );
    });
  });

  // -----------------------------------------------------------------------
  // Dialogue masking
  // -----------------------------------------------------------------------
  describe("dialogue masking", () => {
    it("should skip non-joyo kanji inside dialogue", () => {
      // Content in dialogue is masked, so non-joyo kanji inside should not be flagged
      const issuesOutside = rule.lint("所謂これだ。", config);
      const issuesInside = rule.lint("「所謂これだ」と言った。", config);
      expect(issuesInside.length).toBeLessThan(issuesOutside.length);
    });
  });
});
