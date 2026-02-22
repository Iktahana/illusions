import { describe, it, expect } from "vitest";

import { VerboseExpressionRule } from "../verbose-expression";

describe("verbose-expression", () => {
  const rule = new VerboseExpressionRule();
  const config = rule.defaultConfig;

  it("should have correct metadata", () => {
    expect(rule.id).toBe("verbose-expression");
    expect(rule.level).toBe("L1");
  });

  it("should return no issues for empty text", () => {
    expect(rule.lint("", config)).toHaveLength(0);
  });

  it("should detect 'することができる'", () => {
    const issues = rule.lint("これをすることができる。", config);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].fix?.replacement).toBe("できる");
  });

  it("should detect 'ないわけではない' (double negative)", () => {
    const issues = rule.lint("できないわけではない。", config);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].fix?.replacement).toBe("できる");
  });

  it("should detect 'において'", () => {
    const issues = rule.lint("この場所において実施する。", config);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].fix?.replacement).toBe("で");
  });

  it("should detect 'における'", () => {
    const issues = rule.lint("現場における問題を解決する。", config);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].fix?.replacement).toBe("の");
  });

  it("should detect 'というふうに'", () => {
    const issues = rule.lint("彼はそうだというふうに言った。", config);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].fix?.replacement).toBe("と");
  });

  it("should not flag clean text", () => {
    const issues = rule.lint("今日は天気が良い。", config);
    expect(issues).toHaveLength(0);
  });

  it("should sort issues by position", () => {
    const text = "ここにおいて実施することができる。";
    const issues = rule.lint(text, config);
    if (issues.length >= 2) {
      expect(issues[0].from).toBeLessThanOrEqual(issues[1].from);
    }
  });

  it("should skip verbose expressions inside dialogue", () => {
    const issues = rule.lint("「することができる」と言った。", config);
    expect(issues).toHaveLength(0);
  });
});
