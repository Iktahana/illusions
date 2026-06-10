import { describe, expect, test } from "vitest";
import { getRuleLevelMap, createJsonDrivenRules } from "@/lib/linting/rule-registry";
import { LINT_RULES_META } from "@/lib/linting/lint-presets";

describe("getRuleLevelMap", () => {
  test("covers every rule produced by the factories", () => {
    const rules = createJsonDrivenRules();
    const levels = getRuleLevelMap();
    expect(levels.size).toBe(rules.length);
    for (const rule of rules) {
      expect(levels.get(rule.id)).toBe(rule.level);
    }
  });

  test("every settings metadata entry has a known level", () => {
    const levels = getRuleLevelMap();
    const missing = LINT_RULES_META.filter((m) => !levels.has(m.id)).map((m) => m.id);
    expect(missing).toEqual([]);
  });

  test("returns a memoized identical reference", () => {
    expect(getRuleLevelMap()).toBe(getRuleLevelMap());
  });
});
