import { describe, expect, it } from "vitest";
import { Schema, type Node } from "prosemirror-model";

import {
  buildReplacementText,
  createReplacementSteps,
  findSearchMatches,
  getSearchPatternError,
} from "@/lib/editor-page/find-search-matches";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    heading: {
      group: "block",
      content: "inline*",
      attrs: { level: { default: 1 } },
      toDOM: () => ["h1", 0] as [string, number],
    },
    paragraph: {
      group: "block",
      content: "inline*",
      toDOM: () => ["p", 0] as [string, number],
    },
    blankParagraph: {
      group: "block",
      atom: true,
      toDOM: () => ["p"],
    },
    text: { group: "inline" },
    hardbreak: {
      group: "inline",
      inline: true,
      selectable: false,
      leafText: () => "\n",
      toDOM: () => ["br"],
    },
    ruby: atomNode({ base: { default: "" }, text: { default: "" } }, "ruby"),
    tcy: atomNode({ value: { default: "" } }, "span"),
    nobreak: atomNode({ text: { default: "" } }, "span"),
    kern: atomNode({ amount: { default: "" }, text: { default: "" } }, "span"),
    mdibreak: atomNode({}, "br"),
  },
  marks: {},
});

function atomNode(attrs: Record<string, { default: string }>, tag: string) {
  return {
    group: "inline",
    inline: true,
    atom: true,
    attrs,
    toDOM: () => [tag] as [string],
  };
}

function paragraph(...children: Node[]): Node {
  return schema.node("paragraph", null, children);
}

function doc(...children: Node[]): Node {
  return schema.node("doc", null, children);
}

