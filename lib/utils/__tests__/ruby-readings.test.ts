/**
 * Tests for lib/utils/ruby-readings.ts
 *
 * Covers:
 *   - katakana→hiragana normalisation
 *   - deduplication (order-preserving, case-insensitive normalised)
 *   - buildReadingCandidates: Genji primary+alternatives + kuromoji merge
 *   - buildReadingCandidates: Genji hit absent → kuromoji only
 *   - buildReadingCandidates: empty inputs
 *   - buildBatchReadingCandidates: multiple segments
 */

import { describe, it, expect } from "vitest";
import {
  katakanaToHiragana,
  deduplicateReadings,
  buildReadingCandidates,
  buildBatchReadingCandidates,
} from "../ruby-readings";
import type { DictLookup, DictEntry } from "@/lib/dict/dict-types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDictEntry(primary: string, alternatives: string[] = []): DictEntry {
  return {
    id: `test-${primary}`,
    entry: "雪女",
    reading: { primary, alternatives },
    definitions: [],
    relationships: { homophones: [], synonyms: [], antonyms: [], related: [] },
    source: "test",
  };
}

// ---------------------------------------------------------------------------
// katakanaToHiragana
// ---------------------------------------------------------------------------

describe("katakanaToHiragana", () => {
  it("converts full-width katakana to hiragana", () => {
    expect(katakanaToHiragana("ユキオンナ")).toBe("ゆきおんな");
  });

  it("leaves hiragana unchanged", () => {
    expect(katakanaToHiragana("ゆき")).toBe("ゆき");
  });

  it("leaves kanji and ASCII unchanged", () => {
    expect(katakanaToHiragana("ABC漢字")).toBe("ABC漢字");
  });

  it("handles empty string", () => {
    expect(katakanaToHiragana("")).toBe("");
  });

  it("converts mixed katakana/hiragana string", () => {
    expect(katakanaToHiragana("ユキゆきオンナおんな")).toBe("ゆきゆきおんなおんな");
  });
});

// ---------------------------------------------------------------------------
// deduplicateReadings
// ---------------------------------------------------------------------------

describe("deduplicateReadings", () => {
  it("removes exact duplicates", () => {
    expect(deduplicateReadings(["ゆき", "ゆき", "おんな"])).toEqual(["ゆき", "おんな"]);
  });

  it("normalises katakana before deduplication", () => {
    // katakana ユキ and hiragana ゆき should collapse to one entry
    expect(deduplicateReadings(["ユキ", "ゆき"])).toEqual(["ゆき"]);
  });

  it("preserves first occurrence order", () => {
    expect(deduplicateReadings(["おんな", "ゆき", "おんな"])).toEqual(["おんな", "ゆき"]);
  });

  it("removes empty strings and whitespace-only entries", () => {
    expect(deduplicateReadings(["", "  ", "ゆき"])).toEqual(["ゆき"]);
  });

  it("returns empty array for empty input", () => {
    expect(deduplicateReadings([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// buildReadingCandidates
// ---------------------------------------------------------------------------

describe("buildReadingCandidates", () => {
  it("returns only kuromoji reading when Genji has no match", () => {
    const lookup: DictLookup = { found: false };
    const result = buildReadingCandidates("ゆきおんな", lookup, []);
    expect(result).toEqual(["ゆきおんな"]);
  });

  it("returns Genji primary first, then kuromoji (if different)", () => {
    const lookup: DictLookup = { found: true, reading: "せつじょ" };
    // kuromoji gives a different reading
    const result = buildReadingCandidates("ゆきおんな", lookup, []);
    expect(result[0]).toBe("せつじょ");
    expect(result).toContain("ゆきおんな");
  });

  it("deduplicates Genji primary when kuromoji gives the same reading", () => {
    const lookup: DictLookup = { found: true, reading: "ゆきおんな" };
    const result = buildReadingCandidates("ゆきおんな", lookup, []);
    // Should not repeat
    expect(result).toEqual(["ゆきおんな"]);
  });

  it("includes DictEntry alternatives", () => {
    const lookup: DictLookup = { found: true, reading: "ゆきおんな" };
    const entry = makeDictEntry("ゆきおんな", ["せつじょ", "ゆきにょうぼう"]);
    const result = buildReadingCandidates("ゆきおんな", lookup, [entry]);
    // primary from DictLookup first, then entry alternatives
    expect(result).toContain("せつじょ");
    expect(result).toContain("ゆきにょうぼう");
    // No duplicates: ゆきおんな appears once even though it's in DictLookup + entry primary
    expect(result.filter((r) => r === "ゆきおんな").length).toBe(1);
  });

  it("handles undefined dictLookup gracefully", () => {
    const result = buildReadingCandidates("ゆき", undefined, []);
    expect(result).toEqual(["ゆき"]);
  });

  it("handles empty kuromojiReading and no Genji data", () => {
    const result = buildReadingCandidates("", undefined, []);
    expect(result).toEqual([]);
  });

  it("handles katakana kuromoji reading by normalising to hiragana", () => {
    const lookup: DictLookup = { found: false };
    const result = buildReadingCandidates("ユキ", lookup, []);
    expect(result).toEqual(["ゆき"]);
  });

  it("merges multiple DictEntries with overlapping alternatives", () => {
    const entry1 = makeDictEntry("とうきょう", ["とうけい"]);
    const entry2 = makeDictEntry("とうきょう", ["とうけい", "もとのなまえ"]);
    const result = buildReadingCandidates("とうきょう", undefined, [entry1, entry2]);
    // Deduplicated: とうきょう, とうけい, もとのなまえ
    expect(result).toEqual(["とうきょう", "とうけい", "もとのなまえ"]);
  });
});

// ---------------------------------------------------------------------------
// buildBatchReadingCandidates
// ---------------------------------------------------------------------------

describe("buildBatchReadingCandidates", () => {
  it("processes multiple segments independently", () => {
    const inputs = [
      { surface: "雪", kuromojiReading: "ゆき" },
      {
        surface: "女",
        kuromojiReading: "おんな",
        dictLookup: { found: true, reading: "じょ" } satisfies DictLookup,
      },
    ];
    const results = buildBatchReadingCandidates(inputs);
    expect(results).toHaveLength(2);
    expect(results[0].candidates).toEqual(["ゆき"]);
    // Genji reading first for 女
    expect(results[1].candidates[0]).toBe("じょ");
    expect(results[1].candidates).toContain("おんな");
  });

  it("returns empty candidates for segment with no reading data", () => {
    const results = buildBatchReadingCandidates([{ surface: "　", kuromojiReading: "" }]);
    expect(results[0].candidates).toEqual([]);
  });

  it("returns empty array for empty input", () => {
    expect(buildBatchReadingCandidates([])).toEqual([]);
  });
});
