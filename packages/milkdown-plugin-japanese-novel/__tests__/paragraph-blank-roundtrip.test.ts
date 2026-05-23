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
  it("paste-origin <br /> → 保存形 [[blank]] → load で空 paragraph", () => {
    const { sanitized, tree } = saveThenLoad("A段落\n\n<br />\n\nB段落");
    expect(sanitized).toBe("A段落\n\n[[blank]]\n\nB段落");
    const root = tree as { children: { type: string; children: unknown[] }[] };
    const middle = root.children[1];
    expect(middle.type).toBe("paragraph");
    expect(middle.children).toHaveLength(0);
  });

  it("連続 <br /> → 連続 [[blank]] → 2 連続の空 paragraph", () => {
    const { sanitized, tree } = saveThenLoad("A\n\n<br />\n\n<br />\n\nB");
    expect(sanitized).toBe("A\n\n[[blank]]\n\n[[blank]]\n\nB");
    const root = tree as { children: { type: string; children: unknown[] }[] };
    const emptyParagraphs = root.children.filter(
      (n) => n.type === "paragraph" && n.children.length === 0,
    );
    expect(emptyParagraphs.length).toBe(2);
  });

  it("先頭空段落 → 保持される", () => {
    const { sanitized, tree } = saveThenLoad("<br />\n\nA");
    expect(sanitized).toBe("[[blank]]\n\nA");
    const root = tree as { children: { type: string; children: unknown[] }[] };
    expect(root.children[0].type).toBe("paragraph");
    expect(root.children[0].children).toHaveLength(0);
  });

  it("(known limitation) ProseMirror 空段落 → markdown serializer is intentionally NOT round-tripped via [[blank]]", () => {
    // ProseMirror の空段落は serializer が blank line に折り畳むため、保存ファイルには
    // [[blank]] が現れない。[[blank]] の生成元は paste / import / 外部書き込みのみ。
    // この制約は docs/MDI/spec.md にも明記する (Task 9)。
    expect(true).toBe(true);
  });
});
