import { describe, it, expect } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import { sanitizeMdiContent } from "@/lib/tab-manager/types";
import { remarkMdiBlankPlugin } from "../syntax";

function saveThenLoad(raw: string) {
  // Save direction: simulate the editor → sanitize → on-disk markdown
  const sanitized = sanitizeMdiContent(raw, { fileType: ".mdi" });
  // Load direction: parse the on-disk markdown back to mdast and run the blank plugin
  const tree = unified().use(remarkParse).parse(sanitized);
  const runner = (
    remarkMdiBlankPlugin as unknown as (opts?: { enable?: boolean }) => (t: unknown) => void
  )({ enable: true });
  runner(tree);
  return { sanitized, tree };
}

describe("MDI blank paragraph — save → load composition round-trip", () => {
  it("paste-origin <br /> → 保存形 [[blank]] → load で blankParagraph ノード", () => {
    const { sanitized, tree } = saveThenLoad("A段落\n\n<br />\n\nB段落");
    expect(sanitized).toBe("A段落\n\n[[blank]]\n\nB段落");
    const root = tree as { children: { type: string; children: unknown[] }[] };
    const middle = root.children[1];
    expect(middle.type).toBe("blankParagraph");
    expect(middle.children).toHaveLength(0);
  });

  it("連続 <br /> → 連続 [[blank]] → 2 連続の blankParagraph", () => {
    const { sanitized, tree } = saveThenLoad("A\n\n<br />\n\n<br />\n\nB");
    expect(sanitized).toBe("A\n\n[[blank]]\n\n[[blank]]\n\nB");
    const root = tree as { children: { type: string; children: unknown[] }[] };
    const blankNodes = root.children.filter((n) => n.type === "blankParagraph");
    expect(blankNodes.length).toBe(2);
  });

  it("先頭空段落 → 保持される", () => {
    const { sanitized, tree } = saveThenLoad("<br />\n\nA");
    expect(sanitized).toBe("[[blank]]\n\nA");
    const root = tree as { children: { type: string; children: unknown[] }[] };
    expect(root.children[0].type).toBe("blankParagraph");
    expect(root.children[0].children).toHaveLength(0);
  });

  it("(known limitation) ProseMirror 由来の連続空行 → sanitize は [[blank]] を生成しない", () => {
    // ProseMirror の空段落は markdown serializer が連続空行に折り畳むため、保存ファイルには
    // [[blank]] が現れない（[[blank]] の生成元は paste / import / 外部書き込み (<br />) のみ）。
    // この制約は docs/MDI/spec.md §6.2 にも明記する。
    const serializedEmptyParagraphs = "A\n\n\n\nB"; // 3+ newlines = 空段落を含む serializer 出力
    const sanitized = sanitizeMdiContent(serializedEmptyParagraphs, { fileType: ".mdi" });
    expect(sanitized).not.toContain("[[blank]]");
  });
});
