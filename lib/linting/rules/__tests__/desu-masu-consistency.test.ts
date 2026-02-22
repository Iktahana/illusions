import { describe, it, expect } from "vitest";

import type { Token } from "@/lib/nlp-client/types";

import { DesuMasuConsistencyRule } from "../desu-masu-consistency";

/** Helper to create a mock token */
function mockToken(
  surface: string,
  pos: string,
  start: number,
  detail1 = "*",
  basic = surface,
  conjForm = "",
): Token {
  return {
    surface,
    pos,
    pos_detail_1: detail1,
    pos_detail_2: "*",
    pos_detail_3: "*",
    conjugation_type: "",
    conjugation_form: conjForm,
    basic_form: basic,
    reading: "",
    pronunciation: "",
    start,
    end: start + surface.length,
  };
}

describe("desu-masu-consistency", () => {
  const rule = new DesuMasuConsistencyRule();
  const config = rule.defaultConfig;

  it("should have correct metadata", () => {
    expect(rule.id).toBe("desu-masu-consistency");
    expect(rule.level).toBe("L2");
  });

  it("should return no issues for empty paragraphs", () => {
    const results = rule.lintDocumentWithTokens([], config);
    expect(results).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // Detection: mixed polite and plain styles
  // -----------------------------------------------------------------------
  it("should detect mixing of polite and plain styles", () => {
    const paragraphs = [
      {
        text: "これは良いです。",
        index: 0,
        tokens: [
          mockToken("これ", "名詞", 0, "代名詞"),
          mockToken("は", "助詞", 2),
          mockToken("良い", "形容詞", 3, "自立"),
          mockToken("です", "助動詞", 5, "*", "です"),
          mockToken("。", "記号", 7),
        ] as Token[],
      },
      {
        text: "あれも良いです。",
        index: 1,
        tokens: [
          mockToken("あれ", "名詞", 0, "代名詞"),
          mockToken("も", "助詞", 2),
          mockToken("良い", "形容詞", 3, "自立"),
          mockToken("です", "助動詞", 5, "*", "です"),
          mockToken("。", "記号", 7),
        ] as Token[],
      },
      {
        text: "それも良いです。",
        index: 2,
        tokens: [
          mockToken("それ", "名詞", 0, "代名詞"),
          mockToken("も", "助詞", 2),
          mockToken("良い", "形容詞", 3, "自立"),
          mockToken("です", "助動詞", 5, "*", "です"),
          mockToken("。", "記号", 7),
        ] as Token[],
      },
      {
        text: "しかし問題だ。",
        index: 3,
        tokens: [
          mockToken("しかし", "接続詞", 0),
          mockToken("問題", "名詞", 3, "一般"),
          mockToken("だ", "助動詞", 5, "*", "だ"),
          mockToken("。", "記号", 6),
        ] as Token[],
      },
    ];

    const results = rule.lintDocumentWithTokens(paragraphs, config);
    // The plain style sentence (paragraph 3) should be flagged as minority
    const allIssues = results.flatMap((r) => r.issues);
    expect(allIssues.length).toBeGreaterThan(0);
    expect(allIssues[0].ruleId).toBe("desu-masu-consistency");
    expect(allIssues[0].message).toContain("plain");
  });

  // -----------------------------------------------------------------------
  // No detection: consistent style
  // -----------------------------------------------------------------------
  it("should not flag when all sentences use same style", () => {
    const paragraphs = [
      {
        text: "これは良いです。",
        index: 0,
        tokens: [
          mockToken("これ", "名詞", 0, "代名詞"),
          mockToken("は", "助詞", 2),
          mockToken("良い", "形容詞", 3, "自立"),
          mockToken("です", "助動詞", 5, "*", "です"),
          mockToken("。", "記号", 7),
        ] as Token[],
      },
      {
        text: "あれも良いです。",
        index: 1,
        tokens: [
          mockToken("あれ", "名詞", 0, "代名詞"),
          mockToken("も", "助詞", 2),
          mockToken("良い", "形容詞", 3, "自立"),
          mockToken("です", "助動詞", 5, "*", "です"),
          mockToken("。", "記号", 7),
        ] as Token[],
      },
    ];

    const results = rule.lintDocumentWithTokens(paragraphs, config);
    const allIssues = results.flatMap((r) => r.issues);
    expect(allIssues).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // No detection: too few classifiable sentences
  // -----------------------------------------------------------------------
  it("should not flag when only one classifiable sentence", () => {
    const paragraphs = [
      {
        text: "良いです。",
        index: 0,
        tokens: [
          mockToken("良い", "形容詞", 0, "自立"),
          mockToken("です", "助動詞", 2, "*", "です"),
          mockToken("。", "記号", 4),
        ] as Token[],
      },
    ];

    const results = rule.lintDocumentWithTokens(paragraphs, config);
    const allIssues = results.flatMap((r) => r.issues);
    expect(allIssues).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // lint() and lintDocument() should return empty (morphological doc rule)
  // -----------------------------------------------------------------------
  it("should return empty from lint() method", () => {
    expect(rule.lint("これは良いです。", config)).toHaveLength(0);
  });

  it("should return empty from lintDocument() method", () => {
    const results = rule.lintDocument(
      [{ text: "これは良いです。", index: 0 }],
      config,
    );
    expect(results).toHaveLength(0);
  });
});
