import type { LintRule, RuleLevel } from "@/lib/linting/types";

// ---------------------------------------------------------------------------
// L1 JSON-driven factory rules from Japanese-Style-Sheet
// ---------------------------------------------------------------------------
import { createJtfL1Rules } from "@/lib/linting/rules/json-l1/jtf-l1-rules";

/**
 * Return all hand-written rule instances (morphological L2 rules and other
 * non-JSON-driven rules).
 *
 * Currently empty: the hand-written L2 (kuromoji) rules were removed when dev
 * was re-aligned to the v1.2.7 rollback baseline — they were NOT migrated to
 * the JSON-driven factories, which cover L1 (regex) rules only.
 *
 * This is a live registration point, not dead code: `RuleRunnerProxy`
 * (packages/milkdown-plugin-japanese-novel/linting-plugin/worker/rule-runner-proxy.ts)
 * registers any morphological rules returned here onto its main-thread
 * RuleRunner. Re-add future L2 rules HERE — not in the JSON-driven factories —
 * so they run on the main thread, where kuromoji tokenization is available
 * (it is not available inside the lint worker).
 */
export function getAllRules(): LintRule[] {
  return [];
}

/** Return all JSON-driven L1 rules from the style-sheet factories. */
export function createJsonDrivenRules(): LintRule[] {
  return [...createJtfL1Rules()];
}

/** Lazily-built map of rule ID -> detection level, covering ALL registered rule instances (hand-written via getAllRules + JSON-driven factories). */
let ruleLevelMap: ReadonlyMap<string, RuleLevel> | null = null;

/**
 * Return a map of rule ID -> detection level (L1/L2/L3), built from the actual
 * rule instances so the UI never drifts from what the engine runs. Memoized.
 */
export function getRuleLevelMap(): ReadonlyMap<string, RuleLevel> {
  if (ruleLevelMap === null) {
    ruleLevelMap = new Map(
      [...getAllRules(), ...createJsonDrivenRules()].map((rule) => [rule.id, rule.level]),
    );
  }
  return ruleLevelMap;
}
