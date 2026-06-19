/**
 * Dictionary toolkit — fail-safe wrapper around the Genji dictionary.
 *
 * Rules that declare `requires: [{ kind: "dict", dictId: "genji" }]` use this to
 * query the dictionary. When the dictionary is not ready (not installed, corrupt,
 * web fallback, or unknown), every query returns empty so rule code needs no
 * branching. Separately, the registry disables such rules and surfaces a single
 * Japanese warning (see ruleset-registry).
 */
import type { DictLookup } from "@/lib/dict/dict-types";
import type { GenjiHealth } from "@/lib/dict/dict-access";
import type { DictToolkit } from "../sdk/ruleset-context";

/** Minimal dictionary surface needed by the toolkit (injectable for tests). */
export interface DictLike {
  lookupBatch(terms: string[]): Promise<Map<string, DictLookup>>;
  has(term: string): Promise<boolean>;
}

const EMPTY: ReadonlyMap<string, DictLookup> = new Map();

/**
 * Build a {@link DictToolkit} bound to a resolved health snapshot. Pass the
 * already-fetched `health` so the toolkit is synchronous to construct and the
 * `ready` flag is stable for the lifetime of a ruleset build.
 */
export function createDictToolkit(health: GenjiHealth, dict: DictLike): DictToolkit {
  const ready = health.state === "ready";
  return {
    ready,
    state: health.state,
    async lookupBatch(terms: string[]): Promise<Map<string, DictLookup>> {
      if (!ready) return new Map(EMPTY);
      return dict.lookupBatch(terms);
    },
    async has(term: string): Promise<boolean> {
      if (!ready) return false;
      return dict.has(term);
    },
  };
}
