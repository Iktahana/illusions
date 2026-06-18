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

  return { word, reading, partOfSpeech, register, glosses, synonyms };
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
export function useGenjiWordInfo(selectedWord: string | null | undefined): GenjiWordInfoState {
  const [state, setState] = useState<GenjiWordInfoState>(IDLE);

  useEffect(() => {
    const word = selectedWord?.trim();
    if (!word) {
      setState(IDLE);
      return;
    }

    let cancelled = false;
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

    return () => {
      cancelled = true;
    };
  }, [selectedWord]);

  return state;
}
