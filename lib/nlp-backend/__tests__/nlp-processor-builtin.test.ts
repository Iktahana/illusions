import { describe, it, expect, beforeEach } from "vitest";

import type { Token } from "@/lib/nlp-client/types";
import { nlpProcessor } from "../nlp-processor";

type Processor = {
  setUserDictionary: (entries: ReadonlyArray<unknown>) => void;
  setBuiltinDictionary: (entries: ReadonlyArray<unknown>) => void;
  // Private access for white-box testing of merge logic.
  mergeUserDictionaryTokens: (tokens: Token[]) => Token[];
};

function baseToken(partial: Partial<Token> & Pick<Token, "surface" | "start" | "end">): Token {
  return {
    pos: "名詞",
    basic_form: partial.surface,
    ...partial,
  } as Token;
}

function seq(...parts: string[]): Token[] {
  let pos = 0;
  return parts.map((s) => {
    const t = baseToken({ surface: s, start: pos, end: pos + s.length });
    pos += s.length;
    return t;
  });
}

describe("nlpProcessor builtin dictionary", () => {
  beforeEach(() => {
    nlpProcessor.setUserDictionary([]);
    nlpProcessor.setBuiltinDictionary([]);
  });

  it("merges adjacent tokens matching a builtin word", () => {
    const p = nlpProcessor as unknown as Processor;
    p.setBuiltinDictionary([{ word: "光君", reading: "ヒカルギミ", partOfSpeech: "名詞" }]);

    const tokens = seq("光", "君", "は");
    const merged = p.mergeUserDictionaryTokens(tokens);
    expect(merged.map((t) => t.surface)).toEqual(["光君", "は"]);
    expect(merged[0].start).toBe(0);
    expect(merged[0].end).toBe(2);
    expect(merged[0].pos).toBe("名詞");
  });

  it("prefers longest match across user + builtin", () => {
    const p = nlpProcessor as unknown as Processor;
    p.setUserDictionary([{ id: "u1", word: "紫" }]);
    p.setBuiltinDictionary([{ word: "紫の上", reading: "ムラサキノウエ", partOfSpeech: "名詞" }]);

    const tokens = seq("紫", "の", "上");
    const merged = p.mergeUserDictionaryTokens(tokens);
    expect(merged.map((t) => t.surface)).toEqual(["紫の上"]);
  });

  it("user entry wins when same word appears in builtin", () => {
    const p = nlpProcessor as unknown as Processor;
    p.setUserDictionary([{ id: "u1", word: "源氏", partOfSpeech: "固有名詞" }]);
    p.setBuiltinDictionary([{ word: "源氏", partOfSpeech: "名詞" }]);

    const tokens = seq("源", "氏");
    const merged = p.mergeUserDictionaryTokens(tokens);
    expect(merged).toHaveLength(1);
    expect(merged[0].pos).toBe("固有名詞");
  });

  it("is a no-op when both dictionaries are empty", () => {
    const p = nlpProcessor as unknown as Processor;
    const tokens = seq("春", "が", "来た");
    const merged = p.mergeUserDictionaryTokens(tokens);
    expect(merged).toEqual(tokens);
  });
});
