/**
 * 日本語小説向けの記法（ルビ/縦中横など）を扱う Remark プラグイン
 */

import type { Paragraph, Root, Text } from "mdast";
import type { Plugin } from "unified";
import { visit } from "unist-util-visit";

/** ルビ: {base|ruby} */
const RUBY_RE = /\{([^|]+)\|([^}]+)\}/g;

/** 縦中横: ^text^ */
const TCY_RE = /\^([^^]+)\^/g;

/** 改行禁止: [[no-break:text]] */
const NO_BREAK_RE = /\[\[no-break:([^\]]+)\]\]/g;

/** カーニング: [[kern:amount:text]]（amount は検証する） */
const KERN_RE = /\[\[kern:([+-]?\d+(?:\.\d+)?em):([^\]]+)\]\]/g;
const KERN_AMOUNT_VALID_RE = /^[+-]?\d+(\.\d+)?em$/;

/** MDI 明示改行: [[br]] */
const MDI_BREAK_RE = /\[\[br\]\]/g;

type TextNode = { type: "text"; value: string };
type RubyNode = { type: "ruby"; base: string; text: string };
type TcyNode = { type: "tcy"; value: string };
type NoBreakNode = { type: "nobreak"; text: string };
type KernNode = { type: "kern"; amount: string; text: string };
type MdiBreakNode = { type: "mdibreak" };
type InlineNode = TextNode | RubyNode | TcyNode | NoBreakNode | KernNode | MdiBreakNode;

type HeadingNode = {
  type: "heading";
  depth?: number;
  children?: InlineNode[];
  data?: Record<string, unknown>;
};

function splitRuby(text: string): InlineNode[] {
  const segments: InlineNode[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  RUBY_RE.lastIndex = 0;
  while ((m = RUBY_RE.exec(text)) !== null) {
    if (m.index > lastIndex) {
      segments.push({ type: "text", value: text.slice(lastIndex, m.index) });
    }
    segments.push({ type: "ruby", base: m[1]!, text: m[2]! });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ type: "text", value: text.slice(lastIndex) });
  }
  return segments;
}

function splitTcy(text: string): InlineNode[] {
  const segments: InlineNode[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  TCY_RE.lastIndex = 0;
  while ((m = TCY_RE.exec(text)) !== null) {
    if (m.index > lastIndex) {
      segments.push({ type: "text", value: text.slice(lastIndex, m.index) });
    }
    segments.push({ type: "tcy", value: m[1]! });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ type: "text", value: text.slice(lastIndex) });
  }
  return segments;
}

export interface RemarkRubyOptions {
  enable?: boolean;
}

export const remarkRubyPlugin: Plugin<[RemarkRubyOptions | undefined], Root> = (opts) => {
  const enable = opts?.enable !== false;
  return (tree) => {
    visit(tree, "text", (node, index, parent) => {
      if (!parent || typeof index !== "number" || !enable) return;
      const value = (node as TextNode).value;
      if (!value.includes("{")) return;
      const segments = splitRuby(value);
      if (segments.length === 0 || (segments.length === 1 && segments[0]!.type === "text")) return;
      const children = (parent as { children: unknown[] }).children;
      children.splice(index, 1, ...segments);
    });
  };
};

export interface RemarkTcyOptions {
  enable?: boolean;
}

export const remarkTcyPlugin: Plugin<[RemarkTcyOptions | undefined], Root> = (opts) => {
  const enable = opts?.enable !== false;
  return (tree) => {
    visit(tree, "text", (node, index, parent) => {
      if (!parent || typeof index !== "number" || !enable) return;
      const value = (node as TextNode).value;
      if (!/\^[^^]+\^/.test(value)) return;
      const segments = splitTcy(value);
      if (segments.length === 0 || (segments.length === 1 && segments[0]!.type === "text")) return;
      const children = (parent as { children: unknown[] }).children;
      children.splice(index, 1, ...segments);
    });
  };
};

