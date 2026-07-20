/**
 * ruby-readings — pure helpers to build per-segment reading candidate lists
 * for the RubyDialog, merging kuromoji readings with Genji dictionary readings.
 *
 * Design goals:
 *   - Pure functions: no side effects, fully testable without mocking
 *   - Graceful degradation: Genji results are optional; kuromoji-only always works
 *   - Deduplication + normalisation: katakana→hiragana, unique order-preserving
 */

import type { DictLookup } from "@/lib/dict/dict-types";
import type { DictEntry } from "@/lib/dict/dict-types";

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

/** Convert katakana to hiragana (full-width only). */
export function katakanaToHiragana(str: string): string {
  return str.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

// ---------------------------------------------------------------------------
// Core pure functions
// ---------------------------------------------------------------------------

/**
 * Deduplicate an array of readings, normalising each to hiragana first.
 * The first occurrence of each normalised form is preserved; order kept stable.
 */
export function deduplicateReadings(readings: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of readings) {
    const normalised = katakanaToHiragana(r.trim());
    if (normalised.length === 0) continue;
    if (!seen.has(normalised)) {
      seen.add(normalised);
      out.push(normalised);
    }
  }
  return out;
}

/**
 * Build a candidate reading list for a single segment from:
 *   - `kuromojiReading`: reading from kuromoji tokenizer (may be empty string)
 *   - `dictLookup`: lightweight {@link DictLookup} from `getDictAccess().lookupBatch()`
 *   - `dictEntries`: richer {@link DictEntry}[] from `getDictService().query()` (optional)
 *
 * Returns a deduplicated, hiragana-normalised array.  The first element is the
 * "best" reading — kuromoji if Genji has nothing; Genji primary otherwise.
 * If both match, kuromoji is still listed so the user can confirm it.
 *
 * Genji readings take precedence in ordering because the dictionary is more
 * reliable for proper nouns and archaic words that kuromoji mislabels.
 */
export function buildReadingCandidates(
  kuromojiReading: string,
  dictLookup: DictLookup | undefined,
  dictEntries: DictEntry[],
): string[] {
  const candidates: string[] = [];

  // 1. Genji DictLookup primary (lightweight, always available when found)
  if (dictLookup?.found && dictLookup.reading) {
    candidates.push(dictLookup.reading);
  }

  // 2. Genji DictEntry readings (primary + alternatives from full query)
  for (const entry of dictEntries) {
    candidates.push(entry.reading.primary);
    candidates.push(...entry.reading.alternatives);
  }

  // 3. kuromoji reading last (may duplicate Genji; dedup handles it)
  if (kuromojiReading.length > 0) {
    candidates.push(kuromojiReading);
  }

  return deduplicateReadings(candidates);
}

// ---------------------------------------------------------------------------
// Batch builder
// ---------------------------------------------------------------------------

/**
 * Input descriptor for one kanji-containing segment.
 */
export interface SegmentReadingInput {
  surface: string;
  kuromojiReading: string;
  /** From `getDictAccess().lookupBatch()`. Omit / undefined when Genji unavailable. */
  dictLookup?: DictLookup;
  /** From `getDictService().query(surface)`. Omit / empty when Genji unavailable. */
  dictEntries?: DictEntry[];
}

/**
 * Per-segment candidate list.
 */
export interface SegmentReadingCandidates {
  surface: string;
  /** Ordered candidates; first element is the recommended default. */
  candidates: string[];
}

/**
 * Build reading candidates for multiple segments in one call.
 * Non-kanji segments (hasKanji === false) can be excluded before calling;
 * they are passed through with `candidates: []` if included.
 */
export function buildBatchReadingCandidates(
  inputs: SegmentReadingInput[],
): SegmentReadingCandidates[] {
  return inputs.map((input) => ({
    surface: input.surface,
    candidates: buildReadingCandidates(
      input.kuromojiReading,
      input.dictLookup,
      input.dictEntries ?? [],
    ),
  }));
}
