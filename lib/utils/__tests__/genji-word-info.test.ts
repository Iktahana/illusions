/**
 * Unit tests for buildGenjiWordInfoViewModel.
 *
 * We test only the pure function — no React, no DictService.
 * The hook's async branching is validated by the state machine contracts
 * documented in genji-word-info.ts.
 */

import { describe, it, expect } from "vitest";

import { buildGenjiWordInfoViewModel } from "../genji-word-info";
import type { DictQueryResult, DictEntry } from "@/lib/dict/dict-types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<DictEntry> = {}): DictEntry {
  return {
    id: "test-1",
    entry: "雪",
    reading: { primary: "ゆき", alternatives: [] },
    partOfSpeech: "名詞",
    inflections: [],
    definitions: [
      { gloss: "大気中の水蒸気が結晶して降る白いもの", register: "文章語" },
      { gloss: "白色のたとえ" },
      { gloss: "冬の風物詩" },
      { gloss: "余分な四番目の語義" },
    ],
    relationships: {
      homophones: [],
      synonyms: ["白雪", "積雪", "降雪", "初雪", "粉雪", "余分な類義語"],
      antonyms: [],
      related: [],
    },
    source: "genji",
    ...overrides,
  };
}

function makeResult(entries: DictEntry[] = [makeEntry()]): DictQueryResult {
  return { entries, noResults: false, providerUnavailable: false };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("buildGenjiWordInfoViewModel", () => {
  it("extracts reading, partOfSpeech, register, glosses, synonyms from the first entry", () => {
    const vm = buildGenjiWordInfoViewModel("雪", makeResult());

    expect(vm).not.toBeNull();
    expect(vm!.word).toBe("雪");
    expect(vm!.reading).toBe("ゆき");
    expect(vm!.partOfSpeech).toBe("名詞");
    expect(vm!.register).toBe("文章語");
  });

  it("limits glosses to 3 items maximum", () => {
    const vm = buildGenjiWordInfoViewModel("雪", makeResult());

    expect(vm!.glosses).toHaveLength(3);
    expect(vm!.glosses[0]).toBe("大気中の水蒸気が結晶して降る白いもの");
    expect(vm!.glosses[2]).toBe("冬の風物詩");
  });

  it("limits synonyms to 5 items maximum", () => {
    const vm = buildGenjiWordInfoViewModel("雪", makeResult());

    expect(vm!.synonyms).toHaveLength(5);
    expect(vm!.synonyms[0]).toBe("白雪");
    expect(vm!.synonyms[4]).toBe("粉雪");
    // sixth should be excluded
  });

  it("returns null when result is null", () => {
    expect(buildGenjiWordInfoViewModel("雪", null)).toBeNull();
  });

  it("returns null when result is undefined", () => {
    expect(buildGenjiWordInfoViewModel("雪", undefined)).toBeNull();
  });

  it("returns null when providerUnavailable is true", () => {
    const result: DictQueryResult = { entries: [], noResults: false, providerUnavailable: true };
    expect(buildGenjiWordInfoViewModel("雪", result)).toBeNull();
  });

  it("returns null when entries array is empty", () => {
    const result: DictQueryResult = { entries: [], noResults: true, providerUnavailable: false };
    expect(buildGenjiWordInfoViewModel("雪", result)).toBeNull();
  });

  it("returns null when noResults is true with empty entries", () => {
    const result: DictQueryResult = { entries: [], noResults: true, providerUnavailable: false };
    expect(buildGenjiWordInfoViewModel("雪", result)).toBeNull();
  });

  it("handles entry with no definitions gracefully", () => {
    const entry = makeEntry({ definitions: [] });
    const vm = buildGenjiWordInfoViewModel("雪", makeResult([entry]));

    expect(vm).not.toBeNull();
    expect(vm!.glosses).toHaveLength(0);
    expect(vm!.register).toBeNull();
  });

  it("handles entry with no synonyms gracefully", () => {
    const entry = makeEntry({
      relationships: { homophones: [], synonyms: [], antonyms: [], related: [] },
    });
    const vm = buildGenjiWordInfoViewModel("雪", makeResult([entry]));

    expect(vm).not.toBeNull();
    expect(vm!.synonyms).toHaveLength(0);
  });

  it("returns null partOfSpeech when entry has no partOfSpeech", () => {
    const entry = makeEntry({ partOfSpeech: undefined });
    const vm = buildGenjiWordInfoViewModel("雪", makeResult([entry]));

    expect(vm!.partOfSpeech).toBeNull();
  });

  it("returns null register when no definition carries a register", () => {
    const entry = makeEntry({
      definitions: [{ gloss: "読み込み無しの語義" }],
    });
    const vm = buildGenjiWordInfoViewModel("雪", makeResult([entry]));

    expect(vm!.register).toBeNull();
  });

  it("picks the first non-empty register across definitions", () => {
    const entry = makeEntry({
      definitions: [
        { gloss: "最初の語義" },
        { gloss: "二番目の語義", register: "口語" },
        { gloss: "三番目の語義", register: "文章語" },
      ],
    });
    const vm = buildGenjiWordInfoViewModel("雪", makeResult([entry]));

    expect(vm!.register).toBe("口語");
  });

  it("uses the word argument as the ViewModel word, not entry.entry", () => {
    // Useful when the query surface and the headword differ slightly
    const vm = buildGenjiWordInfoViewModel("QUERY", makeResult());
    expect(vm!.word).toBe("QUERY");
  });
});
