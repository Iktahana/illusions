/**
 * Editable YAML front matter block for `.mdi` documents.
 *
 * `remark-frontmatter` owns the Markdown boundary (`---` at byte zero) and
 * produces an mdast `yaml` node. This schema keeps that node inside
 * ProseMirror instead of letting CommonMark reinterpret the delimiters as a
 * thematic break / Setext heading. The serializer writes the same `yaml` node
 * back through remark-frontmatter, preserving a valid MDI document boundary.
 */

import { $nodeSchema } from "@milkdown/utils";

export const frontmatterSchema = $nodeSchema("yaml", () => ({
  content: "text*",
  marks: "",
  group: "block",
  code: true,
  defining: true,
  parseDOM: [{ tag: "pre.mdi-frontmatter" }],
  toDOM: () => [
    "pre",
    {
      class: "mdi-frontmatter",
      "data-mdi-frontmatter": "true",
      spellcheck: "false",
    },
    ["code", 0],
  ],
  parseMarkdown: {
    match: (node) => (node as { type?: string }).type === "yaml",
    runner: (state, node, type) => {
      state.openNode(type);
      state.addText((node as { value?: string }).value ?? "");
      state.closeNode();
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === "yaml",
    runner: (state, node) => {
      state.addNode("yaml", undefined, node.textContent);
    },
  },
}));
