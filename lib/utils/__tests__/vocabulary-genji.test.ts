import { describe, it, expect } from "vitest";

import {
  summarizeGenjiVocabulary,
  freqRankDistributionToRows,
  registerDistributionToRows,
  FREQ_RANK_EVERYDAY,
  FREQ_RANK_GENERAL,
} from "@/lib/utils/vocabulary-genji";
import type { DictLookup } from "@/lib/dict/dict-types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMap(entries: Array<[string, DictLookup]>): Map<string, DictLookup> {
  return new Map(entries);
}

// ---------------------------------------------------------------------------
// summarizeGenjiVocabulary — basic counts
// ---------------------------------------------------------------------------

describe("summarizeGenjiVocabulary", () => {
  it("returns all-zero summary for empty word list", () => {
    const summary = summarizeGenjiVocabulary([], makeMap([]));
    expect(summary.freqRankDistribution.everyday).toBe(0);
    expect(summary.freqRankDistribution.general).toBe(0);
    expect(summary.freqRankDistribution.rare).toBe(0);
    expect(summary.freqRankDistribution.unknown).toBe(0);
    expect(summary.unknownWordCount).toBe(0);
    expect(summary.totalLookedUp).toBe(0);
    expect(summary.registerDistribution).toEqual({});
  });

  it("counts not-found words as unknown (辞書外)", () => {
    const summary = summarizeGenjiVocabulary(
      ["新語", "造語"],
      makeMap([
        ["新語", { found: false }],
        ["造語", { found: false }],
      ]),
    );
    expect(summary.freqRankDistribution.unknown).toBe(2);
    expect(summary.unknownWordCount).toBe(2);
    expect(summary.freqRankDistribution.everyday).toBe(0);
  });

  it("treats word absent from lookupMap as not-found", () => {
    // "幽霊語" is not in the map at all — should count as unknown
    const summary = summarizeGenjiVocabulary(["幽霊語"], makeMap([]));
    expect(summary.freqRankDistribution.unknown).toBe(1);
    expect(summary.unknownWordCount).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Bucket boundary tests
  // -------------------------------------------------------------------------

  it("places rank === FREQ_RANK_EVERYDAY in everyday bucket (boundary)", () => {
    const summary = summarizeGenjiVocabulary(
      ["境界語"],
      makeMap([["境界語", { found: true, freqRank: FREQ_RANK_EVERYDAY }]]),
    );
    expect(summary.freqRankDistribution.everyday).toBe(1);
    expect(summary.freqRankDistribution.general).toBe(0);
  });

  it("places rank === FREQ_RANK_EVERYDAY + 1 in general bucket (boundary)", () => {
    const summary = summarizeGenjiVocabulary(
      ["境界語"],
      makeMap([["境界語", { found: true, freqRank: FREQ_RANK_EVERYDAY + 1 }]]),
    );
    expect(summary.freqRankDistribution.everyday).toBe(0);
    expect(summary.freqRankDistribution.general).toBe(1);
  });

  it("places rank === FREQ_RANK_GENERAL in general bucket (boundary)", () => {
    const summary = summarizeGenjiVocabulary(
      ["境界語"],
      makeMap([["境界語", { found: true, freqRank: FREQ_RANK_GENERAL }]]),
    );
    expect(summary.freqRankDistribution.general).toBe(1);
    expect(summary.freqRankDistribution.rare).toBe(0);
  });

  it("places rank === FREQ_RANK_GENERAL + 1 in rare bucket (boundary)", () => {
    const summary = summarizeGenjiVocabulary(
      ["境界語"],
      makeMap([["境界語", { found: true, freqRank: FREQ_RANK_GENERAL + 1 }]]),
    );
    expect(summary.freqRankDistribution.rare).toBe(1);
    expect(summary.freqRankDistribution.general).toBe(0);
  });

  it("places found word with undefined freqRank in general bucket", () => {
    const summary = summarizeGenjiVocabulary(["読み"], makeMap([["読み", { found: true }]]));
    expect(summary.freqRankDistribution.general).toBe(1);
    expect(summary.freqRankDistribution.everyday).toBe(0);
    expect(summary.freqRankDistribution.rare).toBe(0);
    expect(summary.freqRankDistribution.unknown).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Mixed bucket distribution
  // -------------------------------------------------------------------------

  it("correctly distributes a mixed word list across all four buckets", () => {
    const summary = summarizeGenjiVocabulary(
      ["猫", "走る", "碧落", "新語"],
      makeMap([
        ["猫", { found: true, freqRank: 500 }], // everyday
        ["走る", { found: true, freqRank: 4_000 }], // general
        ["碧落", { found: true, freqRank: 15_000 }], // rare
        ["新語", { found: false }], // unknown
      ]),
    );
    expect(summary.freqRankDistribution.everyday).toBe(1);
    expect(summary.freqRankDistribution.general).toBe(1);
    expect(summary.freqRankDistribution.rare).toBe(1);
    expect(summary.freqRankDistribution.unknown).toBe(1);
    expect(summary.totalLookedUp).toBe(4);
  });

  // -------------------------------------------------------------------------
  // Register distribution
  // -------------------------------------------------------------------------

  it("accumulates register counts correctly", () => {
    const summary = summarizeGenjiVocabulary(
      ["言う", "申す", "おっしゃる"],
      makeMap([
        ["言う", { found: true, freqRank: 100, register: "口語" }],
        ["申す", { found: true, freqRank: 2_000, register: "文章語" }],
        ["おっしゃる", { found: true, freqRank: 800, register: "口語" }],
      ]),
    );
    expect(summary.registerDistribution["口語"]).toBe(2);
    expect(summary.registerDistribution["文章語"]).toBe(1);
  });

  it("uses 'なし' key for found words with no register label", () => {
    const summary = summarizeGenjiVocabulary(
      ["猫", "犬"],
      makeMap([
        ["猫", { found: true, freqRank: 500 }], // no register
        ["犬", { found: true, freqRank: 600 }], // no register
      ]),
    );
    expect(summary.registerDistribution["なし"]).toBe(2);
  });

  it("does not add register entry for not-found words", () => {
    const summary = summarizeGenjiVocabulary(["造語"], makeMap([["造語", { found: false }]]));
    // No register key should exist because the word wasn't found
    expect(Object.keys(summary.registerDistribution)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// freqRankDistributionToRows
// ---------------------------------------------------------------------------

describe("freqRankDistributionToRows", () => {
  it("returns four rows in fixed order: 常用 → 一般 → 稀少 → 辞書外", () => {
    const rows = freqRankDistributionToRows({
      everyday: 10,
      general: 20,
      rare: 5,
      unknown: 3,
    });
    expect(rows.map((r) => r.label)).toEqual(["常用", "一般", "稀少", "辞書外"]);
    expect(rows.map((r) => r.count)).toEqual([10, 20, 5, 3]);
  });

  it("returns all-zero rows for empty distribution", () => {
    const rows = freqRankDistributionToRows({
      everyday: 0,
      general: 0,
      rare: 0,
      unknown: 0,
    });
    expect(rows.every((r) => r.count === 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// registerDistributionToRows
// ---------------------------------------------------------------------------

describe("registerDistributionToRows", () => {
  it("sorts by count descending", () => {
    const rows = registerDistributionToRows({
      文章語: 1,
      口語: 5,
      雅語: 3,
    });
    expect(rows[0].label).toBe("口語");
    expect(rows[1].label).toBe("雅語");
    expect(rows[2].label).toBe("文章語");
  });

  it("places 'なし' last regardless of count", () => {
    const rows = registerDistributionToRows({
      なし: 100,
      口語: 2,
    });
    expect(rows[rows.length - 1].label).toBe("なし");
  });

  it("returns empty array for empty distribution", () => {
    expect(registerDistributionToRows({})).toEqual([]);
  });
});
