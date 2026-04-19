import { describe, it, expect, beforeEach, vi } from "vitest";

import type { Token } from "@/lib/nlp-client/types";

const vocabState = {
  ready: true,
  words: new Set<string>(),
};

vi.mock("@/lib/dict/genji-vocab", () => ({
  genjiVocab: {
    isReady: () => vocabState.ready,
    has: (w: string) => vocabState.words.has(w),
  },
}));

import { GenjiUnknownNounRule } from "../genji-unknown-noun";

function tok(partial: Partial<Token> & Pick<Token, "surface" | "pos" | "start" | "end">): Token {
  return {
    pos_detail_1: "一般",
    basic_form: partial.surface,
    ...partial,
  } as Token;
}

describe("GenjiUnknownNounRule", () => {
  const rule = new GenjiUnknownNounRule();
  const cfg = { enabled: true, severity: "warning" as const };

  beforeEach(() => {
    vocabState.ready = true;
    vocabState.words = new Set(["光君", "紫の上"]);
  });

  it("returns no issues when vocab is not ready", () => {
    vocabState.ready = false;
    const tokens = [tok({ surface: "知らない", pos: "名詞", start: 0, end: 4 })];
    expect(rule.lintWithTokens("", tokens, cfg)).toEqual([]);
  });

  it("flags nouns not in the vocab", () => {
    const tokens: Token[] = [
      tok({ surface: "光君", pos: "名詞", pos_detail_1: "固有名詞", start: 0, end: 2 }),
      tok({ surface: "宇宙人", pos: "名詞", pos_detail_1: "一般", start: 2, end: 5 }),
    ];
    const issues = rule.lintWithTokens("", tokens, cfg);
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe("genji-unknown-noun");
    expect(issues[0].from).toBe(2);
    expect(issues[0].to).toBe(5);
    expect(issues[0].originalText).toBe("宇宙人");
  });

  it("skips non-noun, pronoun, numeric, and affix tokens", () => {
    const tokens: Token[] = [
      tok({ surface: "走る", pos: "動詞", start: 0, end: 2 }),
      tok({ surface: "それ", pos: "名詞", pos_detail_1: "代名詞", start: 2, end: 4 }),
      tok({ surface: "三", pos: "名詞", pos_detail_1: "数", start: 4, end: 5 }),
      tok({ surface: "さん", pos: "名詞", pos_detail_1: "接尾", start: 5, end: 7 }),
    ];
    expect(rule.lintWithTokens("", tokens, cfg)).toEqual([]);
  });

  it("skips ASCII-only nouns", () => {
    const tokens = [tok({ surface: "HTTP", pos: "名詞", pos_detail_1: "一般", start: 0, end: 4 })];
    expect(rule.lintWithTokens("", tokens, cfg)).toEqual([]);
  });

  it("skips single-character hiragana nouns", () => {
    const tokens = [tok({ surface: "ん", pos: "名詞", pos_detail_1: "一般", start: 0, end: 1 })];
    expect(rule.lintWithTokens("", tokens, cfg)).toEqual([]);
  });

  it("consults basic_form when surface is inflected", () => {
    const tokens = [
      tok({
        surface: "光君が",
        basic_form: "光君",
        pos: "名詞",
        pos_detail_1: "固有名詞",
        start: 0,
        end: 3,
      }),
    ];
    // "光君" is in vocab via basic_form, so no issue expected
    expect(rule.lintWithTokens("", tokens, cfg)).toEqual([]);
  });

  it("uses configured severity in reported issues", () => {
    const tokens = [
      tok({ surface: "未知語", pos: "名詞", pos_detail_1: "一般", start: 0, end: 3 }),
    ];
    const issues = rule.lintWithTokens("", tokens, { enabled: true, severity: "info" });
    expect(issues[0].severity).toBe("info");
  });
});
