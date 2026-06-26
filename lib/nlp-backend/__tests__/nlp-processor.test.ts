/**
 * Unit & edge-case tests for the morphological-analysis backend (NlpProcessor).
 *
 * Focus areas — the recurring source of "weird" highlight bugs:
 *   1. Character-position correctness: every token's [start, end) must slice
 *      back to its exact surface form in the ORIGINAL text.
 *   2. Noise-character handling (\n, \r are stripped before kuromoji): a token
 *      must not swallow a trailing stripped newline (regression for the
 *      "改行\n" range over-extension).
 *   3. Unicode edge cases: surrogate pairs (𠮷, emoji), full-width characters.
 *   4. User-dictionary token merging keeps positions contiguous.
 *
 * These run against the real kuromoji dictionary shipped in `public/dict`.
 */
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import path from "path";
import { nlpProcessor } from "../nlp-processor";
import type { Token } from "../../nlp-client/types";

const DIC_PATH = path.join(process.cwd(), "public/dict");

beforeAll(async () => {
  if (!nlpProcessor.isInitialized()) {
    await nlpProcessor.init(DIC_PATH);
  }
}, 30000);

// Reset any user dictionary mutation a test introduced (also clears the cache).
afterEach(() => {
  nlpProcessor.setUserDictionary([]);
});

/** Assert tokens reconstruct the source and are well-ordered. */
function expectExactCoverage(text: string, tokens: Token[]): void {
  let cursor = 0;
  for (const t of tokens) {
    expect(t.start).toBeGreaterThanOrEqual(cursor);
    expect(t.end).toBeGreaterThan(t.start);
    // Each token slices back to exactly its surface form.
    expect(text.slice(t.start, t.end)).toBe(t.surface);
    cursor = t.end;
  }
  expect(cursor).toBeLessThanOrEqual(text.length);
}

describe("NlpProcessor.cleanTextForTokenization", () => {
  it("is identity (with end sentinel) when there is no noise", () => {
    const { cleanedText, positionMap } = nlpProcessor.cleanTextForTokenization("太平洋");
    expect(cleanedText).toBe("太平洋");
    // positionMap has one entry per char plus a trailing sentinel == text.length.
    expect(positionMap).toEqual([0, 1, 2, 3]);
  });

  it("strips \\n and \\r and maps cleaned indices back to original", () => {
    const text = "改行\nを\r含む";
    const { cleanedText, positionMap } = nlpProcessor.cleanTextForTokenization(text);
    expect(cleanedText).toBe("改行を含む");
    // 改=0 行=1 (\n=2 stripped) を=3 (\r=4 stripped) 含=5 む=6, sentinel=7
    expect(positionMap).toEqual([0, 1, 3, 5, 6, 7]);
  });

  it("handles all-noise and empty input", () => {
    expect(nlpProcessor.cleanTextForTokenization("").cleanedText).toBe("");
    expect(nlpProcessor.cleanTextForTokenization("\n\r\n").cleanedText).toBe("");
    // Sentinel still present: maps cleaned length (0) -> original length.
    expect(nlpProcessor.cleanTextForTokenization("\n\r").positionMap).toEqual([2]);
  });
});

describe("NlpProcessor.tokenize — position correctness", () => {
  const sentences = [
    "太平洋のただ中に、面積およそ四十平方キロにも満たない環礁がひとつある。",
    "そこに住む者たちは、十九世紀イギリスの訛りで言葉を交わし、たったひとつの姓を分かち合っている。",
    "私がこの島に着いたのは、ちょうど一月だった。",
  ];

  for (const text of sentences) {
    it(`every token slices back to its surface: ${text.slice(0, 12)}…`, async () => {
      const tokens = await nlpProcessor.tokenize(text);
      expect(tokens.length).toBeGreaterThan(0);
      expectExactCoverage(text, tokens);
      // Noise-free input → contiguous coverage of the entire string.
      expect(tokens[0].start).toBe(0);
      expect(tokens[tokens.length - 1].end).toBe(text.length);
    });
  }

  it("returns an empty array for empty input", async () => {
    expect(await nlpProcessor.tokenize("")).toEqual([]);
  });

  it("keeps positions aligned across surrogate pairs (CJK ext-B & emoji)", async () => {
    const text = "𠮷野家で🔥した。";
    const tokens = await nlpProcessor.tokenize(text);
    expectExactCoverage(text, tokens);
    // The very first token must start at the surrogate pair, length 2 (UTF-16).
    expect(tokens[0].start).toBe(0);
    expect(text.slice(tokens[0].start, tokens[0].end)).toBe(tokens[0].surface);
  });

  it("keeps positions aligned across full-width characters", async () => {
    const text = "ＡＢＣ１２３です";
    const tokens = await nlpProcessor.tokenize(text);
    expectExactCoverage(text, tokens);
  });

  it("keeps positions aligned across ZWJ / variation-selector sequences", async () => {
    for (const text of ["家族👨‍👩‍👧です", "邉0山さん", "ゼロ​幅あり"]) {
      const tokens = await nlpProcessor.tokenize(text);
      expectExactCoverage(text, tokens);
    }
  });

  it("does NOT drift later tokens when kuromoji drops a flag-emoji region", async () => {
    // Regional-indicator flags (🇯🇵) make kuromoji emit inconsistent internal
    // positions and drop surrounding tokens. Re-anchoring must keep every
    // emitted token aligned; the dropped region is simply left uncovered.
    const text = "国旗🇯🇵を見た。";
    const tokens = await nlpProcessor.tokenize(text);
    expectExactCoverage(text, tokens); // invariant: each token slices to its surface
    // The token after the flag must map to real text, never a shifted neighbor.
    const flag = tokens.find((t) => t.surface.includes("🇯🇵"));
    expect(flag).toBeDefined();
    expect(text.slice(flag!.start, flag!.end)).toBe(flag!.surface);
  });
});

