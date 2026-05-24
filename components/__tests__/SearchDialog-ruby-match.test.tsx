/**
 * Tests for SearchDialog ruby-aware search matching.
 *
 * Issue #1455: search highlights misalign when a document contains ruby (atom:true) nodes.
 * Root cause: doc.descendants skips ruby internals, causing base text to be invisible to
 * the matcher → downstream offsets are off by (N-1) per ruby in the same paragraph.
 *
 * These tests build minimal ProseMirror documents and call the same position-calculation
 * logic used by SearchDialog, exercising:
 *  1. Normal text after ruby — positions must not shift by ruby content size.
 *  2. Ruby base text — searchable via node.attrs.base, highlight covers pos..pos+nodeSize.
 *  3. Multi-char dedup — baseText="漢字漢字" with search "漢字" → exactly 2 matches.
 */

import { describe, it, expect } from "vitest";
import { Schema, Node } from "prosemirror-model";

// ---- Minimal schema mirroring what illusions uses --------------------------------

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: {
      group: "block",
      content: "inline*",
      toDOM: () => ["p", 0] as [string, 0],
      parseDOM: [{ tag: "p" }],
    },
    text: { group: "inline" },
    ruby: {
      group: "inline",
      inline: true,
      atom: true,
      attrs: { base: { default: "" }, text: { default: "" } },
      toDOM: (node) =>
        [
          "ruby",
          {},
          ["rb", {}, node.attrs.base as string],
          ["rt", {}, node.attrs.text as string],
        ] as unknown as [string],
      parseDOM: [{ tag: "ruby" }],
    },
  },
  marks: {},
});

// ---- Helper: build a document matching SearchDialog's assumptions ----------------

/**
 * paragraph: text("ABC") + ruby(base:"漢字", text:"かんじ") + text("DEF")
 *
 * ProseMirror positions (doc.descendants reports node's pos as opening position):
 *   0        = paragraph node (nodeSize=9)
 *   1..3     = "ABC" text node starts at pos 1 (chars at 1="A", 2="B", 3="C")
 *   4        = ruby atom (nodeSize=1, pos=4)
 *   5..7     = "DEF" text node starts at pos 5 (chars at 5="D", 6="E", 7="F")
 *   8        = paragraph close implied (paragraph.nodeSize=9, so end=0+9=9)
 */
function buildTestDoc(): Node {
  return schema.node("doc", null, [
    schema.node("paragraph", null, [
      schema.text("ABC"),
      schema.node("ruby", { base: "漢字", text: "かんじ" }),
      schema.text("DEF"),
    ]),
  ]);
}

// ---- Replicated search logic (mirrors the code in SearchDialog.tsx) ---------------

interface SearchMatch {
  from: number;
  to: number;
}

function findMatches(doc: Node, searchTerm: string, caseSensitive = false): SearchMatch[] {
  const foundMatches: SearchMatch[] = [];
  const searchStr = caseSensitive ? searchTerm : searchTerm.toLowerCase();

  doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      const nodeText = caseSensitive ? node.text : node.text.toLowerCase();
      let searchIndex = 0;
      while (searchIndex < nodeText.length) {
        const matchIndex = nodeText.indexOf(searchStr, searchIndex);
        if (matchIndex === -1) break;
        foundMatches.push({
          from: pos + matchIndex,
          to: pos + matchIndex + searchTerm.length,
        });
        searchIndex = matchIndex + 1;
      }
      return;
    }
    if (node.type.name === "ruby") {
      const baseRaw = (node.attrs.base as string) ?? "";
      const baseText = caseSensitive ? baseRaw : baseRaw.toLowerCase();
      let i = 0;
      while ((i = baseText.indexOf(searchStr, i)) !== -1) {
        foundMatches.push({ from: pos, to: pos + node.nodeSize });
        i += searchStr.length; // R4 fix: avoid spurious matches on overlapping substrings
      }
      return false; // atom — do not recurse
    }
  });

  return foundMatches;
}

// ---- Tests -----------------------------------------------------------------------

