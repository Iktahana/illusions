import { describe, it, expect } from "vitest";

import { isAllKana, toKatakana, toHiragana, readingForms } from "@/lib/dict/kana";

describe("kana helpers (#1935 reading normalization)", () => {
  describe("isAllKana — the safety gate for reading fallback", () => {
    it("accepts fully-kana content words", () => {
      expect(isAllKana("ある")).toBe(true);
      expect(isAllKana("わかる")).toBe(true);
      expect(isAllKana("アル")).toBe(true);
      expect(isAllKana("コーヒー")).toBe(true); // includes 長音符
    });

    it("rejects terms containing kanji so they keep exact-match semantics", () => {
      expect(isAllKana("讀む")).toBe(false); // 讀 is kanji → must stay flaggable
      expect(isAllKana("圕")).toBe(false);
      expect(isAllKana("有る")).toBe(false);
    });

    it("rejects ascii / empty / symbols", () => {
      expect(isAllKana("")).toBe(false);
      expect(isAllKana("abc")).toBe(false);
      expect(isAllKana("123")).toBe(false);
    });
  });

  describe("script conversion", () => {
    it("hiragana → katakana", () => {
      expect(toKatakana("ある")).toBe("アル");
      expect(toKatakana("わかる")).toBe("ワカル");
    });
    it("katakana → hiragana", () => {
      expect(toHiragana("アル")).toBe("ある");
    });
    it("passes through long vowel and non-kana", () => {
      expect(toKatakana("ー")).toBe("ー");
    });
  });

  describe("readingForms — probes both scripts", () => {
    it("returns the term plus its katakana/hiragana variants, deduped", () => {
      expect(readingForms("ある").sort()).toEqual(["ある", "アル"].sort());
      expect(readingForms("アル").sort()).toEqual(["ある", "アル"].sort());
    });
  });
});
