/**
 * Unit tests for the shared paragraph-processing helpers used by both the
 * POS-highlight and linting decoration plugins.
 *
 * These exercise the textContent-offset → ProseMirror-position mapping in
 * isolation, with special attention to the atom-node boundary case (ruby /
 * mdibreak) that previously bled a token's color/underline onto the following
 * atom node.
 */
import { describe, it, expect } from "vitest";
import { Schema } from "@milkdown/prose/model";
import type { Node as ProseMirrorNode } from "@milkdown/prose/model";
import { getAtomOffset, collectParagraphs, type AtomAdjustment } from "../shared/paragraph-helpers";

/**
 * Minimal schema mirroring the editor's relevant shape: a paragraph of inline
 * content where `ruby` is an inline atom node whose base text is NOT part of
 * `textContent` (matches the real ruby node — it defines no `leafText`).
 */
const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: {
      group: "block",
      content: "inline*",
      toDOM: () => ["p", 0],
    },
    text: { group: "inline" },
    ruby: {
      group: "inline",
      inline: true,
      atom: true,
      attrs: { base: { default: "" }, text: { default: "" } },
      toDOM: (node) => ["ruby", node.attrs.base, ["rt", node.attrs.text]],
    },
  },
});

function para(...children: ProseMirrorNode[]): ProseMirrorNode {
  return schema.nodes.doc.create(null, schema.nodes.paragraph.create(null, children));
}
const t = (s: string) => schema.text(s);
const ruby = (base = "海", text = "うみ") => schema.nodes.ruby.create({ base, text });

/**
 * Recompute a token decoration range exactly as the plugins do, so the tests
 * pin the real mapping arithmetic rather than a paraphrase of it.
 */
function tokenRange(
  paragraph: { pos: number; atomAdjustments: AtomAdjustment[] },
  start: number,
  end: number,
): { from: number; to: number } {
  const from = paragraph.pos + 1 + start + getAtomOffset(paragraph.atomAdjustments, start);
  const to = paragraph.pos + 1 + end + getAtomOffset(paragraph.atomAdjustments, end, true);
  return { from, to };
}

describe("getAtomOffset", () => {
  const adjustments: AtomAdjustment[] = [{ textPos: 3, cumulativeOffset: 1 }];

  it("returns 0 before any atom", () => {
    expect(getAtomOffset(adjustments, 0)).toBe(0);
    expect(getAtomOffset(adjustments, 2)).toBe(0);
  });

  it("treats a position AT an atom boundary as after the atom (inclusive start)", () => {
    // A token that STARTS where an atom sits must be pushed past the atom.
    expect(getAtomOffset(adjustments, 3)).toBe(1);
    expect(getAtomOffset(adjustments, 4)).toBe(1);
  });

  it("treats an exclusive END at an atom boundary as before the atom", () => {
    // A token that ENDS just before an atom must NOT swallow it.
    expect(getAtomOffset(adjustments, 3, true)).toBe(0);
    // Past the atom, the exclusive end still accumulates it.
    expect(getAtomOffset(adjustments, 4, true)).toBe(1);
  });

  it("accumulates multiple atoms monotonically", () => {
    const multi: AtomAdjustment[] = [
      { textPos: 2, cumulativeOffset: 1 },
      { textPos: 5, cumulativeOffset: 2 },
    ];
    expect(getAtomOffset(multi, 1)).toBe(0);
    expect(getAtomOffset(multi, 2)).toBe(1);
    expect(getAtomOffset(multi, 5)).toBe(2);
    expect(getAtomOffset(multi, 5, true)).toBe(1);
  });
});

describe("collectParagraphs", () => {
  it("records textContent without atom base text", () => {
    const doc = para(t("太平洋の"), ruby(), t("だ"));
    const [p] = collectParagraphs(doc);
    expect(p.text).toBe("太平洋のだ"); // ruby base excluded
    expect(p.atomAdjustments).toEqual([{ textPos: 4, cumulativeOffset: 1 }]);
  });

  it("skips empty paragraphs", () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, []),
      schema.nodes.paragraph.create(null, [t("本文")]),
    ]);
    const ps = collectParagraphs(doc);
    expect(ps).toHaveLength(1);
    expect(ps[0].text).toBe("本文");
  });
});

describe("token → ProseMirror range mapping (atom boundaries)", () => {
  it("does NOT extend a token's range onto a trailing atom node", () => {
    // children: text "ABC", ruby (atom), text "DEF"  → textContent "ABCDEF"
    const doc = para(t("ABC"), ruby(), t("DEF"));
    const [p] = collectParagraphs(doc);

    // PM positions: A=1 B=2 C=3, ruby atom occupies [4,5), D=5 E=6 F=7.
    // Token "ABC" (textContent [0,3)) must map to [1,4) — NOT [1,5).
    expect(tokenRange(p, 0, 3)).toEqual({ from: 1, to: 4 });
    // Token "DEF" (textContent [3,6)) starts after the atom → [5,8).
    expect(tokenRange(p, 3, 6)).toEqual({ from: 5, to: 8 });
  });

  it("handles a token sandwiched between two atoms", () => {
    // children: ruby, text "XY", ruby → textContent "XY"
    const doc = para(ruby(), t("XY"), ruby());
    const [p] = collectParagraphs(doc);
    // PM: ruby0 [1,2), X=2 Y=3, ruby1 [4,5). Token "XY" → [2,4).
    expect(tokenRange(p, 0, 2)).toEqual({ from: 2, to: 4 });
  });

  it("maps a plain paragraph (no atoms) identically", () => {
    const doc = para(t("太平洋のただ中"));
    const [p] = collectParagraphs(doc);
    expect(tokenRange(p, 0, 3)).toEqual({ from: 1, to: 4 }); // 太平洋
    expect(tokenRange(p, 4, 7)).toEqual({ from: 5, to: 8 }); // ただ中
  });
});
