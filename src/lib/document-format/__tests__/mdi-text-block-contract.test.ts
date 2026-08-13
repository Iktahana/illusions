import { beforeAll, describe, expect, it } from "vitest";
import { getMdiTextBlocks, initializeMdi } from "@illusions-lab/mdi";

describe("Rust-owned MDI text block positions", () => {
  beforeAll(async () => {
    await initializeMdi();
  });

  it("assigns one source-order block index to every supported block kind", () => {
    const source = [
      "# Heading",
      "",
      "Paragraph.",
      "",
      "- first",
      "- second",
      "",
      "> quote",
      "",
      "| a | b |",
      "|---|---|",
      "| c | d |",
    ].join("\n");

    const result = getMdiTextBlocks(source);

    expect(result.projectionVersion).toBe("1.0");
    expect(result.positionEncoding).toBe("unicode-grapheme-cluster-1-based");
    expect(result.blocks.map(({ index, kind, range }) => ({ index, kind, range }))).toEqual([
      { index: 1, kind: "heading", range: { start: "1:1", end: "1:8" } },
      { index: 2, kind: "paragraph", range: { start: "2:1", end: "2:11" } },
      { index: 3, kind: "listItem", range: { start: "3:1", end: "3:6" } },
      { index: 4, kind: "listItem", range: { start: "4:1", end: "4:7" } },
      { index: 5, kind: "blockquote", range: { start: "5:1", end: "5:6" } },
      { index: 6, kind: "table", range: { start: "6:1", end: "6:8" } },
    ]);
  });

  it("uses grapheme coordinates from Rust instead of UTF-16 offsets", () => {
    const result = getMdiTextBlocks("# 👨‍👩‍👧‍👦家族\n\ne\u0301とé");

    expect(
      result.blocks.map(({ index, kind, text, range }) => ({ index, kind, text, range })),
    ).toEqual([
      {
        index: 1,
        kind: "heading",
        text: "👨‍👩‍👧‍👦家族",
        range: { start: "1:1", end: "1:4" },
      },
      {
        index: 2,
        kind: "paragraph",
        text: "e\u0301とé",
        range: { start: "2:1", end: "2:4" },
      },
    ]);
  });
});
