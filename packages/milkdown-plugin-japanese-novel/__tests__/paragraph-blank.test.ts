import { describe, it, expect } from "vitest";
import { remarkMdiBlankPlugin } from "../syntax";

type TextNode = { type: "text"; value: string };
type Paragraph = { type: "paragraph"; children: TextNode[] };
type Root = { type: "root"; children: Paragraph[] };

function makeTree(paragraphText: string): Root {
  return {
    type: "root",
    children: [{ type: "paragraph", children: [{ type: "text", value: paragraphText }] }],
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
    expect(tree.children[0]!.children).toHaveLength(1);
    expect(tree.children[0]!.children[0]).toEqual({ type: "text", value: "春は曙。" });
  });

  it("[[blank]] with surrounding text → unchanged (mixed content)", () => {
    const tree = runPlugin(makeTree("before [[blank]] after"));
    expect(tree.children[0]!.children).toHaveLength(1);
  });

  it("disabled via { enable: false } → unchanged", () => {
    const tree = runPlugin(makeTree("[[blank]]"), { enable: false });
    expect(tree.children[0]!.children).toHaveLength(1);
  });
});
