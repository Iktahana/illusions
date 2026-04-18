import { describe, it, expect } from "vitest";
import { remarkMdiBreakPlugin } from "../syntax";

type TextNode = { type: "text"; value: string };
type MdiBreakNode = { type: "mdibreak" };
type InlineNode = TextNode | MdiBreakNode;
type Paragraph = { type: "paragraph"; children: InlineNode[] };
type Root = { type: "root"; children: Paragraph[] };

function makeTree(paragraphText: string): Root {
  return {
    type: "root",
    children: [
      {
        type: "paragraph",
        children: [{ type: "text", value: paragraphText }],
      },
    ],
  };
}

function runPlugin(tree: Root, options?: { enable?: boolean }): Root {
  const factory = remarkMdiBreakPlugin as unknown as (
    opts?: { enable?: boolean },
  ) => (t: Root) => void;
  factory(options)(tree);
  return tree;
}

describe("remarkMdiBreakPlugin", () => {
  it("converts [[br]] to a mdibreak node", () => {
    const tree = runPlugin(makeTree("春は曙。[[br]]やうやう"));
    const children = tree.children[0]!.children;
    const types = children.map((n) => n.type);
    expect(types).toContain("mdibreak");
  });

  it("splits surrounding text correctly", () => {
    const tree = runPlugin(makeTree("a[[br]]b"));
    const children = tree.children[0]!.children;
    expect(children).toHaveLength(3);
    expect(children[0]).toEqual({ type: "text", value: "a" });
    expect(children[1]).toEqual({ type: "mdibreak" });
    expect(children[2]).toEqual({ type: "text", value: "b" });
  });

  it("handles consecutive [[br]][[br]] as two breaks", () => {
    const tree = runPlugin(makeTree("a[[br]][[br]]b"));
    const children = tree.children[0]!.children;
    const breakCount = children.filter((n) => n.type === "mdibreak").length;
    expect(breakCount).toBe(2);
  });

  it("does not convert when disabled", () => {
    const tree = runPlugin(makeTree("a[[br]]b"), { enable: false });
    const children = tree.children[0]!.children;
    const breakCount = children.filter((n) => n.type === "mdibreak").length;
    expect(breakCount).toBe(0);
    expect(children[0]).toEqual({ type: "text", value: "a[[br]]b" });
  });

  it("leaves text with no [[br]] untouched", () => {
    const tree = runPlugin(makeTree("plain text"));
    const children = tree.children[0]!.children;
    expect(children).toHaveLength(1);
    expect(children[0]).toEqual({ type: "text", value: "plain text" });
  });

  it("handles [[br]] at start of paragraph", () => {
    const tree = runPlugin(makeTree("[[br]]hello"));
    const children = tree.children[0]!.children;
    expect(children[0]).toEqual({ type: "mdibreak" });
    expect(children[1]).toEqual({ type: "text", value: "hello" });
  });

  it("handles [[br]] at end of paragraph", () => {
    const tree = runPlugin(makeTree("hello[[br]]"));
    const children = tree.children[0]!.children;
    expect(children[0]).toEqual({ type: "text", value: "hello" });
    expect(children[1]).toEqual({ type: "mdibreak" });
  });
});