describe("NlpProcessor.tokenize — noise-character regression", () => {
  it("does NOT extend a token's range over a trailing stripped newline", async () => {
    const text = "改行\nテスト";
    const tokens = await nlpProcessor.tokenize(text);
    const kaigyo = tokens.find((t) => t.surface === "改行");
    expect(kaigyo).toBeDefined();
    // Bug was: end mapped to positionMap[end] → "改行\n". Must be exactly "改行".
    expect(text.slice(kaigyo!.start, kaigyo!.end)).toBe("改行");
    expect(kaigyo!.end).toBe(2);
  });

  it("maps tokens after a leading newline to their true offsets", async () => {
    const text = "\n先頭";
    const tokens = await nlpProcessor.tokenize(text);
    const sento = tokens.find((t) => t.surface === "先頭");
    expect(sento).toBeDefined();
    expect(sento!.start).toBe(1);
    expect(text.slice(sento!.start, sento!.end)).toBe("先頭");
  });
});

describe("NlpProcessor — token caching", () => {
  it("returns equal results for repeated identical input", async () => {
    const text = "同じ文を二度。";
    const a = await nlpProcessor.tokenize(text);
    const b = await nlpProcessor.tokenize(text);
    expect(b).toEqual(a);
  });
});

describe("NlpProcessor.tokenizeBatch", () => {
  it("preserves paragraph pos and tokenizes each independently", async () => {
    const paragraphs = [
      { pos: 5, text: "一つ目。" },
      { pos: 42, text: "二つ目の段落。" },
    ];
    const results = await nlpProcessor.tokenizeBatch(paragraphs);
    expect(results.map((r) => r.pos)).toEqual([5, 42]);
    for (const r of results) {
      const source = paragraphs.find((p) => p.pos === r.pos)!.text;
      expectExactCoverage(source, r.tokens);
    }
  });
});

describe("NlpProcessor — user dictionary merging", () => {
  it("merges consecutive tokens into one user-defined word with contiguous positions", async () => {
    const text = "彼は六季島へ向かった。";
    const before = await nlpProcessor.tokenize(text);
    // Baseline: "六季島" is normally split into multiple tokens.
    const mergedBaseline = before.find((t) => t.surface === "六季島");
    expect(mergedBaseline).toBeUndefined();

    nlpProcessor.setUserDictionary([
      { id: "u1", word: "六季島", reading: "ロッキトウ", partOfSpeech: "名詞" },
    ]);
    const after = await nlpProcessor.tokenize(text);

    const merged = after.find((t) => t.surface === "六季島");
    expect(merged).toBeDefined();
    expect(text.slice(merged!.start, merged!.end)).toBe("六季島");
    expect(merged!.pos).toBe("名詞");
    // The merge must not corrupt surrounding coverage.
    expectExactCoverage(text, after);
  });

  it("clears cached tokens when the dictionary changes", async () => {
    const text = "六季島は遠い。";
    const plain = await nlpProcessor.tokenize(text);
    expect(plain.find((t) => t.surface === "六季島")).toBeUndefined();

    nlpProcessor.setUserDictionary([{ id: "u2", word: "六季島" }]);
    const merged = await nlpProcessor.tokenize(text);
    expect(merged.find((t) => t.surface === "六季島")).toBeDefined();
  });

  it("ignores empty / whitespace-only headwords without crashing or hanging", async () => {
    // A zero-length word previously matched immediately, read tokens[-1] and
    // never advanced the cursor → crash or infinite loop on the first token.
    nlpProcessor.setUserDictionary([
      { id: "e1", word: "" },
      { id: "e2", word: "   " },
      { id: "e3", word: "島" },
    ]);
    const text = "島へ行く。";
    const tokens = await nlpProcessor.tokenize(text);
    expectExactCoverage(text, tokens);
    expect(tokens.find((t) => t.surface === "島")).toBeDefined();
  });

  it("keeps surrounding coverage intact when a user word appears mid-sentence", async () => {
    nlpProcessor.setUserDictionary([{ id: "m1", word: "六季島" }]);
    const text = "遠い六季島の話。";
    const tokens = await nlpProcessor.tokenize(text);
    expectExactCoverage(text, tokens);
    const merged = tokens.find((t) => t.surface === "六季島")!;
    expect(text.slice(merged.start, merged.end)).toBe("六季島");
  });
});
