import { describe, it, expect } from "vitest";

import {
  mdiToPlainText,
  mdiToRubyText,
  stripMarkdown,
} from "../txt-exporter";

// ---------------------------------------------------------------------------
// stripMarkdown
// ---------------------------------------------------------------------------

describe("stripMarkdown", () => {
  it("should strip heading markers", () => {
    expect(stripMarkdown("# Title")).toBe("Title");
    expect(stripMarkdown("## Subtitle")).toBe("Subtitle");
  });

  it("should strip bold and italic markers", () => {
    expect(stripMarkdown("**bold** and *italic*")).toBe("bold and italic");
    expect(stripMarkdown("***both***")).toBe("both");
  });

  it("should convert horizontal rules to scene break markers", () => {
    const result = stripMarkdown("before\n\n---\n\nafter");
    // Scene break marker is internal; verify it does not appear as literal "---"
    expect(result).not.toContain("---");
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

  it("should collapse multiple consecutive blank lines", () => {
    const input = "first\n\n\n\nsecond";
    expect(mdiToPlainText(input)).toBe("first\nsecond");
  });

  it("should preserve scene break as a single blank line", () => {
    const input = "before\n\n---\n\nafter";
    expect(mdiToPlainText(input)).toBe("before\n\nafter");
  });

  it("should preserve dialogue lines unchanged", () => {
    const input = "narration\n\n「dialogue」\n\nnext";
    expect(mdiToPlainText(input)).toBe("narration\n「dialogue」\nnext");
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

  it("should handle heading followed by paragraph without extra blank lines", () => {
    const input = "# Chapter\n\nFirst paragraph.\n\nSecond paragraph.";
    expect(mdiToPlainText(input)).toBe("Chapter\nFirst paragraph.\nSecond paragraph.");
  });

  it("should handle consecutive scene breaks", () => {
    const input = "before\n\n---\n\n---\n\nafter";
    expect(mdiToPlainText(input)).toBe("before\n\n\nafter");
  });

  it("should handle scene break at start and end of content", () => {
    const input = "---\n\nonly paragraph\n\n---";
    expect(mdiToPlainText(input)).toBe("\nonly paragraph\n");
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

    const expected = [
      "Chapter One",
      "漢字のテスト。",
      "「台詞だ」",
      "",
      "Next section.",
    ].join("\n");

    expect(mdiToPlainText(input)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// End-to-end: mdiToRubyText
// ---------------------------------------------------------------------------

describe("mdiToRubyText", () => {
  it("should render ruby in parentheses and collapse blank lines", () => {
    const input = [
      "{漢字|かんじ}のテスト。",
      "",
      "「{台詞|せりふ}だ」",
    ].join("\n");

    const expected = [
      "漢字（かんじ）のテスト。",
      "「台詞（せりふ）だ」",
    ].join("\n");

    expect(mdiToRubyText(input)).toBe(expected);
  });
});
