/**
 * Known-terms registry — words that dictionary-matching lint rules
 * (e.g. genji-vocab's `genji-out-of-dict`) must treat as "known" and therefore
 * never flag as 辞書外語 (out-of-dictionary).
 *
 * Why this exists:
 *   The out-of-dict rule flags a term ONLY when the prewarm snapshot reports it
 *   `{ found: false }`. The snapshot is the single "is this word known?" oracle.
 *   By forcing chosen terms to `{ found: true }` at snapshot-build time we
 *   suppress the mark without touching the rule, the worker, or the protocol —
 *   and the suppression automatically applies to every present/future
 *   out-of-dict-style rule.
 *
 * Two requirements, one mechanism:
 *   1. User dictionary words (built-in source, below).
 *   2. Words registered in ANOTHER dictionary ruleset. This is the generic
 *      extension point: a future dictionary ruleset registers its own source via
 *      {@link registerKnownTermsSource} and its vocabulary is unioned in.
 *
 * Scope note — enumerable sets vs. backend dictionaries:
 *   This registry unions *enumerable* term sets (the user dictionary, small
 *   per-ruleset allow-lists). A large full-text dictionary (like Genji itself)
 *   must NOT be enumerated here; it is queried by candidate term at prewarm time
 *   as a membership resolver (see `getDictAccess().lookupBatch` in
 *   decoration-plugin.ts). Adding a second backend dictionary means adding a
 *   resolver call alongside that one — not dumping its headwords into a Set.
 *
 * IMPORTANT: this is wired into the lint prewarm path ONLY. Do NOT fold these
 * terms into `dict-access` itself, or analysis features (語彙統計「辞書外語数」,
 * ルビ, etc.) would silently treat user words as dictionary entries.
 */
import type { DictLookup } from "@/lib/dict/dict-types";
import type { EditorMode } from "@/lib/project/project-types";
import { isProjectMode, isStandaloneMode } from "@/lib/project/project-types";
import { getUserDictionaryService } from "@/lib/services/user-dictionary-service";

/** Context handed to every {@link KnownTermsSource} when collecting terms. */
export interface KnownTermsContext {
  editorMode: EditorMode;
}

/**
 * A contributor of "known" terms. May be sync or async. Errors are swallowed by
 * {@link collectKnownTerms} (one bad source must not break linting or other
 * sources), so a source should still prefer returning an empty iterable on
 * partial failure.
 */
export type KnownTermsSource = (
  ctx: KnownTermsContext,
) => Promise<Iterable<string>> | Iterable<string>;

const sources = new Map<string, KnownTermsSource>();

/**
 * Register (or replace) a known-terms source under a stable id. A future
 * dictionary ruleset calls this with its ruleset id to contribute its
 * vocabulary; calling again with the same id replaces the previous source.
 */
export function registerKnownTermsSource(id: string, source: KnownTermsSource): void {
  sources.set(id, source);
}

/** Remove a previously registered source. No-op if the id is unknown. */
export function unregisterKnownTermsSource(id: string): void {
  sources.delete(id);
}

/**
 * Union the terms from every registered source for the given context. Sources
 * run in parallel; a source that throws (or rejects) contributes nothing and is
 * logged — it never fails the whole collection.
 */
export async function collectKnownTerms(ctx: KnownTermsContext): Promise<Set<string>> {
  const out = new Set<string>();
  const results = await Promise.allSettled(
    [...sources.entries()].map(async ([id, source]) => {
      try {
        return await source(ctx);
      } catch (err) {
        console.warn(`[known-terms] source "${id}" failed:`, err);
        return [] as string[];
      }
    }),
  );
  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    for (const term of result.value) {
      if (typeof term === "string" && term.length > 0) out.add(term);
    }
  }
  return out;
}

/**
 * Override `map` so every term in `terms` that is also in `known` reports as a
 * dictionary hit (`{ found: true }`). Pure helper used by the lint prewarm right
 * after the Genji `lookupBatch`, before the snapshot is serialized.
 *
 * Only terms already present as lookup candidates matter — a known term that
 * never appears as a candidate would not be flagged anyway, so it is ignored.
 */
export function applyKnownTermsToSnapshot(
  map: Map<string, DictLookup>,
  terms: Iterable<string>,
  known: ReadonlySet<string>,
): void {
  if (known.size === 0) return;
  for (const term of terms) {
    if (known.has(term)) map.set(term, { found: true });
  }
}

/** Built-in source: the user dictionary for the current editor mode. */
const userDictionarySource: KnownTermsSource = async ({ editorMode }) => {
  if (!editorMode) return [];
  const service = getUserDictionaryService();
  let entries;
  if (isProjectMode(editorMode)) {
    entries = await service.loadEntries();
  } else if (isStandaloneMode(editorMode)) {
    // Match the storage key Dictionary.tsx writes under (#1921): prefer the full
    // path, fall back to fileName on Web where filePath is unavailable.
    const stableKey = editorMode.filePath ?? editorMode.fileName;
    entries = await service.loadEntriesStandalone(stableKey);
  } else {
    return [];
  }
  return entries
    .map((e) => e.word)
    .filter((w): w is string => typeof w === "string" && w.length > 0);
};

registerKnownTermsSource("user-dictionary", userDictionarySource);