describe("findSearchMatches enhanced search", () => {
  it("supports regular expressions, captures, and case sensitivity", () => {
    const source = doc(paragraph(schema.text("Alpha-12 alpha-34")));

    const matches = findSearchMatches(source, "(alpha)-(\\d+)", {
      regex: true,
      caseSensitive: false,
    });

    expect(matches.map((match) => match.text)).toEqual(["Alpha-12", "alpha-34"]);
    expect(matches.map((match) => match.captures)).toEqual([
      ["Alpha", "12"],
      ["alpha", "34"],
    ]);
  });

  it("keeps JavaScript greedy regular expression semantics", () => {
    const source = doc(paragraph(schema.text("a1b a2b")));

    expect(findSearchMatches(source, "a.*b", { regex: true })).toMatchObject([
      { text: "a1b a2b" },
    ]);
  });

  it("reports invalid patterns and ignores zero-width matches", () => {
    const source = doc(paragraph(schema.text("abc")));

    expect(getSearchPatternError("(", { regex: true })).toBe("正規表現が正しくありません");
    expect(findSearchMatches(source, "(?=a)", { regex: true })).toEqual([]);
  });

  it("matches whole Unicode words without matching inside longer words", () => {
    const source = doc(paragraph(schema.text("cat scatter cat2 cat 猫 猫舌")));

    expect(findSearchMatches(source, "cat", { wholeWord: true })).toHaveLength(2);
    expect(findSearchMatches(source, "猫", { wholeWord: true })).toHaveLength(1);
  });

  it("normalizes kana, width, and old character forms while preserving source positions", () => {
    const source = doc(paragraph(schema.text("カタカナ ｶﾞ ＡＢＣ 舊體 ㍻")));

    const kana = findSearchMatches(source, "かたかな", { normalizeVariants: true });
    const width = findSearchMatches(source, "ABC", { normalizeVariants: true });
    const halfWidthKana = findSearchMatches(source, "が", { normalizeVariants: true });
    const oldForm = findSearchMatches(source, "旧体", { normalizeVariants: true });
    const expanded = findSearchMatches(source, "平成", { normalizeVariants: true });

    expect(kana[0].text).toBe("カタカナ");
    expect(width[0].text).toBe("ＡＢＣ");
    expect(halfWidthKana[0].text).toBe("ｶﾞ");
    expect(oldForm[0].text).toBe("舊體");
    expect(expanded[0].text).toBe("㍻");
    expect(expanded[0].to - expanded[0].from).toBe(1);
  });

  it("searches ruby base and reading without making either directly replaceable", () => {
    const source = doc(
      paragraph(
        schema.text("前"),
        schema.node("ruby", { base: "東京", text: "とう.きょう" }),
        schema.text("後"),
      ),
    );

    const base = findSearchMatches(source, "東京", { searchTarget: "all" });
    const reading = findSearchMatches(source, "とうきょう", { searchTarget: "ruby" });

    expect(base).toMatchObject([{ source: "ruby-base", replaceable: false }]);
    expect(reading).toMatchObject([{ source: "ruby-text", replaceable: false }]);
    expect(findSearchMatches(source, "東京", { searchTarget: "ruby" })).toEqual([]);
    expect(findSearchMatches(source, "とうきょう", { searchTarget: "body" })).toEqual([]);
  });

  it("searches displayed MDI atom text but never macro metadata", () => {
    const source = doc(
      paragraph(
        schema.node("kern", { amount: "0.5em", text: "本文" }),
        schema.node("nobreak", { text: "禁則" }),
        schema.node("tcy", { value: "12" }),
      ),
      schema.node("blankParagraph"),
    );

    expect(findSearchMatches(source, "本文", {})).toMatchObject([
      { source: "kern", replaceable: false },
    ]);
    expect(findSearchMatches(source, "禁則", {})).toHaveLength(1);
    expect(findSearchMatches(source, "12", {})).toHaveLength(1);
    expect(findSearchMatches(source, "0.5em", {})).toEqual([]);
    expect(findSearchMatches(source, "blank", {})).toEqual([]);
  });

  it("finds text spanning an atom with exact ProseMirror bounds and blocks replacement", () => {
    const source = doc(
      paragraph(
        schema.text("前"),
        schema.node("ruby", { base: "東京", text: "とうきょう" }),
        schema.text("後"),
      ),
    );

    const matches = findSearchMatches(source, "前東京後", {});

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ text: "前東京後", replaceable: false });
    expect(matches[0].to - matches[0].from).toBe(3);
  });

  it("limits matches to a selected ProseMirror range", () => {
    const source = doc(paragraph(schema.text("one two one")));

    expect(findSearchMatches(source, "one", { range: { from: 5, to: 12 } })).toMatchObject([
      { from: 9, to: 12 },
    ]);
  });

  it("handles empty, single-character, and whole-document searches", () => {
    const source = doc(paragraph(schema.text("abc")));

    expect(findSearchMatches(source, "", {})).toEqual([]);
    expect(findSearchMatches(source, "a", {})).toMatchObject([{ text: "a" }]);
    expect(findSearchMatches(source, "abc", {})).toMatchObject([{ text: "abc" }]);
    expect(findSearchMatches(source, "missing", {})).toEqual([]);
  });

  it("adds heading and paragraph metadata for grouped results", () => {
    const source = doc(
      schema.node("heading", { level: 1 }, schema.text("第一章")),
      paragraph(schema.text("対象")),
      paragraph(schema.text("対象")),
    );

    expect(findSearchMatches(source, "対象", {})).toMatchObject([
      { heading: "第一章", paragraphNumber: 1 },
      { heading: "第一章", paragraphNumber: 2 },
    ]);
  });
});

describe("search replacement helpers", () => {
  it("expands capture references, the full match, and escaped dollars", () => {
    const match = {
      from: 3,
      to: 11,
      text: "Alpha-12",
      captures: ["Alpha", "12"],
    };

    expect(buildReplacementText(match, "$2:$1:$&:$$", { regex: true })).toBe("12:Alpha:Alpha-12:$");
  });

  it("creates only safe replacement steps in descending position order", () => {
    const steps = createReplacementSteps(
      [
        { from: 1, to: 4, text: "one", replaceable: true },
        { from: 5, to: 6, text: "東京", replaceable: false, source: "ruby-base" },
        { from: 7, to: 10, text: "two", replaceable: true },
      ],
      "replacement",
      {},
    );

    expect(steps).toEqual([
      { from: 7, to: 10, text: "replacement" },
      { from: 1, to: 4, text: "replacement" },
    ]);
  });

  it("creates replacement steps only for matches inside the selected range", () => {
    const source = doc(paragraph(schema.text("one two one")));
    const matches = findSearchMatches(source, "one", { range: { from: 5, to: 12 } });

    expect(createReplacementSteps(matches, "three", {})).toEqual([
      { from: 9, to: 12, text: "three" },
    ]);
  });
});
