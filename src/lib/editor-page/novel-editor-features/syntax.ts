/** Application-owned Japanese full-width Markdown compatibility helpers. */

import type { Paragraph, Root, Text } from "mdast";
import type { Plugin } from "unified";
import { visit } from "unist-util-visit";

export const remarkHeadingAnchorPlugin: Plugin<[], Root> = () => () => {
  // Heading IDs are derived from document content by the application.
};

type FullWidthMarkdownMarker =
  | { kind: "heading"; depth: number; text: string }
  | { kind: "blockquote"; text: string }
  | { kind: "bulletList"; text: string }
  | { kind: "orderedList"; text: string; start: number };

function parseFullWidthMarkdownMarker(value: string): FullWidthMarkdownMarker | null {
  const headingMatch = value.match(/^(＃{1,6})[ \t\u3000]+(.+)$/);
  if (headingMatch) {
    return { kind: "heading", depth: headingMatch[1]!.length, text: headingMatch[2]! };
  }

  const blockquoteMatch = value.match(/^＞[ \t\u3000]+(.+)$/);
  if (blockquoteMatch) return { kind: "blockquote", text: blockquoteMatch[1]! };

  const bulletMatch = value.match(/^[＊＋－][ \t\u3000]+(.+)$/);
  if (bulletMatch) return { kind: "bulletList", text: bulletMatch[1]! };

  const orderedMatch = value.match(/^([０-９]+)．[ \t\u3000]+(.+)$/);
  if (!orderedMatch) return null;
  const start = Number(
    orderedMatch[1]!
      .split("")
      .map((character) => String(character.charCodeAt(0) - "０".charCodeAt(0)))
      .join(""),
  );
  return Number.isNaN(start) ? null : { kind: "orderedList", text: orderedMatch[2]!, start };
}

function paragraphNodeFromText(value: string): Paragraph {
  return { type: "paragraph", children: [{ type: "text", value }] };
}

type MdastListItem = { type: "listItem"; spread: boolean; children: unknown[] };
type MdastList = {
  type: "list";
  ordered: boolean;
  start?: number;
  spread: boolean;
  children: MdastListItem[];
};

export interface RemarkFullWidthMarkdownOptions {
  enable?: boolean;
}

export const remarkFullWidthMarkdownPlugin: Plugin<
  [RemarkFullWidthMarkdownOptions | undefined],
  Root
> = (options) => {
  const enabled = options?.enable !== false;
  return (tree) => {
    if (!enabled) return;
    visit(tree, "paragraph", (node, index, parent) => {
      if (!parent || typeof index !== "number") return;
      if (node.children.length !== 1 || node.children[0]?.type !== "text") return;

      const marker = parseFullWidthMarkdownMarker((node.children[0] as Text).value);
      if (!marker) return;
      if (marker.kind === "heading") {
        Object.assign(node, {
          type: "heading",
          depth: marker.depth,
          children: [{ type: "text", value: marker.text }],
        });
        return;
      }

      const paragraph = paragraphNodeFromText(marker.text);
      const children = (parent as { children: unknown[] }).children;
      if (marker.kind === "blockquote") {
        children.splice(index, 1, { type: "blockquote", children: [paragraph] });
        return;
      }

      const ordered = marker.kind === "orderedList";
      const item: MdastListItem = { type: "listItem", spread: false, children: [paragraph] };
      const previous = children[index - 1] as MdastList | undefined;
      if (previous?.type === "list" && previous.ordered === ordered) {
        previous.children.push(item);
        children.splice(index, 1);
        return index;
      }

      const list: MdastList = { type: "list", ordered, spread: false, children: [item] };
      if (marker.kind === "orderedList") list.start = marker.start;
      children.splice(index, 1, list);
    });
  };
};
