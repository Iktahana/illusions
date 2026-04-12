import { describe, it, expect } from "vitest";

import { mdiToPlainText, mdiToRubyText } from "../txt-exporter";

// ---------------------------------------------------------------------------
// Markdown stripping (tested via mdiToPlainText)
// ---------------------------------------------------------------------------

describe("markdown stripping", () => {
  it("should strip heading markers", () => {
    expect(mdiToPlainText("# Title")).toBe("Title");
    expect(mdiToPlainText("## Subtitle")).toBe("Subtitle");
  });

  it("should strip bold and italic markers", () => {
    expect(mdiToPlainText("**bold** and *italic*")).toBe("bold and italic");
    expect(mdiToPlainText("***both***")).toBe("both");
  });

  it("should convert horizontal rules to blank line separators", () => {
    const result = mdiToPlainText("before\n\n---\n\nafter");
    expect(result).not.toContain("---");
    expect(result).toBe("before\n\nafter");
  });
});

// ---------------------------------------------------------------------------
// Blank line collapsing (tested via mdiToPlainText)
// ---------------------------------------------------------------------------

describe("blank line collapsing", () => {
  it("should remove blank lines between paragraphs", () => {
    const input = "first paragraph\n\nsecond paragraph";
    expect(mdiToPlainText(input)).toBe("first paragraph\nsecond paragraph");
  });

  it("should collapse multiple consecutive blank lines (preserving author-intentional)", () => {
    const input = "first\n\n\n\nsecond";
    // 3 blank lines: 1 structural (removed) + 2 author-intentional (kept)
    expect(mdiToPlainText(input)).toBe("first\n\n\nsecond");
  });

  it("should preserve scene break as a single blank line", () => {
    const input = "before\n\n---\n\nafter";
    expect(mdiToPlainText(input)).toBe("before\n\nafter");
  });

  it("should preserve dialogue lines unchanged", () => {
    const input = "narration\n\n\u300Cdialogue\u300D\n\nnext";
    expect(mdiToPlainText(input)).toBe("narration\n\u300Cdialogue\u300D\nnext");
  });

  it("should handle content with no blank lines", () => {
    const input = "line one\nline two\nline three";
    expect(mdiToPlainText(input)).toBe("line one\nline two\nline three");
  });

  it("should handle empty input", () => {
    expect(mdiToPlainText("")).toBe("");
  });

  it("should handle multiple scene breaks", () => {
    const input = "part one\n\n---\n\npart two\n\n***\n\npart three";
    expect(mdiToPlainText(input)).toBe("part one\n\npart two\n\npart three");
  });

  it("should preserve author-intentional blank lines (2 consecutive)", () => {
    // 2 blank lines: 1 structural (removed) + 1 author-intentional (kept)
    const input = "para1\n\n\npara2";
    expect(mdiToPlainText(input)).toBe("para1\n\npara2");
  });

  it("should preserve multiple author-intentional blank lines", () => {
    // 4 blank lines: 1 structural (removed) + 3 author-intentional (kept)
    const input = "para1\n\n\n\n\npara2";
    expect(mdiToPlainText(input)).toBe("para1\n\n\n\npara2");
  });

  it("should apply N-1 rule to blank lines around scene breaks from hand-edited files", () => {
    // Extra blank lines around scene break are treated as author-intentional
    const input = "before\n\n\n---\n\n\nafter";
    expect(mdiToPlainText(input)).toBe("before\n\n\n\nafter");
  });

  it("should handle heading followed by paragraph without extra blank lines", () => {
    const input = "# Chapter\n\nFirst paragraph.\n\nSecond paragraph.";
    expect(mdiToPlainText(input)).toBe("Chapter\nFirst paragraph.\nSecond paragraph.");
  });

  it("should handle consecutive scene breaks", () => {
    const input = "before\n\n---\n\n---\n\nafter";
    expect(mdiToPlainText(input)).toBe("before\n\n\nafter");
  });

  it("should handle scene break at start and end of content (boundary trim)", () => {
    // Boundary blank lines are trimmed — no content to separate at edges
    const input = "---\n\nonly paragraph\n\n---";
    expect(mdiToPlainText(input)).toBe("only paragraph");
  });
});

// ---------------------------------------------------------------------------
// End-to-end: mdiToPlainText
// ---------------------------------------------------------------------------

describe("mdiToPlainText", () => {
  it("should strip MDI syntax and collapse blank lines", () => {
    const input = [
      "# Chapter One",
      "",
      "{漢字|かんじ}のテスト。",
      "",
      "「{台詞|せりふ}だ」",
      "",
      "---",
      "",
      "Next section.",
    ].join("\n");

    const expected = ["Chapter One", "漢字のテスト。", "「台詞だ」", "", "Next section."].join(
      "\n",
    );

    expect(mdiToPlainText(input)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// End-to-end: mdiToRubyText
// ---------------------------------------------------------------------------

describe("mdiToRubyText", () => {
  it("should render ruby in parentheses and collapse blank lines", () => {
    const input = ["{漢字|かんじ}のテスト。", "", "「{台詞|せりふ}だ」"].join("\n");

    const expected = ["漢字（かんじ）のテスト。", "「台詞（せりふ）だ」"].join("\n");

    expect(mdiToRubyText(input)).toBe(expected);
  });

  it("should preserve author-intentional blank lines in ruby mode", () => {
    // 2 blank lines: 1 structural (removed) + 1 author-intentional (kept)
    const input = "{漢字|かんじ}\n\n\n{台詞|せりふ}";
    expect(mdiToRubyText(input)).toBe("漢字（かんじ）\n\n台詞（せりふ）");
  });
});
