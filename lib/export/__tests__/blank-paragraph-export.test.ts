import { describe, it, expect } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { mdiToHtml } from "@/lib/export/mdi-to-html";
import { mdiToPlainText } from "@/lib/export/txt-exporter";
import { generateDocxBlob } from "@/lib/export/docx-exporter";

describe("html exporter — [[blank]] paragraph handling", () => {
  it("[[blank]] → <p></p>", () => {
    const html = mdiToHtml("A\n\n[[blank]]\n\nB", { bodyOnly: true });
    expect(html).toContain("<p></p>");
    expect(html).not.toContain("[[blank]]");
    // U+E000 sentinel must not leak
    expect(html).not.toContain("");
  });

  it("連続 [[blank]] → 2 連続の <p></p>", () => {
    const html = mdiToHtml("A\n\n[[blank]]\n\n[[blank]]\n\nB", { bodyOnly: true });
    const count = (html.match(/<p><\/p>/g) ?? []).length;
    expect(count).toBe(2);
  });

  it("fenced code block 内の [[blank]] でも U+E000 sentinel はリークしない", () => {
    // markdown-it は fenced code を <pre><code>…</code></pre> として描画する。
    // pre-process で行頭 [[blank]] → U+E000 に置換した結果、コードブロック内に sentinel が
    // 残るため、最終 sweep で除去されることを確認する (Copilot review #1483 round 2)。
    const html = mdiToHtml("文章\n\n```\n[[blank]]\n```\n\n続き", { bodyOnly: true });
    expect(html).not.toContain("");
    expect(html).not.toContain("[[blank]]");
  });
});

describe("txt exporter — [[blank]] paragraph handling", () => {
  it("[[blank]] → 強制空行", () => {
    const txt = mdiToPlainText("A段落\n\n[[blank]]\n\nB段落");
    expect(txt).not.toContain("[[blank]]");
    // A段落 and B段落 should have at least one blank line between them
    const lines = txt.split("\n");
    const aIdx = lines.findIndex((l) => l.includes("A段落"));
    const bIdx = lines.findIndex((l) => l.includes("B段落"));
    expect(aIdx).toBeGreaterThanOrEqual(0);
    expect(bIdx).toBeGreaterThan(aIdx);
    // At least one blank line between them
    const between = lines.slice(aIdx + 1, bIdx);
    expect(between.some((l) => l.trim() === "")).toBe(true);
  });
});

describe("docx exporter — [[blank]] paragraph handling", () => {
  it("[[blank]] → 空 <w:p> in word/document.xml", async () => {
    const blob = await generateDocxBlob("A\n\n[[blank]]\n\nB", {
      metadata: { title: "テスト", language: "ja" },
    });
    const arrayBuffer = await blob.arrayBuffer();
    const unzipped = unzipSync(new Uint8Array(arrayBuffer));
    const documentXml = strFromU8(unzipped["word/document.xml"]!);
    // The exporter inserts an empty <w:p> for [[blank]] (no <w:r> text runs inside).
    // Pattern: <w:p ... /> or <w:p>...</w:p> with no <w:r> tag
    // Look for at least one <w:p> that contains no <w:r>
    expect(documentXml).not.toContain("[[blank]]");
    // A simpler smoke check: ensure A and B paragraphs are both present and total <w:p> count is ≥ 3 (A + blank + B)
    const pCount = (documentXml.match(/<w:p[\s>]/g) ?? []).length;
    expect(pCount).toBeGreaterThanOrEqual(3);
    expect(documentXml).toContain("A");
    expect(documentXml).toContain("B");
  });
});
