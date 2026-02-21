import { describe, it, expect } from "vitest";

import { RedundantExpressionRule } from "../redundant-expression";

describe("redundant-expression", () => {
  const rule = new RedundantExpressionRule();
  const config = rule.defaultConfig;

  it("should have correct metadata", () => {
    expect(rule.id).toBe("redundant-expression");
    expect(rule.level).toBe("L1");
  });

  it("should return no issues for empty text", () => {
    expect(rule.lint("", config)).toHaveLength(0);
  });

  it("should detect classic redundant expression '頭痛が痛い'", () => {
    const issues = rule.lint("頭痛が痛いので休みます。", config);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].ruleId).toBe("redundant-expression");
    expect(issues[0].fix?.replacement).toBe("頭が痛い");
  });

  it("should detect '一番最初'", () => {
    const issues = rule.lint("一番最初に到着した。", config);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].fix?.replacement).toBe("最初");
  });

  it("should detect '違和感を感じる'", () => {
    const issues = rule.lint("違和感を感じる表現だ。", config);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].fix?.replacement).toBe("違和感がある");
  });

  it("should detect '後で後悔'", () => {
    const issues = rule.lint("後で後悔しないように。", config);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].fix?.replacement).toBe("後悔");
  });

  it("should detect multiple redundant expressions", () => {
    const issues = rule.lint("一番最初に頭痛が痛い。", config);
    expect(issues.length).toBeGreaterThanOrEqual(2);
  });

  it("should not flag clean text", () => {
    const issues = rule.lint("今日は天気が良い。", config);
    expect(issues).toHaveLength(0);
  });

  it("should skip redundant expressions inside dialogue", () => {
    const issues = rule.lint("「頭痛が痛い」と言った。", config);
    expect(issues).toHaveLength(0);
  });
});
