/**
 * Tests for L1 rule false-positive fixes.
 *
 * Each section tests that:
 *  - True positives are still detected
 *  - Known false positives are suppressed
 */
import { describe, it, expect } from "vitest";

import type { LintRuleConfig } from "../types";
import { createManuscriptL1Rules } from "../rules/json-l1/manuscript-l1-rules";
import { createNihongoHyoukiL1Rules } from "../rules/json-l1/nihongo-hyouki-l1-rules";
import { createJtfL1Rules } from "../rules/json-l1/jtf-l1-rules";

const CFG: LintRuleConfig = { enabled: true, severity: "warning" };

function findRule<T extends { id: string }>(rules: T[], id: string): T {
  const rule = rules.find((r) => r.id === id);
  if (!rule) throw new Error(`Rule ${id} not found`);
  return rule;
}

// ---------------------------------------------------------------------------
// me2-13-unit-symbols
// ---------------------------------------------------------------------------
describe("me2-13-unit-symbols", () => {
  const rule = findRule(createManuscriptL1Rules(), "me2-13-unit-symbols");

  it("should flag missing spacing: 5km -> 5 km", () => {
    const issues = rule.lint("5km", CFG);
    expect(issues).toHaveLength(1);
    expect(issues[0].fix?.replacement).toBe(" km");
  });

  it("should flag missing spacing: 100mg", () => {
    const issues = rule.lint("100mg", CFG);
    expect(issues).toHaveLength(1);
  });

  it("should NOT flag already-spaced units: 5 km", () => {
    const issues = rule.lint("5 km", CFG);
    expect(issues).toHaveLength(0);
  });

  it("should no longer suggest katakana conversion", () => {
    // Previously this rule would suggest km -> キロメートル
    const issues = rule.lint("5 km", CFG);
    const katakanaIssue = issues.find((i) => i.fix?.replacement === "キロメートル");
    expect(katakanaIssue).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// nh-10-units
// ---------------------------------------------------------------------------
describe("nh-10-units", () => {
  const rule = findRule(createNihongoHyoukiL1Rules(), "nh-10-units");

  it("should flag incorrect SI casing: 5KG -> kg", () => {
    const issues = rule.lint("5KG", CFG);
    expect(issues).toHaveLength(1);
    expect(issues[0].fix?.replacement).toBe("kg");
  });

  it("should flag incorrect SI casing: 100HZ -> Hz", () => {
    const issues = rule.lint("100HZ", CFG);
    expect(issues).toHaveLength(1);
    expect(issues[0].fix?.replacement).toBe("Hz");
  });

  it("should flag spacing: 5 kg -> remove space", () => {
    const issues = rule.lint("5 kg", CFG);
    expect(issues).toHaveLength(1);
    expect(issues[0].fix?.replacement).toBe("");
  });

  it("should NOT flag full-width ＡＩ as a unit issue", () => {
    const issues = rule.lint("ＡＩの技術", CFG);
    expect(issues).toHaveLength(0);
  });

  it("should NOT flag full-width ＨＴＭＬ as a unit issue", () => {
    const issues = rule.lint("ＨＴＭＬファイル", CFG);
    expect(issues).toHaveLength(0);
  });

  it("should NOT flag full-width Ｃ as a unit issue", () => {
    const issues = rule.lint("Ｃ言語", CFG);
    expect(issues).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// nh-11-symbols (dash detection)
// ---------------------------------------------------------------------------
describe("nh-11-symbols dash detection", () => {
  const rule = findRule(createNihongoHyoukiL1Rules(), "nh-11-symbols");

  it("should flag dash in Japanese context: 彼女は-と言った", () => {
    const issues = rule.lint("彼女は-と言った", CFG);
    const dashIssues = issues.filter((i) => i.fix?.replacement === "——");
    expect(dashIssues.length).toBeGreaterThanOrEqual(1);
  });

  it("should flag double dash in Japanese context: 彼女は--と言った", () => {
    const issues = rule.lint("彼女は--と言った", CFG);
    const dashIssues = issues.filter((i) => i.fix?.replacement === "——");
    expect(dashIssues.length).toBeGreaterThanOrEqual(1);
  });

  it("should NOT flag hyphenated English words: foo-bar", () => {
    const issues = rule.lint("foo-bar", CFG);
    const dashIssues = issues.filter((i) => i.fix?.replacement === "——");
    expect(dashIssues).toHaveLength(0);
  });

  it("should NOT flag dates: 2024-01-01", () => {
    const issues = rule.lint("2024-01-01", CFG);
    const dashIssues = issues.filter((i) => i.fix?.replacement === "——");
    expect(dashIssues).toHaveLength(0);
  });

  it("should NOT flag command-line flags: --verbose", () => {
    const issues = rule.lint("--verbose", CFG);
    const dashIssues = issues.filter((i) => i.fix?.replacement === "——");
    expect(dashIssues).toHaveLength(0);
  });

  it("should NOT flag Markdown horizontal rules: ---", () => {
    const issues = rule.lint("---", CFG);
    const dashIssues = issues.filter((i) => i.fix?.replacement === "——");
    expect(dashIssues).toHaveLength(0);
  });
});

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

// ---------------------------------------------------------------------------
// Preset configuration
// ---------------------------------------------------------------------------
describe("lint preset configuration", () => {
  it("should disable me2-11 in strict preset to avoid contradiction with me2-12", async () => {
    const { LINT_PRESETS } = await import("../lint-presets");
    expect(LINT_PRESETS.strict.configs["me2-11-vertical-numbers"].enabled).toBe(false);
  });
});
