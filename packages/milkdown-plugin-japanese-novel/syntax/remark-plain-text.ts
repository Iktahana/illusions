import type { Paragraph, Root, Text } from "mdast";
import type { VFile } from "vfile";

/**
 * Remark plugin for plain-text (.txt) mode.
 *
 * Bypasses CommonMark parsing entirely by reading the raw source string
 * from the VFile and splitting it into lines. Each line becomes a single
 * paragraph node, so special characters such as `#`, `*`, `>`, `-` are
 * never interpreted as markdown syntax.
 *
 * This plugin must be added AFTER remark-parse (which is the default when
 * using Milkdown's $remark utility) so that it can replace the already-
 * parsed tree with the line-based structure.
 */
export function remarkPlainTextPlugin() {
  return function transformer(tree: Root, file: VFile): void {
    // Normalize line endings before splitting
    const source = String(file.value).replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    const lines = source.split("\n");

    // Replace the entire parsed mdast with one paragraph per line.
    // An empty line produces an empty paragraph (no children), which
    // ProseMirror renders as a blank line and textContent returns "".
    tree.children = lines.map(
      (line): Paragraph => ({
        type: "paragraph",
        children: line.length > 0 ? [{ type: "text", value: line } as Text] : [],
      }),
    );
  };
}