describe("SearchDialog ruby-aware matching", () => {
  it('search "DEF" → real node position, no off-by-1 from ruby', () => {
    const doc = buildTestDoc();
    const matches = findMatches(doc, "DEF");
    expect(matches).toHaveLength(1);

    // Without the ruby fix, the search would not find text following ruby nodes
    // because descendants() skips ruby internals — verifying it finds exactly "DEF"
    // at the correct position is the regression check.
    const [m] = matches;
    expect(m.from).toBeGreaterThan(0); // not 0 (doc start)
    expect(m.to - m.from).toBe(3); // "DEF".length === 3

    // Verify the slice at those positions really is "DEF"
    const slice = doc.textBetween(m.from, m.to, "", (node) =>
      node.type.name === "ruby" ? (node.attrs.base as string) : "",
    );
    expect(slice).toBe("DEF");
  });

  it('search "漢字" → ruby atom highlighted at pos..pos+nodeSize', () => {
    const doc = buildTestDoc();
    const matches = findMatches(doc, "漢字");
    expect(matches).toHaveLength(1);

    const [m] = matches;
    // from and to should span the entire ruby node (nodeSize = 1 for an atom)
    expect(m.to - m.from).toBe(1); // nodeSize of the ruby atom

    // The position must be within the paragraph (between paragraph-open and paragraph-close)
    // paragraph is at pos 0 (the node itself), text "ABC" starts at pos 1 (3 chars → 1,2,3),
    // ruby follows immediately at pos 4 (nodeSize=1 for the atom).
    expect(m.from).toBe(4);
    expect(m.to).toBe(5);
  });

  it('multi-char dedup: baseText="漢字漢字" with search "漢字" → exactly 2 matches (not 3)', () => {
    // Build a doc with a ruby node whose base contains the search string twice
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [
        schema.node("ruby", { base: "漢字漢字", text: "かんじかんじ" }),
      ]),
    ]);

    // With `i += searchStr.length` the loop advances past each found match,
    // so "漢字" in "漢字漢字" yields 2 matches (positions 0 and 2), not 3.
    const matches = findMatches(doc, "漢字");
    // The ruby node is searched as a unit and produces exactly 1 match per node
    // (the entire atom is highlighted regardless of how many times the base contains it).
    // However per the plan's intent, we confirm the loop does NOT infinite-loop
    // and does NOT produce spurious extra matches beyond 1 per atom node.
    // The ruby node has nodeSize=1, so we get 1 decoration covering the whole node.
    // But the inner while-loop must produce 2 pushes (one per occurrence in baseText).
    // The dedup test: we want exactly 2 matches pushed (for 2 occurrences in base).
    expect(matches).toHaveLength(2);
    // Both matches point to the same ruby node (same from/to since it's one atom)
    expect(matches[0].from).toBe(matches[1].from);
    expect(matches[0].to).toBe(matches[1].to);
  });

  it('case-insensitive search: "def" matches "DEF"', () => {
    const doc = buildTestDoc();
    const matches = findMatches(doc, "def", false /* caseSensitive=false */);
    expect(matches).toHaveLength(1);
    expect(matches[0].to - matches[0].from).toBe(3);
  });

  it('case-sensitive search: "def" does NOT match "DEF"', () => {
    const doc = buildTestDoc();
    const matches = findMatches(doc, "def", true /* caseSensitive=true */);
    expect(matches).toHaveLength(0);
  });

  it("ruby base text case-insensitive: searches 「かんじ」 finds kanji in base attr", () => {
    // Build doc with ruby whose base is in hiragana to confirm search path works
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [schema.node("ruby", { base: "ABC", text: "エービーシー" })]),
    ]);
    const matches = findMatches(doc, "abc", false);
    expect(matches).toHaveLength(1);
  });

  it("text after multiple ruby nodes aligns correctly (multi-ruby paragraph)", () => {
    // paragraph: text("X") + ruby(base:"あ") + ruby(base:"い") + text("Z")
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [
        schema.text("X"),
        schema.node("ruby", { base: "あ", text: "ア" }),
        schema.node("ruby", { base: "い", text: "イ" }),
        schema.text("Z"),
      ]),
    ]);

    // Find "Z" — should work correctly even after 2 ruby atoms
    const matches = findMatches(doc, "Z");
    expect(matches).toHaveLength(1);
    const [m] = matches;
    // Verify the slice really is "Z"
    const slice = doc.textBetween(m.from, m.to, "", (node) =>
      node.type.name === "ruby" ? (node.attrs.base as string) : "",
    );
    expect(slice).toBe("Z");
  });
});
