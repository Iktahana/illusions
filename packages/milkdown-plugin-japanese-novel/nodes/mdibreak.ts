/**
 * MDI explicit line break (改行) node: `[[br]]` → `<br class="mdi-break">`.
 *
 * Unlike CommonMark's `hardbreak` (Shift+Enter or trailing two spaces), this
 * node represents an MDI-native explicit line break. It round-trips as
 * `[[br]]` in `.mdi` files, independent of CommonMark's soft/hard break rules.
 */

import { $nodeSchema } from "@milkdown/utils";

export const mdibreakSchema = $nodeSchema("mdibreak", () => ({
  group: "inline",
  inline: true,
  atom: true,
  selectable: false,
  parseDOM: [{ tag: "br.mdi-break" }],
  toDOM: () => ["br", { class: "mdi-break" }],
  parseMarkdown: {
    match: (node) => (node as { type?: string }).type === "mdibreak",
    runner: (state, _node, type) => {
      state.addNode(type);
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === "mdibreak",
    runner: (state) => {
      state.addNode("text", undefined, "[[br]]");
    },
  },
}));
