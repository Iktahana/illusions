import { describe, it, expect } from "vitest";

import { collectDictCandidateTerms, dictCandidateTerm } from "@/lib/linting/dict-candidate-terms";
import type { Token } from "@/lib/nlp-client/types";

/** Build a token with sensible defaults. */
function tok(partial: Partial<Token> & { surface: string; pos: string }): Token {
  return {
    pos_detail_1: undefined,
    pos_detail_2: undefined,
    pos_detail_3: undefined,
    basic_form: partial.surface,
    reading: undefined,
    start: 0,
    end: partial.surface.length,
    ...partial,
  } as Token;
}

describe("dictCandidateTerm", () => {
  it("returns the surface for a general noun", () => {
    expect(dictCandidateTerm(tok({ surface: "辞書", pos: "名詞", pos_detail_1: "一般" }))).toBe(
      "辞書",
    );
  });

  it("includes proper nouns by default (uses surface)", () => {
    const t = tok({ surface: "幾田花", pos: "名詞", pos_detail_1: "固有名詞" });
    expect(dictCandidateTerm(t)).toBe("幾田花");
    expect(dictCandidateTerm(t, { includeProperNouns: false })).toBeNull();
  });

  it("uses basic_form for conjugated verbs/adjectives", () => {
    expect(
      dictCandidateTerm(
        tok({ surface: "走っ", pos: "動詞", pos_detail_1: "自立", basic_form: "走る" }),
      ),
    ).toBe("走る");
    expect(
      dictCandidateTerm(
        tok({ surface: "美しく", pos: "形容詞", pos_detail_1: "自立", basic_form: "美しい" }),
      ),
    ).toBe("美しい");
  });

  it("falls back to surface when basic_form is missing/unknown", () => {
    expect(
      dictCandidateTerm(
        tok({ surface: "ググる", pos: "動詞", pos_detail_1: "自立", basic_form: "*" }),
      ),
    ).toBe("ググる");
  });

  it("skips verbs/adjectives when includeVerbsAdjectives is false", () => {
    const t = tok({ surface: "走っ", pos: "動詞", pos_detail_1: "自立", basic_form: "走る" });
    expect(dictCandidateTerm(t, { includeVerbsAdjectives: false })).toBeNull();
  });

  it.each([
    ["数", tok({ surface: "三", pos: "名詞", pos_detail_1: "数" })],
    ["代名詞", tok({ surface: "それ", pos: "名詞", pos_detail_1: "代名詞" })],
    ["非自立", tok({ surface: "こと", pos: "名詞", pos_detail_1: "非自立" })],
    ["接尾", tok({ surface: "たち", pos: "名詞", pos_detail_1: "接尾" })],
  ])("excludes auxiliary noun subtype %s", (_label, t) => {
    expect(dictCandidateTerm(t)).toBeNull();
  });

  it.each([
    ["助詞", tok({ surface: "は", pos: "助詞", pos_detail_1: "係助詞" })],
    ["助動詞", tok({ surface: "だ", pos: "助動詞" })],
    ["記号", tok({ surface: "。", pos: "記号", pos_detail_1: "句点" })],
  ])("skips non-content part of speech %s", (_label, t) => {
    expect(dictCandidateTerm(t)).toBeNull();
  });

  it("skips pure-ASCII tokens (English, digits, symbols)", () => {
    expect(
      dictCandidateTerm(tok({ surface: "hello", pos: "名詞", pos_detail_1: "固有名詞" })),
    ).toBeNull();
    expect(dictCandidateTerm(tok({ surface: "123", pos: "名詞", pos_detail_1: "数" }))).toBeNull();
  });

  it("respects minLength", () => {
    const t = tok({ surface: "木", pos: "名詞", pos_detail_1: "一般" });
    expect(dictCandidateTerm(t, { minLength: 1 })).toBe("木");
    expect(dictCandidateTerm(t, { minLength: 2 })).toBeNull();
  });
});

describe("collectDictCandidateTerms", () => {
  it("dedupes across tokens and drops non-candidates", () => {
    const tokens: Token[] = [
      tok({ surface: "辞書", pos: "名詞", pos_detail_1: "一般" }),
      tok({ surface: "は", pos: "助詞", pos_detail_1: "係助詞" }),
      tok({ surface: "辞書", pos: "名詞", pos_detail_1: "一般" }), // dup
      tok({ surface: "走っ", pos: "動詞", pos_detail_1: "自立", basic_form: "走る" }),
    ];
    expect(collectDictCandidateTerms(tokens).sort()).toEqual(["走る", "辞書"]);
  });

  it("returns an empty list for no candidate tokens", () => {
    expect(
      collectDictCandidateTerms([tok({ surface: "、", pos: "記号", pos_detail_1: "読点" })]),
    ).toEqual([]);
  });
});
