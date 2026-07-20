import { describe, it, expect } from "vitest";

import { charMap, applyCharMap } from "../char-map";

const MAP = new Map<string, string>([
  ["(", "（"],
  [")", "）"],
]);

describe("charMap", () => {
  it("maps known chars and passes through unknown ones", () => {
    const fn = charMap(MAP);
    expect(fn("(")).toBe("（");
    expect(fn(")")).toBe("）");
    expect(fn("x")).toBe("x");
  });
});

describe("applyCharMap", () => {
  it("converts across a string", () => {
    expect(applyCharMap(MAP, "(abc)")).toBe("（abc）");
  });

  it("passes through unmapped and astral (surrogate-pair) characters", () => {
    // U+2000B is a surrogate pair; must be treated as one unit, not split.
    expect(applyCharMap(MAP, "𠀋(x)")).toBe("𠀋（x）");
  });

  it("handles empty string", () => {
    expect(applyCharMap(MAP, "")).toBe("");
  });
});
