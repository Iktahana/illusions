import { describe, expect, test } from "vitest";
import { getRuleLevelMap, createJsonDrivenRules } from "@/lib/linting/rule-registry";
import { LINT_RULES_META } from "@/lib/linting/lint-presets";

describe("getRuleLevelMap", () => {
  test("covers every rule produced by the factories", () => {
    const rules = createJsonDrivenRules();
    const levels = getRuleLevelMap();
    // The map may grow beyond the JSON-driven factories once hand-written
    // (e.g. L2 morphological) rules are re-added via getAllRules().
    expect(levels.size).toBeGreaterThanOrEqual(rules.length);
    for (const rule of rules) {
      expect(levels.get(rule.id)).toBe(rule.level);
    }
  });

  test("every settings metadata entry has a known level (invariant holds trivially when META is empty)", () => {
    const levels = getRuleLevelMap();
    // LINT_RULES_META is currently empty (all rules migrated to external rulesets).
    // The invariant: every META entry must appear in the level map.
    // With an empty META this vacuously passes; it will catch regressions if
    // built-in rules are re-added without a corresponding registry entry.
    const missing = LINT_RULES_META.filter((m) => !levels.has(m.id)).map((m) => m.id);
    expect(missing).toEqual([]);
  });

  test("returns a Map instance", () => {
    expect(getRuleLevelMap()).toBeInstanceOf(Map);
  });

  test("returns a memoized identical reference", () => {
    expect(getRuleLevelMap()).toBe(getRuleLevelMap());
  });
});
