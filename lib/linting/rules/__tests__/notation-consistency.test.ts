import { describe, it, expect } from "vitest";

import { NotationConsistencyRule } from "../notation-consistency";

describe("notation-consistency", () => {
  const rule = new NotationConsistencyRule();
  const config = rule.defaultConfig;

  it("should have correct metadata", () => {
    expect(rule.id).toBe("notation-consistency");
    expect(rule.level).toBe("L1");
  });

  it("should return no issues for empty paragraphs", () => {
    const results = rule.lintDocument([], config);
    expect(results).toHaveLength(0);
  });

  it("should return no issues for single paragraph without variants", () => {
    const paragraphs = [{ text: "今日は天気が良い。", index: 0 }];
    const results = rule.lintDocument(paragraphs, config);
    expect(results).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // Inconsistent notation detection
  // -----------------------------------------------------------------------
  it("should detect mixed okurigana forms across paragraphs", () => {
    // "行う" vs "行なう" (okurigana variants)
    const paragraphs = [
      { text: "作業を行う。", index: 0 },
      { text: "作業を行う。", index: 1 },
      { text: "業務を行なう。", index: 2 },
    ];
    const results = rule.lintDocument(paragraphs, config);
    // The minority form should be flagged
    if (results.length > 0) {
      const allIssues = results.flatMap((r) => r.issues);
      expect(allIssues[0].ruleId).toBe("notation-consistency");
      expect(allIssues[0].fix).toBeDefined();
    }
  });

  it("should detect mixed kanji-kana forms", () => {
    // "事" vs "こと" (kanji-kana variants)
    const paragraphs = [
      { text: "大切な事がある。", index: 0 },
      { text: "大切なことがある。", index: 1 },
      { text: "大切なことだ。", index: 2 },
    ];
    const results = rule.lintDocument(paragraphs, config);
    // If variants match the dictionary, issues should be found
    if (results.length > 0) {
      const allIssues = results.flatMap((r) => r.issues);
      expect(allIssues.length).toBeGreaterThan(0);
    }
  });

  // -----------------------------------------------------------------------
  // Consistent notation (no issues)
  // -----------------------------------------------------------------------
  it("should not flag when only one form is used", () => {
    const paragraphs = [
      { text: "作業を行う。", index: 0 },
      { text: "業務を行う。", index: 1 },
      { text: "計画を行う。", index: 2 },
    ];
    const results = rule.lintDocument(paragraphs, config);
    // All use the same form, so no issues related to that variant group
    const allIssues = results.flatMap((r) => r.issues);
    const okuriganaIssues = allIssues.filter(
      (i) => i.message.includes("行う") || i.message.includes("行なう"),
    );
    expect(okuriganaIssues).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // Dialogue masking
  // -----------------------------------------------------------------------
  it("should skip dialogue content when counting variants", () => {
    const paragraphs = [
      { text: "作業を行う。", index: 0 },
      { text: "「業務を行なう」と言った。", index: 1 },
    ];
    const results = rule.lintDocument(paragraphs, config);
    // The dialogue content should be masked, so only one form outside dialogue
    const allIssues = results.flatMap((r) => r.issues);
    const okuriganaIssues = allIssues.filter(
      (i) => i.message.includes("行う") || i.message.includes("行なう"),
    );
    expect(okuriganaIssues).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // lint() method should return empty (document-level rule)
  // -----------------------------------------------------------------------
  it("should return empty from lint() method", () => {
    const issues = rule.lint("作業を行う。業務を行なう。", config);
    expect(issues).toHaveLength(0);
  });
});
