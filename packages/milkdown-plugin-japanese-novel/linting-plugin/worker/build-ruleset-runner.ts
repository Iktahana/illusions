/**
 * Shared ruleset-runner builder.
 *
 * Both the lint Web Worker (`linting.worker.ts`) and the main-thread
 * fallback inside `RuleRunnerProxy` build a `RuleRunner` from
 * legacy rules ∪ loaded external ruleset modules. Keeping the logic in
 * one place ensures the fallback produces byte-for-byte the same rule set
 * the worker would have — critical for #1831 where the worker fails to
 * start in packaged Electron (file:// → `location.origin === "null"`
 * breaks the Turbopack worker bootstrap's `new URL(chunk, origin)`).
 */

import { RuleRunner } from "@/lib/linting/rule-runner";
import { RulesetRegistry } from "@/lib/linting/registry/ruleset-registry";
import { createRulesetContext } from "@/lib/linting/registry/ruleset-context-factory";
import type { RulesetContext } from "@/lib/linting/sdk/ruleset-context";
import type { DictToolkitInternal } from "@/lib/linting/toolkit";
import type { RulesetModule } from "@/lib/linting/sdk/ruleset-types";
import type { LintRule, LintRuleConfig } from "@/lib/linting/types";

/** A DictLike that always returns empty — async dict access is unreachable here. */
const NO_OP_DICT = {
  async lookupBatch(_terms: string[]): Promise<Map<string, never>> {
    return new Map<string, never>();
  },
  async has(_term: string): Promise<boolean> {
    return false;
  },
};

/**
 * Build the isolated RulesetContext used to instantiate external rules.
 *
 * Pass `dictToolkit` (a persistent snapshot-backed toolkit) to enable
 * `dict:genji` rules: the renderer prewarms membership per batch and installs it
 * via `dictToolkit.setSnapshot`, so the rule reads `dict.hasCached/lookupCached`
 * synchronously. The requirement is marked satisfied because the snapshot path
 * supplies the data — the rule itself no-ops when `dict.ready` is false (dict
 * not installed / batch not prewarmed). Without `dictToolkit` the context has no
 * dictionary and `dict:genji` rules stay gated off (legacy behavior).
 */
export function createIsolatedRulesetContext(dictToolkit?: DictToolkitInternal): RulesetContext {
  return createRulesetContext({
    dictHealth: { state: "not-installed" },
    dict: NO_OP_DICT,
    dictToolkit,
    requirements: new Map([["dict:genji", dictToolkit != null]]),
  });
}

export interface BuildRulesetRunnerInput {
  /** Legacy (built-in, JSON-driven) rules — always registered first. */
  legacyRules: LintRule[];
  /** Currently-loaded external ruleset modules. */
  externals: Iterable<RulesetModule>;
  /** Context used to instantiate external rules. */
  ctx: RulesetContext;
  /** Base guideline-map entries (legacy part) merged with external additions. */
  baseGuidelineMapEntries: ReadonlyArray<[string, string | undefined]>;
  /** Last-known per-rule configs replayed onto the rebuilt runner. */
  configs: ReadonlyMap<string, LintRuleConfig>;
  /** Last-known active guideline ids replayed onto the rebuilt runner. */
  activeGuidelines: string[] | null;
}

/**
 * Build a fresh `RuleRunner = legacyRules ∪ external rules`, replaying the
 * supplied configs/guidelines. Throws if external rule instantiation throws;
 * callers must keep their previous runner on failure (failure isolation).
 */
export function buildRulesetRunner(input: BuildRulesetRunnerInput): {
  runner: RuleRunner;
  ruleGuidelineMap: Map<string, string | undefined>;
} {
  const runner = new RuleRunner();

  // 1. Legacy rules.
  for (const rule of input.legacyRules) {
    runner.registerRule(rule);
  }

  // 2. External rules via a fresh registry so each rebuild is independent.
  const registry = new RulesetRegistry();
  for (const mod of input.externals) {
    registry.registerExternal(mod, "folder");
  }
  for (const rule of registry.buildRules(input.ctx)) {
    runner.registerRule(rule);
  }

  // 3. Merge guideline maps: legacy base + external additions.
  const mergedGuidelineMap = new Map<string, string | undefined>(input.baseGuidelineMapEntries);
  for (const [ruleId, guidelineId] of registry.buildRuleGuidelineMap()) {
    mergedGuidelineMap.set(ruleId, guidelineId);
  }
  runner.setGuidelineMap(mergedGuidelineMap);

  // 4. Replay configs + active guidelines.
  for (const [ruleId, config] of input.configs) {
    runner.setConfig(ruleId, config);
  }
  runner.setActiveGuidelines(input.activeGuidelines);

  return { runner, ruleGuidelineMap: mergedGuidelineMap };
}

/**
 * Import an external ruleset module from its source code via a blob URL.
 * Used on the main thread (renderer) for the fallback path and inside the
 * worker. The blob URL is always revoked.
 */
export async function importRulesetModule(code: string): Promise<RulesetModule> {
  const blob = new Blob([code], { type: "text/javascript" });
  const url = URL.createObjectURL(blob);
  try {
    // webpackIgnore: true is REQUIRED — the bundler must not resolve this
    // runtime blob: URI at build time.
    return (await import(/* webpackIgnore: true */ url)).default as RulesetModule;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Whether a ruleset declares a Genji dictionary requirement — at the ruleset
 * level OR on any individual rule. Read straight from `manifest` (no code
 * execution), so it is safe to call before/after building rules.
 */
export function rulesetRequiresDict(mod: RulesetModule): boolean {
  const manifest = mod?.manifest;
  if (!manifest) return false;
  const hasDictReq = (reqs: ReadonlyArray<{ kind: string }> | undefined): boolean =>
    Array.isArray(reqs) && reqs.some((r) => r?.kind === "dict");
  if (hasDictReq(manifest.requires)) return true;
  return (manifest.rules ?? []).some((r) => hasDictReq(r.requires));
}

/** Whether any module in the iterable requires the Genji dictionary. */
export function anyRulesetRequiresDict(mods: Iterable<RulesetModule>): boolean {
  for (const mod of mods) {
    if (rulesetRequiresDict(mod)) return true;
  }
  return false;
}
