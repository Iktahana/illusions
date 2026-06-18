/**
 * Genji vocabulary enrichment utilities for the word-frequency panel.
 *
 * All functions in this module are pure (no side-effects, no async) so they
 * can be unit-tested without mocking IPC / window / React.
 *
 * Bucket thresholds for frequency rank (freqRank):
 *   常用 (everyday)  : rank ≤ 3 000  — roughly the top-3000 headwords in contemporary
 *                       Japanese corpora; covers the bulk of newspaper/novel text.
 *   一般 (general)   : 3 001–10 000  — standard vocabulary found in mid-range prose.
 *   稀少 (rare)      : rank > 10 000  — low-frequency, archaic, or highly specialised terms.
 *   辞書外 (unknown) : found === false — not in the dictionary at all (proper nouns,
 *                       neologisms, typos, MDI meta-words, …).
 *
 * The boundaries are based on:
 *   • 国語研究所「現代雑誌90誌の語彙調査」(1994) — top ~3500 types cover 90% of tokens.
 *   • 日本語能力試験(JLPT)語彙リスト — N1 vocabulary ends around 10 000 items.
 */

import type { DictLookup } from "@/lib/dict/dict-types";

// ---------------------------------------------------------------------------
// Constants — bucket boundaries
// ---------------------------------------------------------------------------

/** Upper inclusive boundary for 常用 (everyday) frequency bucket. */
export const FREQ_RANK_EVERYDAY = 3_000;

/** Upper inclusive boundary for 一般 (general) frequency bucket. */
export const FREQ_RANK_GENERAL = 10_000;

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

/** Frequency rank distribution across the four buckets. */
export interface FreqRankDistribution {
  /** Words with freqRank ≤ FREQ_RANK_EVERYDAY */
  everyday: number;
  /** Words with freqRank in (FREQ_RANK_EVERYDAY, FREQ_RANK_GENERAL] */
  general: number;
  /** Words with freqRank > FREQ_RANK_GENERAL */
  rare: number;
  /** Words with found === false (no dictionary entry) */
  unknown: number;
}

/** Register (文体) distribution keyed by register label. */
export type RegisterDistribution = Record<string, number>;

/** Aggregated Genji metrics for the vocabulary panel. */
export interface GenjiVocabularySummary {
  /** Frequency rank distribution. */
  freqRankDistribution: FreqRankDistribution;
  /**
   * Register distribution.
   * Keys are the register strings from DictLookup.register (e.g. "口語", "文章語", "雅語").
   * The special key "なし" counts words that were found but carry no register label.
   */
  registerDistribution: RegisterDistribution;
  /** Number of words not found in the dictionary (found === false). */
  unknownWordCount: number;
  /** Total number of unique words that were looked up. */
  totalLookedUp: number;
}

// ---------------------------------------------------------------------------
// Core aggregation function
// ---------------------------------------------------------------------------

/**
 * Aggregate Genji dictionary lookup results into panel-ready metrics.
 *
 * @param words      - Unique word strings to summarise (typically WordEntry.word list).
 * @param lookupMap  - Map returned by DictAccess.lookupBatch(); words absent from the
 *                     map are treated as not-found.
 * @returns          - Aggregated summary (pure, no I/O).
 */
export function summarizeGenjiVocabulary(
  words: readonly string[],
  lookupMap: ReadonlyMap<string, DictLookup>,
): GenjiVocabularySummary {
  const freqRankDistribution: FreqRankDistribution = {
    everyday: 0,
    general: 0,
    rare: 0,
    unknown: 0,
  };
  const registerDistribution: RegisterDistribution = {};
  let unknownWordCount = 0;

  for (const word of words) {
    const lookup = lookupMap.get(word) ?? { found: false };

    if (!lookup.found) {
      freqRankDistribution.unknown++;
      unknownWordCount++;
      continue;
    }

    // Frequency rank bucketing
    const rank = lookup.freqRank;
    if (rank === undefined) {
      // Found in dictionary but rank not available — count as 一般 as a safe fallback.
      freqRankDistribution.general++;
    } else if (rank <= FREQ_RANK_EVERYDAY) {
      freqRankDistribution.everyday++;
    } else if (rank <= FREQ_RANK_GENERAL) {
      freqRankDistribution.general++;
    } else {
      freqRankDistribution.rare++;
    }

    // Register distribution
    const register = lookup.register ?? "なし";
    registerDistribution[register] = (registerDistribution[register] ?? 0) + 1;
  }

  return {
    freqRankDistribution,
    registerDistribution,
    unknownWordCount,
    totalLookedUp: words.length,
  };
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

/**
 * Convert a FreqRankDistribution to a sorted array of label/count pairs
 * suitable for rendering. Order: 常用 → 一般 → 稀少 → 辞書外.
 */
export function freqRankDistributionToRows(
  dist: FreqRankDistribution,
): Array<{ label: string; count: number }> {
  return [
    { label: "常用", count: dist.everyday },
    { label: "一般", count: dist.general },
    { label: "稀少", count: dist.rare },
    { label: "辞書外", count: dist.unknown },
  ];
}

/**
 * Convert a RegisterDistribution to a sorted array of label/count pairs,
 * descending by count, with "なし" last.
 */
export function registerDistributionToRows(
  dist: RegisterDistribution,
): Array<{ label: string; count: number }> {
  const rows = Object.entries(dist).map(([label, count]) => ({ label, count }));
  rows.sort((a, b) => {
    // Push "なし" to the end
    if (a.label === "なし") return 1;
    if (b.label === "なし") return -1;
    return b.count - a.count;
  });
  return rows;
}
