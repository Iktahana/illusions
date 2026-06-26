/**
 * Genji word-info utilities: extract a display-ready ViewModel from a
 * DictQueryResult / DictEntry[], and a React hook that drives the async lookup.
 *
 * Design rules:
 * - Pure functions are unit-testable without any React / browser env.
 * - The hook is the only place that calls getDictService().
 * - All failures are swallowed; callers receive null instead of throwing.
 */

import { useEffect, useState } from "react";

import type { DictEntry } from "@/lib/dict/dict-types";
import type { DictQueryResult } from "@/lib/dict/dict-types";

// ---------------------------------------------------------------------------
// ViewModel
// ---------------------------------------------------------------------------

/** Maximum number of glosses shown in the inspector panel */
const MAX_GLOSSES = 3;
/** Maximum number of synonyms shown in the inspector panel */
const MAX_SYNONYMS = 5;

export interface GenjiWordInfoViewModel {
  /** Surface form that was queried */
  word: string;
  /** Primary reading (kana) */
  reading: string | null;
  /** Part of speech from the first entry */
  partOfSpeech: string | null;
  /** Register label (口語/文章語/雅語 …) from the first definition that carries one */
  register: string | null;
  /** Up to MAX_GLOSSES gloss strings */
  glosses: string[];
  /** Up to MAX_SYNONYMS synonym strings */
  synonyms: string[];
  /**
   * The actual headword that matched. On a prefix-only match (e.g. querying
   * 「青い」 hits the entry 「青い鳥」) this differs from `word`.
   */
  matchedHeadword: string;
  /**
   * True when the query resolves to this exact headword — either `matchedHeadword`
   * equals `word`, or `word` is a registered variant writing of it (#1958, e.g.
   * querying 「ゐる」 → headword 「居る」). Only a prefix-only hit is non-exact.
   */
  isExactMatch: boolean;
  /**
   * Variant writings (異表記) of the matched headword — old kanji / historical
   * kana folded into this entry (#1958). Empty when none.
   */
  variantWritings: string[];
  /**
   * True when the entry is a skeleton without a generated gloss (#1958). The
   * word is real; the panel should indicate the gloss is pending rather than
   * render an empty definition.
   */
  needsGloss: boolean;
}

/**
 * Extract the first non-empty register string across all definitions of one entry.
 */
function extractRegister(entry: DictEntry): string | null {
  for (const def of entry.definitions) {
    if (def.register && def.register.trim().length > 0) {
      return def.register.trim();
    }
  }
  return null;
}

/**
 * Build a display ViewModel from the first matching entry in a DictQueryResult.
 *
 * Returns null when:
 * - `result` is null / undefined
 * - `result.providerUnavailable` is true
 * - `result.entries` is empty
 */
export function buildGenjiWordInfoViewModel(
  word: string,
  result: DictQueryResult | null | undefined,
): GenjiWordInfoViewModel | null {
  if (!result || result.providerUnavailable || result.entries.length === 0) {
    return null;
  }

  const entry = result.entries[0];

  // queryByEntry matches "entry = term OR entry LIKE term%", so a query with no
  // exact headword still returns the shortest prefix hit (querying 「青い」 returns
  // 「青い鳥」). Surface this so the panel never implies the queried word itself is
  // in the dictionary when only a longer headword shares its prefix.
  const matchedHeadword = entry.entry.trim() || word;
  const variantWritings = (entry.variantWritings ?? [])
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
  // A query for a registered variant writing (e.g. 「ゐる」 → 「居る」) is an exact
  // resolution, not a prefix-only hit, so the "no exact match" note stays hidden (#1958).
  const isExactMatch = matchedHeadword === word || variantWritings.includes(word);

  const reading = entry.reading.primary.trim() || null;
  const partOfSpeech = entry.partOfSpeech?.trim() || null;
  const register = extractRegister(entry);
  const glosses = entry.definitions
    .map((d) => d.gloss.trim())
    .filter((g) => g.length > 0)
    .slice(0, MAX_GLOSSES);
  const synonyms = (entry.relationships.synonyms ?? [])
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, MAX_SYNONYMS);

  return {
    word,
    matchedHeadword,
    isExactMatch,
    reading,
    partOfSpeech,
    register,
    glosses,
    synonyms,
    variantWritings,
    // A skeleton entry has needs_gloss=true OR simply no non-empty gloss yet.
    needsGloss: entry.needsGloss === true || glosses.length === 0,
  };
}

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------

export type GenjiWordInfoState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "found"; viewModel: GenjiWordInfoViewModel }
  | { status: "not-found" }
  | { status: "unavailable" };

const IDLE: GenjiWordInfoState = { status: "idle" };
const LOADING: GenjiWordInfoState = { status: "loading" };
const NOT_FOUND: GenjiWordInfoState = { status: "not-found" };
const UNAVAILABLE: GenjiWordInfoState = { status: "unavailable" };

/**
 * Async hook that looks up `selectedWord` in the Genji dictionary and returns
 * a typed state object for the UI to render.
 *
 * - When `selectedWord` is empty/null, returns `{ status: "idle" }`.
 * - On any error (network, IPC, corrupt DB) falls back gracefully to
 *   `{ status: "unavailable" }`.
 */
/**
 * Debounce window before the dictionary lookup fires after the selection
 * settles. Selecting text dispatches selection-change continuously while the
 * pointer drags; without this every intermediate selection would kick off a
 * Genji IPC query and freeze the UI (#1639).
 */
const LOOKUP_DEBOUNCE_MS = 250;

export function useGenjiWordInfo(selectedWord: string | null | undefined): GenjiWordInfoState {
  const [state, setState] = useState<GenjiWordInfoState>(IDLE);

  useEffect(() => {
    const word = selectedWord?.trim();
    if (!word) {
      setState(IDLE);
      return;
    }

    let cancelled = false;

    // Defer the (potentially IPC-backed) lookup until the selection stops
    // changing. The previous result stays visible during the debounce window
    // so the panel doesn't flicker to a loading state on every drag tick.
    const timer = setTimeout(() => {
      setState(LOADING);

      void (async () => {
        try {
          // Dynamic import keeps getDictService out of SSR / web-worker bundles
          const { getDictService } = await import("@/lib/dict/dict-service");
          const result = await getDictService().query(word, 1);

          if (cancelled) return;

          if (result.providerUnavailable) {
            setState(UNAVAILABLE);
            return;
          }

          const viewModel = buildGenjiWordInfoViewModel(word, result);
          if (viewModel) {
            setState({ status: "found", viewModel });
          } else {
            setState(NOT_FOUND);
          }
        } catch {
          if (!cancelled) {
            setState(UNAVAILABLE);
          }
        }
      })();
    }, LOOKUP_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [selectedWord]);

  return state;
}
