/**
 * Regression test for the search-highlight position-drift bug.
 *
 * Symptom: searching "俺" highlighted nearby-but-wrong characters (裸 / 定 / 筆)
 * in documents containing hardbreaks. SearchResults mapped `doc.textContent`
 * offsets back to ProseMirror positions, but Milkdown's hardbreak defines
 * `leafText: () => "\n"`, so it contributes a newline to textContent while
 * occupying a position the text-offset mapping never accounted for. Every match
 * after a hardbreak drifted forward by the number of preceding hardbreaks.
 *
 * The fix replaces that logic with `findSearchMatches`, which walks the document
 * and uses each text node's real ProseMirror position — immune to hardbreaks,
 * ruby atoms, and any other leaf node.
 */

import { describe, it, expect } from "vitest";
import { Schema, Node } from "prosemirror-model";
import { findSearchMatches } from "@/lib/editor-page/find-search-matches";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    heading: {
      group: "block",
      content: "inline*",
      attrs: { level: { default: 1 } },
      toDOM: () => ["h1", 0] as [string, 0],
      parseDOM: [{ tag: "h1" }],
    },
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
      toDOM: (node) => ["ruby", {}, ["rb", {}, node.attrs.base as string]] as unknown as [string],
      parseDOM: [{ tag: "ruby" }],
    },
    // Mirrors Milkdown's hardbreak: leafText makes it leak a "\n" into textContent.
    hardbreak: {
      group: "inline",
      inline: true,
      selectable: false,
      leafText: () => "\n",
      toDOM: () => ["br"],
      parseDOM: [{ tag: "br" }],
    },
  },
  marks: {},
});

// ruby-aware slice for assertions
function sliceAt(doc: Node, m: { from: number; to: number }): string {
  return doc.textBetween(m.from, m.to, "", (n) =>
    n.type.name === "ruby" ? (n.attrs.base as string) : "",
  );
}

describe("findSearchMatches — hardbreak / ruby position correctness", () => {
  it('search "俺" after a hardbreak lands exactly on 俺 (was drifting onto だ)', () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [
        schema.text("退勤後"),
        schema.node("hardbreak"),
        schema.text("彼は俺だ"),
      ]),
    ]);
    expect(doc.textContent).toBe("退勤後\n彼は俺だ");

    const matches = findSearchMatches(doc, "俺", false);
    expect(matches).toHaveLength(1);
    expect(sliceAt(doc, matches[0])).toBe("俺");
  });

  it("multiple hardbreaks before the match do not accumulate drift", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [
        schema.text("A"),
        schema.node("hardbreak"),
        schema.text("B"),
        schema.node("hardbreak"),
        schema.text("C"),
        schema.node("hardbreak"),
        schema.text("D俺E"),
      ]),
    ]);
    const matches = findSearchMatches(doc, "俺", false);
    expect(matches).toHaveLength(1);
    expect(sliceAt(doc, matches[0])).toBe("俺");
  });

  it("ruby atoms in a heading do not shift body matches", () => {
    const doc = schema.node("doc", null, [
      schema.node("heading", { level: 1 }, [
        schema.node("ruby", { base: "花", text: "か" }),
        schema.node("ruby", { base: "様", text: "よう" }),
        schema.node("ruby", { base: "年", text: "ねん" }),
        schema.node("ruby", { base: "華", text: "か" }),
      ]),
      schema.node("paragraph", null, [schema.text("映画のタイトルは『花様年華』だった。")]),
    ]);
    const matches = findSearchMatches(doc, "映画", false);
    expect(matches).toHaveLength(1);
    expect(sliceAt(doc, matches[0])).toBe("映画");
  });

  it("ruby base text is searchable and highlights the whole atom", () => {
    const doc = schema.node("doc", null, [
      schema.node("heading", { level: 1 }, [schema.node("ruby", { base: "華", text: "か" })]),
    ]);
    const matches = findSearchMatches(doc, "華", false);
    expect(matches).toHaveLength(1);
    expect(matches[0].to - matches[0].from).toBe(1); // ruby atom nodeSize
    expect(sliceAt(doc, matches[0])).toBe("華");
  });
});