function splitNoBreak(text: string): InlineNode[] {
  const segments: InlineNode[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  NO_BREAK_RE.lastIndex = 0;
  while ((m = NO_BREAK_RE.exec(text)) !== null) {
    if (m.index > lastIndex) {
      segments.push({ type: "text", value: text.slice(lastIndex, m.index) });
    }
    segments.push({ type: "nobreak", text: m[1]! });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ type: "text", value: text.slice(lastIndex) });
  }
  return segments;
}

function splitKern(text: string): InlineNode[] {
  const segments: InlineNode[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  KERN_RE.lastIndex = 0;
  while ((m = KERN_RE.exec(text)) !== null) {
    if (m.index > lastIndex) {
      segments.push({ type: "text", value: text.slice(lastIndex, m.index) });
    }
    const amount = m[1]!;
    const kernText = m[2]!;

    // セキュリティのため amount の形式を検証する
    if (KERN_AMOUNT_VALID_RE.test(amount)) {
      segments.push({ type: "kern", amount, text: kernText });
    } else {
      // 不正な形式はプレーンテキストとして扱う
      segments.push({ type: "text", value: m[0] });
    }
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ type: "text", value: text.slice(lastIndex) });
  }
  return segments;
}

export interface RemarkNoBreakOptions {
  enable?: boolean;
}

