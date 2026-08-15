import { describe, expect, it } from "vitest";

import { codeUnitOffsetToGraphemeIndex, getPosHighlightCategory } from "../pos-highlight-utils";

describe("getPosHighlightCategory", () => {
  it("keeps verb detail categories that have dedicated colors", () => {
    expect(getPosHighlightCategory({ pos: "動詞", pos_detail_1: "自立" })).toBe("動詞-自立");
    expect(getPosHighlightCategory({ pos: "動詞", pos_detail_1: "非自立" })).toBe("動詞-非自立");
  });

  it("falls back to the coarse part-of-speech category", () => {
    expect(getPosHighlightCategory({ pos: "名詞", pos_detail_1: "一般" })).toBe("名詞");
    expect(getPosHighlightCategory({ pos: "動詞", pos_detail_1: "接尾" })).toBe("動詞");
  });
});

describe("codeUnitOffsetToGraphemeIndex", () => {
  it("counts Unicode grapheme clusters instead of UTF-16 code units", () => {
    const text = "A🇯🇵あ";
    expect(codeUnitOffsetToGraphemeIndex(text, 0)).toBe(0);
    expect(codeUnitOffsetToGraphemeIndex(text, 1)).toBe(1);
    expect(codeUnitOffsetToGraphemeIndex(text, 5)).toBe(2);
    expect(codeUnitOffsetToGraphemeIndex(text, text.length)).toBe(3);
  });
});
