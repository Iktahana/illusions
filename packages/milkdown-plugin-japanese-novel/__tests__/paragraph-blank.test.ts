import { describe, it, expect } from "vitest";
import { remarkMdiBlankPlugin } from "../syntax";

type TextNode = { type: "text"; value: string };
type InlineNode = TextNode;
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
  const factory = remarkMdiBlankPlugin as unknown as (opts?: {
    enable?: boolean;
  }) => (t: Root) => void;
  factory(options)(tree);
  return tree;
}

describe("remarkMdiBlankPlugin", () => {
  it("[[blank]]-only paragraph → children becomes []", () => {
    const tree = runPlugin(makeTree("[[blank]]"));
    expect(tree.children[0]!.children).toHaveLength(0);
  });

  it("normal text paragraph → unchanged", () => {
    const tree = runPlugin(makeTree("春は曙。"));
    const children = tree.children[0]!.children;
    expect(children).toHaveLength(1);
    expect(children[0]).toEqual({ type: "text", value: "春は曙。" });
  });

  it("[[blank]] with surrounding text in same paragraph → unchanged (does NOT match)", () => {
    const tree = runPlugin(makeTree("before [[blank]] after"));
    const children = tree.children[0]!.children;
    // trim() is used, but still a single text node with mixed content — children is NOT cleared
    expect(children).toHaveLength(1);
    expect((children[0] as TextNode).value).toContain("[[blank]]");
  });

  it("disabled via { enable: false } → unchanged", () => {
    const tree = runPlugin(makeTree("[[blank]]"), { enable: false });
    const children = tree.children[0]!.children;
    expect(children).toHaveLength(1);
    expect((children[0] as TextNode).value).toBe("[[blank]]");
  });
});
