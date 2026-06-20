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
import type { GenjiHealth, GenjiHealthState } from "@/lib/dict/dict-access";
import type { DictToolkit } from "../sdk/ruleset-context";

/** Minimal dictionary surface needed by the toolkit (injectable for tests). */
export interface DictLike {
  lookupBatch(terms: string[]): Promise<Map<string, DictLookup>>;
  has(term: string): Promise<boolean>;
}

/** A serialized prewarm snapshot entry pair. Structured-clone friendly. */
export type DictSnapshotEntry = readonly [string, DictLookup];

/**
 * A {@link DictToolkit} whose synchronous `hasCached`/`lookupCached` read a
 * prewarmed snapshot that the lint pipeline installs per batch.
 *
 * `setSnapshot` is internal to the pipeline — rules only ever see the narrower
 * {@link DictToolkit}. The lint pass is synchronous but dictionary I/O is async,
 * so the renderer prewarms membership for the batch (via
 * `getDictAccess().lookupBatch`) and ships it here.
 */
export interface DictToolkitInternal extends DictToolkit {
  /**
   * Install the snapshot for the upcoming synchronous lint pass.
   * @param entries term → projection pairs (misses included as `{ found: false }`).
   * @param ready whether the dictionary is actually usable; when false every
   *   `hasCached`/`lookupCached` reports "not prewarmed" so rules no-op.
   */
  setSnapshot(entries: ReadonlyArray<DictSnapshotEntry>, ready: boolean): void;
  /** Drop the current snapshot (returns to the not-prewarmed state). */
  clearSnapshot(): void;
}

const EMPTY: ReadonlyMap<string, DictLookup> = new Map();

/**
 * Build a {@link DictToolkit} bound to a resolved health snapshot. Pass the
 * already-fetched `health` so the toolkit is synchronous to construct and the
 * `ready` flag is stable for the lifetime of a ruleset build.
 *
 * This variant has no prewarm snapshot, so `hasCached`/`lookupCached` always
 * report "not prewarmed" (false / undefined).
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
    hasCached(): boolean {
      return false;
    },
    lookupCached(): DictLookup | undefined {
      return undefined;
    },
  };
}

/**
 * Build a snapshot-backed {@link DictToolkitInternal} for the lint pipeline.
 *
 * It holds no async dictionary connection (the worker/fallback can't reach the
 * Electron dict IPC); the async `lookupBatch`/`has` therefore return empty. All
 * real membership data arrives through {@link DictToolkitInternal.setSnapshot},
 * which the renderer fills per batch from `getDictAccess()`.
 *
 * `ready` reflects the most recent `setSnapshot(_, ready)` — before any snapshot
 * it is `false`, so a dict rule built against this toolkit no-ops until the
 * renderer confirms the dictionary is usable AND has prewarmed the batch.
 */
export function createSnapshotDictToolkit(): DictToolkitInternal {
  let snapshot = new Map<string, DictLookup>();
  let ready = false;
  return {
    get ready(): boolean {
      return ready;
    },
    get state(): GenjiHealthState {
      return ready ? "ready" : "unknown";
    },
    async lookupBatch(): Promise<Map<string, DictLookup>> {
      return new Map(EMPTY);
    },
    async has(): Promise<boolean> {
      return false;
    },
    hasCached(term: string): boolean {
      if (!ready) return false;
      return snapshot.get(term)?.found ?? false;
    },
    lookupCached(term: string): DictLookup | undefined {
      if (!ready) return undefined;
      return snapshot.get(term);
    },
    setSnapshot(entries: ReadonlyArray<DictSnapshotEntry>, isReady: boolean): void {
      snapshot = new Map(entries);
      ready = isReady;
    },
    clearSnapshot(): void {
      snapshot = new Map();
      ready = false;
    },
  };
}
