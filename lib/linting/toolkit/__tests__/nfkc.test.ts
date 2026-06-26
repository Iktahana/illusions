import { describe, it, expect } from "vitest";

import { nfkc, isNfkc } from "../nfkc";

describe("nfkc", () => {
  it("composes half-width katakana with dakuten (Tier B: ﾄﾞ → ド)", () => {
    expect(nfkc("ﾄﾞ")).toBe("ド");
    expect(nfkc("ﾊﾟ")).toBe("パ");
    expect(nfkc("ｶﾞｷﾞｸﾞｹﾞｺﾞ")).toBe("ガギグゲゴ");
  });

  it("widens plain half-width katakana", () => {
    expect(nfkc("ｱｲｳｴｵ")).toBe("アイウエオ");
    expect(nfkc("ﾆﾎﾝｺﾞ")).toBe("ニホンゴ");
  });

  it("narrows full-width ASCII alphanumerics", () => {
    expect(nfkc("ＡＢＣ１２３")).toBe("ABC123");
  });

  it("passes through already-normalized text and empty string", () => {
    expect(nfkc("")).toBe("");
    expect(nfkc("あいうえお漢字")).toBe("あいうえお漢字");
    expect(nfkc("ド")).toBe("ド");
  });

  it("isNfkc reports normalization state", () => {
    expect(isNfkc("ド")).toBe(true);
    expect(isNfkc("ﾄﾞ")).toBe(false);
    expect(isNfkc("")).toBe(true);
  });
});
