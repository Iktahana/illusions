import { describe, it, expect } from "vitest";

import type { Token } from "@/lib/nlp-client/types";

import { AdverbFormConsistencyRule } from "../adverb-form-consistency";

/** Helper to create a mock token */
function mockToken(
  surface: string,
  pos: string,
  start: number,
  reading = "",
  basic = surface,
): Token {
  return {
    surface,
    pos,
    pos_detail_1: "*",
    pos_detail_2: "*",
    pos_detail_3: "*",
    conjugation_type: "",
    conjugation_form: "",
    basic_form: basic,
    reading,
    pronunciation: "",
    start,
    end: start + surface.length,
  };
}

describe("adverb-form-consistency", () => {
  const rule = new AdverbFormConsistencyRule();
  const config = rule.defaultConfig;

  it("should have correct metadata", () => {
    expect(rule.id).toBe("adverb-form-consistency");
    expect(rule.level).toBe("L2");
  });

  it("should return no issues for empty paragraphs", () => {
    const results = rule.lintDocumentWithTokens([], config);
    expect(results).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // Detection: mixed adverb forms
  // -----------------------------------------------------------------------
  it("should detect mixed adverb forms (kanji vs kana)", () => {
    const paragraphs = [
      {
        text: "全く分からない。",
        index: 0,
        tokens: [
          mockToken("全く", "副詞", 0, "マッタク"),
          mockToken("分から", "動詞", 2),
          mockToken("ない", "助動詞", 5),
        ] as Token[],
      },
      {
        text: "全く意味がない。",
        index: 1,
        tokens: [
          mockToken("全く", "副詞", 0, "マッタク"),
          mockToken("意味", "名詞", 2),
          mockToken("が", "助詞", 4),
          mockToken("ない", "助動詞", 5),
        ] as Token[],
      },
      {
        text: "まったく理解できない。",
        index: 2,
        tokens: [
          mockToken("まったく", "副詞", 0, "マッタク"),
          mockToken("理解", "名詞", 4),
          mockToken("でき", "動詞", 6),
          mockToken("ない", "助動詞", 8),
        ] as Token[],
      },
    ];

    const results = rule.lintDocumentWithTokens(paragraphs, config);
    const allIssues = results.flatMap((r) => r.issues);
    expect(allIssues.length).toBeGreaterThan(0);
    expect(allIssues[0].ruleId).toBe("adverb-form-consistency");
    // Minority form should be flagged
    expect(allIssues[0].fix).toBeDefined();
    // Majority is "全く" (appears 2 times), minority is "まったく"
    expect(allIssues[0].fix?.replacement).toBe("全く");
  });

  // -----------------------------------------------------------------------
  // No detection: consistent form
  // -----------------------------------------------------------------------
  it("should not flag when only one form is used", () => {
    const paragraphs = [
      {
        text: "全く分からない。",
        index: 0,
        tokens: [
          mockToken("全く", "副詞", 0, "マッタク"),
          mockToken("分から", "動詞", 2),
          mockToken("ない", "助動詞", 5),
        ] as Token[],
      },
      {
        text: "全く意味がない。",
        index: 1,
        tokens: [
          mockToken("全く", "副詞", 0, "マッタク"),
          mockToken("意味", "名詞", 2),
          mockToken("が", "助詞", 4),
          mockToken("ない", "助動詞", 5),
        ] as Token[],
      },
    ];

    const results = rule.lintDocumentWithTokens(paragraphs, config);
    const allIssues = results.flatMap((r) => r.issues);
    expect(allIssues).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // Non-adverb tokens should be ignored
  // -----------------------------------------------------------------------
  it("should ignore non-adverb tokens even with matching reading", () => {
    const paragraphs = [
      {
        text: "全く分からない。",
        index: 0,
        tokens: [
          // Same reading but noun POS, should be ignored
          mockToken("全く", "名詞", 0, "マッタク"),
          mockToken("分から", "動詞", 2),
          mockToken("ない", "助動詞", 5),
        ] as Token[],
      },
    ];

    const results = rule.lintDocumentWithTokens(paragraphs, config);
    const allIssues = results.flatMap((r) => r.issues);
    expect(allIssues).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // lint() and lintDocument() should return empty
  // -----------------------------------------------------------------------
  it("should return empty from lint() method", () => {
    expect(rule.lint("全く分からない。", config)).toHaveLength(0);
  });

  it("should return empty from lintDocument() method", () => {
    const results = rule.lintDocument(
      [{ text: "全く分からない。", index: 0 }],
      config,
    );
    expect(results).toHaveLength(0);
  });
});
