/**
 * Tests for L1 rule false-positive fixes.
 *
 * Each section tests that:
 *  - True positives are still detected
 *  - Known false positives are suppressed
 */
import { describe, it, expect } from "vitest";

import type { LintRuleConfig } from "../types";
import { createJtfL1Rules } from "../rules/json-l1/jtf-l1-rules";

const CFG: LintRuleConfig = { enabled: true, severity: "warning" };

function findRule<T extends { id: string }>(rules: T[], id: string): T {
  const rule = rules.find((r) => r.id === id);
  if (!rule) throw new Error(`Rule ${id} not found`);
  return rule;
}

// ---------------------------------------------------------------------------
// jtf-2-2-1-kanji
// ---------------------------------------------------------------------------
describe("jtf-2-2-1-kanji word boundary", () => {
  const rule = findRule(createJtfL1Rules(), "jtf-2-2-1-kanji");

  it("should flag standalone もっとも -> 最も", () => {
    const issues = rule.lint("もっとも重要な", CFG);
    expect(issues).toHaveLength(1);
    expect(issues[0].fix?.replacement).toBe("最も");
  });

  it("should NOT flag もっとも inside もっともらしい", () => {
    const issues = rule.lint("もっともらしい説明", CFG);
    expect(issues).toHaveLength(0);
  });

  it("should flag standalone まったく -> 全く", () => {
    const issues = rule.lint("まったく問題ない", CFG);
    expect(issues).toHaveLength(1);
    expect(issues[0].fix?.replacement).toBe("全く");
  });

  it("should flag standalone すべて -> 全て", () => {
    const issues = rule.lint("すべての人", CFG);
    expect(issues).toHaveLength(1);
    expect(issues[0].fix?.replacement).toBe("全て");
  });

  it("should flag すでに even when followed by hiragana particle", () => {
    const issues = rule.lint("すでにある", CFG);
    expect(issues).toHaveLength(1);
    expect(issues[0].fix?.replacement).toBe("既に");
  });

  it("should flag かならず followed by kanji", () => {
    const issues = rule.lint("かならず来る", CFG);
    expect(issues).toHaveLength(1);
    expect(issues[0].fix?.replacement).toBe("必ず");
  });

  it("should flag すべて at end of text", () => {
    const issues = rule.lint("問題はすべて", CFG);
    expect(issues).toHaveLength(1);
  });

  it("should flag いっさい preceded by kanji", () => {
    const issues = rule.lint("関係いっさい無し", CFG);
    expect(issues).toHaveLength(1);
    expect(issues[0].fix?.replacement).toBe("一切");
  });

  it("should NOT flag すべて inside すべからく", () => {
    const issues = rule.lint("すべからく努力すべし", CFG);
    const subet = issues.filter((i) => i.fix?.replacement === "全て");
    expect(subet).toHaveLength(0);
  });
});
