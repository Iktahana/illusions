/**
 * Tests for the bulk enable/disable helpers (#1832).
 *
 * Regression: after built-in rules were zeroed, "すべて無効 / すべて有効"
 * iterated only the empty LINT_RULES_META, so external-ruleset rules were
 * never toggled (the buttons silently no-op'd).
 */

import { describe, it, expect } from "vitest";

import { buildBulkConfig, collectAllRuleIds, type RuleConfig } from "../bulk-toggle";

const getConfig = (ruleId: string, configs: Record<string, RuleConfig>): RuleConfig =>
  configs[ruleId] ?? { enabled: true, severity: "warning" };

describe("collectAllRuleIds (#1832)", () => {
  it("includes external ruleset rule ids even when built-ins are empty", () => {
    const ids = collectAllRuleIds(
      [],
      [{ rules: [{ ruleId: "a" }, { ruleId: "b" }] }, { rules: [{ ruleId: "c" }] }],
    );
    expect(ids).toEqual(["a", "b", "c"]);
  });

  it("merges built-in and external ids", () => {
    const ids = collectAllRuleIds(["builtin-1"], [{ rules: [{ ruleId: "ext-1" }] }]);
    expect(ids).toEqual(["builtin-1", "ext-1"]);
  });

  it("handles undefined rulesetStatus (Web)", () => {
    expect(collectAllRuleIds(["x"], undefined)).toEqual(["x"]);
  });
});

describe("buildBulkConfig (#1832)", () => {
  const current: Record<string, RuleConfig> = {
    a: { enabled: true, severity: "warning" },
    b: { enabled: true, severity: "error" },
    c: { enabled: true, severity: "warning" },
  };

  it("disables every collected rule id (the core #1832 bug)", () => {
    const next = buildBulkConfig(current, ["a", "b", "c"], false, getConfig);
    expect(next.a.enabled).toBe(false);
    expect(next.b.enabled).toBe(false);
    expect(next.c.enabled).toBe(false);
  });

  it("preserves severity / skipDialogue when toggling", () => {
    const withSkip: Record<string, RuleConfig> = {
      a: { enabled: true, severity: "error", skipDialogue: true },
    };
    const next = buildBulkConfig(withSkip, ["a"], false, getConfig);
    expect(next.a).toEqual({ enabled: false, severity: "error", skipDialogue: true });
  });

  it("enables every collected rule id", () => {
    const allOff: Record<string, RuleConfig> = {
      a: { enabled: false, severity: "warning" },
    };
    const next = buildBulkConfig(allOff, ["a", "b"], true, getConfig);
    expect(next.a.enabled).toBe(true);
    expect(next.b.enabled).toBe(true);
  });

  it("does not mutate the input config", () => {
    buildBulkConfig(current, ["a"], false, getConfig);
    expect(current.a.enabled).toBe(true);
  });

  it("is a no-op on rule ids when the list is empty (documents the old bug)", () => {
    const next = buildBulkConfig(current, [], false, getConfig);
    expect(next.a.enabled).toBe(true); // unchanged — exactly what went wrong pre-#1832
  });
});
