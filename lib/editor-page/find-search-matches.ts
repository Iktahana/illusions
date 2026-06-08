import type { Node } from "@milkdown/prose/model";

export interface SearchMatch {
  from: number;
  to: number;
}

/**
 * Find every occurrence of `searchTerm` in a ProseMirror document and return
 * their positions in ProseMirror coordinates.
 *
 * Why this walks the document with `doc.descendants` instead of searching
 * `doc.textContent`:
 *
 *   `doc.textContent` flattens the document to a plain string, but that string
 *   is NOT aligned 1:1 with ProseMirror positions. Nodes that are not text but
 *   define a `leafText` spec (most importantly Milkdown's `hardbreak`, whose
 *   spec is `leafText: () => "\n"`) contribute characters to `textContent`
 *   while occupying a position that a naive text-offset → position mapping
 *   never accounts for. The result is that every match after a hardbreak (or
 *   any other leafText node) drifts forward by the number of such nodes before
 *   it, so the highlight lands on the wrong character.
 *
 * By visiting each text node directly we use its real `pos`, so the returned
 * positions are always correct regardless of hardbreaks, ruby atoms, or other
 * inline leaf nodes.
 *
 * Ruby (`atom: true`) nodes are not recursed into by `descendants`, so their
 * `base` text is matched explicitly and the whole atom is highlighted.
 */
export function findSearchMatches(
  doc: Node,
  searchTerm: string,
  caseSensitive: boolean,
): SearchMatch[] {
  const foundMatches: SearchMatch[] = [];
  if (!searchTerm) return foundMatches;

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
        i += searchStr.length; // advance past matched chars to avoid spurious overlapping matches
      }
      return false; // atom — do not recurse into ruby internals
    }
  });

  return foundMatches;
}
