/**
 * MDI blank paragraph (強制空段落) block node: `[[blank]]` (standalone paragraph).
 *
 * CommonMark collapses successive blank lines into a single paragraph separator,
 * so to keep an intentional empty paragraph (often used in Japanese typography
 * for scene beats), authors write `[[blank]]` as the paragraph contents. This
 * schema pairs with `remarkMdiBlankPlugin` (which rewrites the mdast paragraph
 * to `type: "blankParagraph"`) and renders an empty `<p>` in the editor while
 * round-tripping back to `[[blank]]` on save.
 */

import { $nodeSchema } from "@milkdown/utils";

export const blankParagraphSchema = $nodeSchema("blankParagraph", () => ({
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,
  parseDOM: [{ tag: "p.mdi-blank" }],
  toDOM: () => ["p", { class: "mdi-blank" }],
  parseMarkdown: {
    match: (node) => (node as { type?: string }).type === "blankParagraph",
    runner: (state, _node, type) => {
      state.addNode(type);
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === "blankParagraph",
    runner: (state) => {
      state.openNode("paragraph");
      state.addNode("text", undefined, "[[blank]]");
      state.closeNode();
    },
  },
}));
