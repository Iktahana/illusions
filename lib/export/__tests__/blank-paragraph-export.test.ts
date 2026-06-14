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

// Regression for Bug B: the Milkdown serializer escapes MDI bracket macros
// (`[[blank]]` → `\[\[blank]]`) and may emit standalone `<br />`. Export takes
// the live serializer output, so it must normalize these before the
// marker-aware pipeline runs — otherwise they leak into the output verbatim.
describe("export — serializer-escaped blank markers (Bug B)", () => {
  it("txt: \\[\\[blank]] (escaped) → forced blank line, no leak", () => {
    const txt = mdiToPlainText("A段落\n\n\\[\\[blank]]\n\nB段落");
    expect(txt).not.toContain("[[blank]]");
    expect(txt).not.toContain("\\[");
    const lines = txt.split("\n");
    const aIdx = lines.findIndex((l) => l.includes("A段落"));
    const bIdx = lines.findIndex((l) => l.includes("B段落"));
    expect(aIdx).toBeGreaterThanOrEqual(0);
    expect(bIdx).toBeGreaterThan(aIdx);
    expect(lines.slice(aIdx + 1, bIdx).some((l) => l.trim() === "")).toBe(true);
  });

  it("txt: standalone <br /> → blank line, no leak", () => {
    const txt = mdiToPlainText("A段落\n\n<br />\n\nB段落");
    expect(txt).not.toContain("<br");
  });

  it("docx: \\[\\[blank]] (escaped) → empty <w:p>, no leak", async () => {
    const blob = await generateDocxBlob("A\n\n\\[\\[blank]]\n\nB", {
      metadata: { title: "テスト", language: "ja" },
    });
    const unzipped = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    const documentXml = strFromU8(unzipped["word/document.xml"]!);
    expect(documentXml).not.toContain("[[blank]]");
    expect(documentXml).not.toContain("\\[");
    expect(documentXml).toContain("A");
    expect(documentXml).toContain("B");
  });
});

