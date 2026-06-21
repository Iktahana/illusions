/**
 * Builds the {@link RulesetContext} handed to every ruleset's `createRules`.
 *
 * Wires the concrete base classes + detector toolkit + resolved dependency state
 * (dictionary health). `createRulesetContext` is synchronous and injectable for
 * tests; `resolveRulesetContext` fetches live dictionary health from the app.
 */
import { getDictAccess, type GenjiHealth } from "@/lib/dict/dict-access";

import {
  AbstractDocumentLintRule,
  AbstractL1Rule,
  AbstractLintRule,
  AbstractMorphologicalDocumentLintRule,
  AbstractMorphologicalLintRule,
} from "../base-rule";
import { ENGINE_API_VERSION } from "../sdk/ruleset-types";
import type { RulesetBases, RulesetContext, DictToolkit } from "../sdk/ruleset-context";
import { createDictToolkit, createToolkit, type DictLike } from "../toolkit";

const BASES: RulesetBases = {
  AbstractLintRule,
  AbstractL1Rule,
  AbstractMorphologicalLintRule,
  AbstractDocumentLintRule,
  AbstractMorphologicalDocumentLintRule,
};

export interface BuildContextOptions {
  dictHealth: GenjiHealth;
  dict: DictLike;
  /**
   * Use this prebuilt dictionary toolkit instead of constructing one from
   * `dictHealth`/`dict`. The lint pipeline passes a persistent snapshot-backed
   * toolkit here so per-batch prewarm data survives runner rebuilds.
   */
  dictToolkit?: DictToolkit;
  /** Override the resolved requirement satisfaction map. Defaults from dict health. */
  requirements?: ReadonlyMap<string, boolean>;
  engineApi?: number;
}

/** Build a context from explicit dependency state (test-friendly). */
export function createRulesetContext(opts: BuildContextOptions): RulesetContext {
  const dictToolkit = opts.dictToolkit ?? createDictToolkit(opts.dictHealth, opts.dict);
  const toolkit = createToolkit(dictToolkit);
  const requirements =
    opts.requirements ?? new Map<string, boolean>([["dict:genji", dictToolkit.ready]]);
  return {
    engineApi: opts.engineApi ?? ENGINE_API_VERSION,
    bases: BASES,
    toolkit,
    deps: { requirements, dictState: opts.dictHealth.state },
  };
}

/** Build a context using the live dictionary singleton. */
export async function resolveRulesetContext(): Promise<RulesetContext> {
  const access = getDictAccess();
  const dictHealth = await access.getHealth();
  return createRulesetContext({ dictHealth, dict: access });
}
