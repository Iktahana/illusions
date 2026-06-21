/**
 * Pure helpers for the "すべて有効 / すべて無効" bulk actions in RulesetList.
 *
 * Extracted so the rule-id collection can be unit-tested without React.
 * Before #1832 the bulk handlers iterated only the (now-empty) built-in
 * `LINT_RULES_META`, so they silently no-op'd once all rules moved to
 * external rulesets.
 */

import type { Severity } from "@/lib/linting/types";

export interface RuleConfig {
  enabled: boolean;
  severity: Severity;
  skipDialogue?: boolean;
}

interface RulesetLike {
  rules: ReadonlyArray<{ ruleId: string }>;
}

/**
 * Collect every rule id currently shown in the settings panel:
 * built-in (`LINT_RULES_META`) ∪ external rulesets. Order is built-ins
 * first, then rulesets in listing order; duplicates are preserved by the
 * caller's map semantics (last write wins, which is idempotent here).
 */
export function collectAllRuleIds(
  builtInRuleIds: ReadonlyArray<string>,
  rulesets: ReadonlyArray<RulesetLike> | undefined,
): string[] {
  const ids = [...builtInRuleIds];
  if (rulesets) {
    for (const rs of rulesets) {
      for (const rule of rs.rules) {
        ids.push(rule.ruleId);
      }
    }
  }
  return ids;
}

/**
 * Build the replacement config map for a bulk enable/disable: start from the
 * current configs (preserving severity/skipDialogue and any unlisted rules)
 * and set `enabled` on every collected rule id.
 */
export function buildBulkConfig(
  current: Readonly<Record<string, RuleConfig>>,
  ruleIds: ReadonlyArray<string>,
  enabled: boolean,
  getConfig: (ruleId: string, configs: Record<string, RuleConfig>) => RuleConfig,
): Record<string, RuleConfig> {
  const next: Record<string, RuleConfig> = { ...current };
  for (const ruleId of ruleIds) {
    next[ruleId] = { ...getConfig(ruleId, next), enabled };
  }
  return next;
}
