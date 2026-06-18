import { describe, it, expect } from "vitest";

import { matchWordList, escapeRegExp } from "../word-list";

describe("escapeRegExp", () => {
  it("escapes regex metacharacters so words match literally", () => {
    const re = new RegExp(escapeRegExp("a.b"));
    expect(re.test("a.b")).toBe(true);
    expect(re.test("axb")).toBe(false);
  });
});

describe("matchWordList", () => {
  it("finds all occurrences ordered by position", () => {
    const m = matchWordList("テレビとラジオとテレビ", ["テレビ", "ラジオ"]);
    expect(m.map((x) => [x.word, x.from])).toEqual([
      ["テレビ", 0],
      ["ラジオ", 4],
      ["テレビ", 8],
    ]);
  });

  it("orders longer matches first at the same start position", () => {
    const m = matchWordList("もっとも", ["もっと", "もっとも"]);
    expect(m[0].word).toBe("もっとも");
    expect(m[0].to).toBe(4);
  });

  it("ignores empty and duplicate entries", () => {
    const m = matchWordList("abcabc", ["", "abc", "abc"]);
    expect(m).toHaveLength(2);
  });

  it("returns nothing for no matches", () => {
    expect(matchWordList("xyz", ["abc"])).toHaveLength(0);
  });
});