// Regression for DATA-LOSS guard (Codex P2): for ".md"/".txt" documents, an
// author's intentionally-escaped literal `\[\[blank]]` must NOT be promoted to
// a blank line by the exporter. Only ".mdi" documents apply macro un-escaping.
describe("export — fileType preservation guard (.md/.txt)", () => {
  describe("txt exporter", () => {
    it(".md: \\[\\[blank]] (serializer-escaped) → literal [[blank]] in output, NOT a blank line", () => {
      // Simulates a .md author who literally typed \[\[blank]] — it should
      // survive export as the text "[[blank]]", not be silently blanked.
      const txt = mdiToPlainText("A段落\n\n\\[\\[blank]]\n\nB段落", ".md");
      // The escaped bracket becomes literal [[blank]] text (backslash stripped
      // by stripMarkdown's escape handler) — it must not vanish as a blank line.
      expect(txt).toContain("[[blank]]");
      // No forced blank line should have been inserted between A and B
      const lines = txt.split("\n");
      const aIdx = lines.findIndex((l) => l.includes("A段落"));
      const bIdx = lines.findIndex((l) => l.includes("B段落"));
      expect(aIdx).toBeGreaterThanOrEqual(0);
      expect(bIdx).toBeGreaterThan(aIdx);
      // There must be no blank line between them (the [[blank]] line is text, not a separator)
      const between = lines.slice(aIdx + 1, bIdx);
      expect(between.every((l) => l.trim() !== "")).toBe(true);
    });

    it(".txt: \\[\\[blank]] (serializer-escaped) → literal [[blank]] in output, NOT a blank line", () => {
      const txt = mdiToPlainText("段落1\n\n\\[\\[blank]]\n\n段落2", ".txt");
      expect(txt).toContain("[[blank]]");
      const lines = txt.split("\n");
      const idx1 = lines.findIndex((l) => l.includes("段落1"));
      const idx2 = lines.findIndex((l) => l.includes("段落2"));
      expect(idx1).toBeGreaterThanOrEqual(0);
      expect(idx2).toBeGreaterThan(idx1);
      const between = lines.slice(idx1 + 1, idx2);
      expect(between.every((l) => l.trim() !== "")).toBe(true);
    });

    it(".mdi: \\[\\[blank]] (serializer-escaped) → still becomes blank line (existing behavior unchanged)", () => {
      const txt = mdiToPlainText("A段落\n\n\\[\\[blank]]\n\nB段落", ".mdi");
      expect(txt).not.toContain("[[blank]]");
      expect(txt).not.toContain("\\[");
      const lines = txt.split("\n");
      const aIdx = lines.findIndex((l) => l.includes("A段落"));
      const bIdx = lines.findIndex((l) => l.includes("B段落"));
      expect(aIdx).toBeGreaterThanOrEqual(0);
      expect(bIdx).toBeGreaterThan(aIdx);
      expect(lines.slice(aIdx + 1, bIdx).some((l) => l.trim() === "")).toBe(true);
    });
  });

  describe("docx exporter", () => {
    it(".md: \\[\\[blank]] → preserved as text paragraph, no blank <w:p> inserted", async () => {
      // For a .md document the author typed \[\[blank]] as a literal escape.
      // fromEditorOutput skips Step 0 (macro un-escaping), so the raw text
      // stays as \[\[blank]]. parseMarkdownToDocxParagraphs does not strip
      // backslash escapes, so the text appears verbatim in the DOCX paragraph —
      // crucially as a *text* run, not as an empty blank paragraph.
      const blob = await generateDocxBlob("A\n\n\\[\\[blank]]\n\nB", {
        metadata: { title: "test.md", language: "ja" },
        fileType: ".md",
      });
      const unzipped = unzipSync(new Uint8Array(await blob.arrayBuffer()));
      const documentXml = strFromU8(unzipped["word/document.xml"]!);
      // The escaped text appears as a text run in a paragraph (DATA-LOSS guard:
      // the content must NOT silently become an empty blank <w:p>).
      // The docx XML will contain the literal backslash-bracket sequence.
      expect(documentXml).toContain("\\[\\[blank]]");
      // Exactly 3 content paragraphs: A, \[\[blank]] text, B
      // (NOT 4, which would indicate an extra blank paragraph was inserted).
      const pCount = (documentXml.match(/<w:p[\s>]/g) ?? []).length;
      expect(pCount).toBe(3);
    });

    it(".txt: \\[\\[blank]] → preserved as text paragraph, no blank <w:p> inserted", async () => {
      const blob = await generateDocxBlob("段落1\n\n\\[\\[blank]]\n\n段落2", {
        metadata: { title: "story.txt", language: "ja" },
        fileType: ".txt",
      });
      const unzipped = unzipSync(new Uint8Array(await blob.arrayBuffer()));
      const documentXml = strFromU8(unzipped["word/document.xml"]!);
      expect(documentXml).toContain("\\[\\[blank]]");
      const pCount = (documentXml.match(/<w:p[\s>]/g) ?? []).length;
      expect(pCount).toBe(3);
    });

    it(".mdi: \\[\\[blank]] → empty <w:p> (existing behavior unchanged)", async () => {
      const blob = await generateDocxBlob("A\n\n\\[\\[blank]]\n\nB", {
        metadata: { title: "novel.mdi", language: "ja" },
        fileType: ".mdi",
      });
      const unzipped = unzipSync(new Uint8Array(await blob.arrayBuffer()));
      const documentXml = strFromU8(unzipped["word/document.xml"]!);
      expect(documentXml).not.toContain("[[blank]]");
      expect(documentXml).not.toContain("\\[");
      const pCount = (documentXml.match(/<w:p[\s>]/g) ?? []).length;
      expect(pCount).toBeGreaterThanOrEqual(3);
    });
  });
});