export const remarkNoBreakPlugin: Plugin<[RemarkNoBreakOptions | undefined], Root> = (opts) => {
  const enable = opts?.enable !== false;
  return (tree) => {
    visit(tree, "text", (node, index, parent) => {
      if (!parent || typeof index !== "number" || !enable) return;
      const value = (node as TextNode).value;
      if (!/\[\[no-break:/.test(value)) return;
      const segments = splitNoBreak(value);
      if (segments.length === 0 || (segments.length === 1 && segments[0]!.type === "text")) return;
      const children = (parent as { children: unknown[] }).children;
      children.splice(index, 1, ...segments);
    });
  };
};

export interface RemarkKernOptions {
  enable?: boolean;
}

export const remarkKernPlugin: Plugin<[RemarkKernOptions | undefined], Root> = (opts) => {
  const enable = opts?.enable !== false;
  return (tree) => {
    visit(tree, "text", (node, index, parent) => {
      if (!parent || typeof index !== "number" || !enable) return;
      const value = (node as TextNode).value;
      if (!/\[\[kern:/.test(value)) return;
      const segments = splitKern(value);
      if (segments.length === 0 || (segments.length === 1 && segments[0]!.type === "text")) return;
      const children = (parent as { children: unknown[] }).children;
      children.splice(index, 1, ...segments);
    });
  };
};

function splitMdiBreak(text: string): InlineNode[] {
  const segments: InlineNode[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  MDI_BREAK_RE.lastIndex = 0;
  while ((m = MDI_BREAK_RE.exec(text)) !== null) {
    if (m.index > lastIndex) {
      segments.push({ type: "text", value: text.slice(lastIndex, m.index) });
    }
    segments.push({ type: "mdibreak" });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ type: "text", value: text.slice(lastIndex) });
  }
  return segments;
}

export interface RemarkMdiBreakOptions {
  enable?: boolean;
}

export const remarkMdiBreakPlugin: Plugin<[RemarkMdiBreakOptions | undefined], Root> = (opts) => {
  const enable = opts?.enable !== false;
  return (tree) => {
    visit(tree, "text", (node, index, parent) => {
      if (!parent || typeof index !== "number" || !enable) return;
      const value = (node as TextNode).value;
      if (!value.includes("[[br]]")) return;
      const segments = splitMdiBreak(value);
      if (segments.length === 0 || (segments.length === 1 && segments[0]!.type === "text")) return;
      const children = (parent as { children: unknown[] }).children;
      children.splice(index, 1, ...segments);
    });
  };
};

export const remarkHeadingAnchorPlugin: Plugin<[], Root> = () => {
  return (_tree) => {
    // 見出しアンカーはここでは処理しない
    // ID は見出しの内容から直接生成される
  };
};

export interface RemarkMdiBlankOptions {
  enable?: boolean;
}

type FullWidthMarkdownMarker =
  | { kind: "heading"; depth: number; text: string }
  | { kind: "blockquote"; text: string }
  | { kind: "bulletList"; text: string }
  | { kind: "orderedList"; text: string; start: number };

function parseFullWidthMarkdownMarker(value: string): FullWidthMarkdownMarker | null {
  const headingMatch = value.match(/^(＃{1,6})[ \t\u3000]+(.+)$/);
  if (headingMatch) {
    return {
      kind: "heading",
      depth: headingMatch[1]!.length,
      text: headingMatch[2]!,
    };
  }

  const blockquoteMatch = value.match(/^＞[ \t\u3000]+(.+)$/);
  if (blockquoteMatch) {
    return {
      kind: "blockquote",
      text: blockquoteMatch[1]!,
    };
  }

  const bulletMatch = value.match(/^[＊＋－][ \t\u3000]+(.+)$/);
  if (bulletMatch) {
    return {
      kind: "bulletList",
      text: bulletMatch[1]!,
    };
  }

  const orderedMatch = value.match(/^([０-９]+)．[ \t\u3000]+(.+)$/);
  if (orderedMatch) {
    const start = Number(
      orderedMatch[1]!
        .split("")
        .map((ch) => String(ch.charCodeAt(0) - "０".charCodeAt(0)))
        .join(""),
    );

    if (Number.isNaN(start)) return null;
    return {
      kind: "orderedList",
      text: orderedMatch[2]!,
      start,
    };
  }

  return null;
}

function paragraphNodeFromText(value: string): Paragraph {
  return {
    type: "paragraph",
    children: [{ type: "text", value }],
  };
}

export interface RemarkFullWidthMarkdownOptions {
  enable?: boolean;
}

export const remarkFullWidthMarkdownPlugin: Plugin<
  [RemarkFullWidthMarkdownOptions | undefined],
  Root
> = (opts) => {
  const enable = opts?.enable !== false;

  return (tree) => {
    if (!enable) return;

    visit(tree, "paragraph", (node, index, parent) => {
      if (!parent || typeof index !== "number") return;
      if (node.children.length !== 1 || node.children[0]?.type !== "text") return;

      const value = (node.children[0] as Text).value;
      const marker = parseFullWidthMarkdownMarker(value);
      if (!marker) return;

      if (marker.kind === "heading") {
        const heading = node as unknown as HeadingNode;
        heading.type = "heading";
        heading.depth = marker.depth;
        heading.children = [{ type: "text", value: marker.text }];
        return;
      }

      const paragraph = paragraphNodeFromText(marker.text);
      const containerChildren = (parent as { children: unknown[] }).children;

      if (marker.kind === "blockquote") {
        containerChildren.splice(index, 1, {
          type: "blockquote",
          children: [paragraph],
        });
        return;
      }

      if (marker.kind === "bulletList") {
        containerChildren.splice(index, 1, {
          type: "list",
          ordered: false,
          spread: false,
          children: [
            {
              type: "listItem",
              spread: false,
              children: [paragraph],
            },
          ],
        });
        return;
      }

      containerChildren.splice(index, 1, {
        type: "list",
        ordered: true,
        start: marker.start,
        spread: false,
        children: [
          {
            type: "listItem",
            spread: false,
            children: [paragraph],
          },
        ],
      });
    });
  };
};

export const remarkMdiBlankPlugin: Plugin<[RemarkMdiBlankOptions | undefined], Root> = (opts) => {
  const enable = opts?.enable !== false;
  return (tree) => {
    if (!enable) return;
    visit(tree, "paragraph", (node: Paragraph) => {
      if (
        node.children.length === 1 &&
        node.children[0].type === "text" &&
        (node.children[0] as Text).value.trim() === "[[blank]]"
      ) {
        // Convert to a custom block node so the schema can round-trip `[[blank]]`.
        // Just clearing children would serialize back as a regular blank line and
        // lose the marker; the matching `blankParagraphSchema` renders an empty
        // `<p>` in the editor and re-emits `[[blank]]` on save.
        (node as unknown as { type: string }).type = "blankParagraph";
        (node as unknown as { children: unknown[] }).children = [];
      }
    });
  };
};
