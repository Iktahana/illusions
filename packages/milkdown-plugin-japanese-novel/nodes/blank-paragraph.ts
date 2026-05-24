/**
 * MDI blank paragraph (強制空段落) block node: `[[blank]]` (standalone paragraph).
 *
 * CommonMark collapses successive blank lines into a single paragraph separator,
 * so authors write `[[blank]]` to keep an intentional empty paragraph (common in
 * Japanese typography for scene beats). This node behaves exactly like a regular
 * paragraph in the editor — the user can click in and start typing, which
 * naturally turns it into prose — but its `toMarkdown` runner emits `[[blank]]`
 * when the content is still empty, preserving the marker across save/load.
 *
 * Pairs with `remarkMdiBlankPlugin` (which rewrites `[[blank]]`-only paragraphs
 * to mdast type `blankParagraph` on load).
 */

import { $nodeSchema } from "@milkdown/utils";

export const blankParagraphSchema = $nodeSchema("blankParagraph", () => ({
  content: "inline*",
  group: "block",
  parseDOM: [{ tag: "p.mdi-blank" }],
  toDOM: () => ["p", { class: "mdi-blank" }, 0],
  parseMarkdown: {
    match: (node) => (node as { type?: string }).type === "blankParagraph",
    runner: (state, _node, type) => {
      state.openNode(type);
      state.closeNode();
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === "blankParagraph",
    runner: (state, node) => {
      state.openNode("paragraph");
      if (node.content.size === 0) {
        state.addNode("text", undefined, "[[blank]]");
      } else {
        state.next(node.content);
      }
      state.closeNode();
    },
  },
}));
