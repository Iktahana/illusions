import { describe, it, expect } from "vitest";
import { analyzeReadability, enrichReadabilityWithDict } from "../readability";
import type { DictLookup } from "@/lib/dict/dict-types";
import type { Token } from "@/lib/nlp-client/types";

/**
 * Tests for Tier 3 (幻辞 freq_rank) readability enrichment, #1627.
 * Pure-function level — the health gating / DictAccess wiring lives in
 * use-text-statistics.ts and is exercised there.
 */

const BASE_TEXT = "吾輩は猫である。名前はまだ無いが、彼は静かに庭を眺めていた。";

function noun(basicForm: string): Token {
  return {
    surface: basicForm,
    pos: "名詞",
    basic_form: basicForm,
    reading: "",
    start: 0,
    end: basicForm.length,
  } as Token;
}

function lookup(map: Record<string, number | null>): Map<string, DictLookup> {
  const out = new Map<string, DictLookup>();
  for (const [word, freqRank] of Object.entries(map)) {
    out.set(word, freqRank === null ? { found: false } : { found: true, freqRank });
  }
  return out;
}

describe("enrichReadabilityWithDict (Tier 3, #1627)", () => {
  it("sets hasDictAnalysis=true and leaves scores untouched for an empty lookup map", () => {
    const base = analyzeReadability(BASE_TEXT);
    const result = enrichReadabilityWithDict(base, [], new Map());
    expect(result.hasDictAnalysis).toBe(true);
    expect(result.subScores.vocabulary).toBe(base.subScores.vocabulary);
  });

  it("sets hasDictAnalysis=true but does not change vocabulary when no content word is found", () => {
    const base = analyzeReadability(BASE_TEXT);
    const tokens = [noun("造語A"), noun("造語B")];
    const result = enrichReadabilityWithDict(base, tokens, lookup({ 造語A: null, 造語B: null }));
    expect(result.hasDictAnalysis).toBe(true);
    expect(result.subScores.vocabulary).toBe(base.subScores.vocabulary);
    expect(result.detail.vocabulary.avgFreqRank).toBeUndefined();
  });

  it("lowers the vocabulary subscore when rare words dominate", () => {
    const base = analyzeReadability(BASE_TEXT);
    const tokens = [noun("顰蹙"), noun("邂逅"), noun("瀟洒")];
    // All rare (freq_rank > 50,000): rareWordRate = 1.0, avgFreqRank > 30,000.
    const result = enrichReadabilityWithDict(
      base,
      tokens,
      lookup({ 顰蹙: 62000, 邂逅: 58000, 瀟洒: 71000 }),
    );
    expect(result.hasDictAnalysis).toBe(true);
    expect(result.subScores.vocabulary).toBeLessThan(base.subScores.vocabulary);
    expect(result.detail.vocabulary.rareWordRate).toBe(1);
    expect(result.detail.vocabulary.avgFreqRank).toBeGreaterThan(30_000);
  });

  it("gives a small bonus when common words dominate", () => {
    const base = analyzeReadability(BASE_TEXT);
    const tokens = [noun("猫"), noun("名前"), noun("庭")];
    // All common (avg freq_rank < 3,000), no rare words.
    const result = enrichReadabilityWithDict(
      base,
      tokens,
      lookup({ 猫: 800, 名前: 400, 庭: 1500 }),
    );
    expect(result.hasDictAnalysis).toBe(true);
    expect(result.subScores.vocabulary).toBeGreaterThanOrEqual(base.subScores.vocabulary);
    expect(result.detail.vocabulary.rareWordRate).toBe(0);
  });

  it("recomputes the composite score and level from the adjusted subscores", () => {
    const base = analyzeReadability(BASE_TEXT);
    const tokens = [noun("顰蹙"), noun("邂逅")];
    const result = enrichReadabilityWithDict(base, tokens, lookup({ 顰蹙: 62000, 邂逅: 70000 }));
    // Lower vocabulary → composite score should not exceed the base score.
    expect(result.score).toBeLessThanOrEqual(base.score);
    expect(["easy", "normal", "difficult"]).toContain(result.level);
  });
});
