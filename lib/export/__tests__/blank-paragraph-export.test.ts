import { describe, it, expect } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { mdiToHtml } from "@/lib/export/mdi-to-html";
import { mdiToPlainText } from "@/lib/export/txt-exporter";
import { generateDocxBlob } from "@/lib/export/docx-exporter";
import { buildEpubFiles } from "@/lib/export/epub-shared";

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

// Regression for the PDF/EPUB leak (花様年華): the HTML pipeline (mdiToHtml) is
// fed the *live Milkdown serializer output*, where MDI macros are escaped to
// `\[\[blank]]`. Before the fix, mdiToHtml never normalized this, so MDI_BLANK_RE
// (which matches the unescaped marker) missed it and `[[blank]]` leaked verbatim
// into PDF / EPUB / print output. TXT/DOCX already normalized via MdiDocument;
// these tests lock the HTML path to the same behavior.
describe("html exporter — serializer-escaped [[blank]] (PDF/EPUB leak regression)", () => {
  it("default (.mdi): \\[\\[blank]] (escaped) → <p></p>, no [[blank]] leak", () => {
    const html = mdiToHtml("A\n\n\\[\\[blank]]\n\nB", { bodyOnly: true });
    expect(html).toContain("<p></p>");
    expect(html).not.toContain("[[blank]]");
    expect(html).not.toContain("\\[");
    // U+E000 sentinel must not leak
    expect(html).not.toContain(String.fromCharCode(0xe000));
  });

  it(".mdi (explicit): \\[\\[blank]] (escaped) → <p></p>, no leak", () => {
    const html = mdiToHtml("A\n\n\\[\\[blank]]\n\nB", { bodyOnly: true, fileType: ".mdi" });
    expect(html).toContain("<p></p>");
    expect(html).not.toContain("[[blank]]");
    expect(html).not.toContain("\\[");
  });

  it(".md: \\[\\[blank]] (escaped) → preserved as literal text, NOT an empty <p> (DATA-LOSS guard)", () => {
    const html = mdiToHtml("A\n\n\\[\\[blank]]\n\nB", { bodyOnly: true, fileType: ".md" });
    // For non-.mdi the authored literal must survive — markdown-it un-escapes the
    // backslash so the visible text is "[[blank]]" inside a real paragraph.
    expect(html).toContain("[[blank]]");
    expect(html).not.toContain("<p></p>");
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

// End-to-end EPUB regression: buildEpubFiles → splitIntoChapters → mdiToHtml.
// The chapter xhtml is where [[blank]] previously leaked in the exported book
// (3rd screenshot of #花様年華). Confirms fileType threads all the way through.
describe("epub exporter — serializer-escaped [[blank]] in chapter xhtml", () => {
  it("default (.mdi): \\[\\[blank]] → empty <p>, no [[blank]] leak in chapter-1.xhtml", () => {
    const files = buildEpubFiles("# 第一章\n\nA\n\n\\[\\[blank]]\n\nB", {
      metadata: { title: "テスト", language: "ja" },
    });
    const chapter = files.get("OEBPS/chapter-1.xhtml") as string;
    expect(chapter).toBeTruthy();
    expect(chapter).toContain("<p></p>");
    expect(chapter).not.toContain("[[blank]]");
    expect(chapter).not.toContain("\\[");
  });

  it(".mdi (explicit): unescaped [[blank]] → empty <p>, no leak", () => {
    const files = buildEpubFiles("# 第一章\n\nA\n\n[[blank]]\n\nB", {
      metadata: { title: "テスト", language: "ja" },
      fileType: ".mdi",
    });
    const chapter = files.get("OEBPS/chapter-1.xhtml") as string;
    expect(chapter).toContain("<p></p>");
    expect(chapter).not.toContain("[[blank]]");
  });

  it(".md: \\[\\[blank]] → preserved as literal text, no empty <p> (DATA-LOSS guard)", () => {
    const files = buildEpubFiles("# 第一章\n\nA\n\n\\[\\[blank]]\n\nB", {
      metadata: { title: "note.md", language: "ja" },
      fileType: ".md",
    });
    const chapter = files.get("OEBPS/chapter-1.xhtml") as string;
    expect(chapter).toContain("[[blank]]");
    expect(chapter).not.toContain("<p></p>");
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

// Regression for Codex P3: `fromEditorOutput` normalizes editor-injected HTML
// (rewrites standalone/inline `<br>` and strips paired HTML tags like `<p>`)
// regardless of fileType — only MDI macro un-escaping was gated on ".mdi".
// For non-".mdi" exports the content is raw authored text, so this normalization
// is a regression: a literal `<br />` became a newline and `<p>x</p>` lost its
// tags. Non-".mdi" exports must go through `fromRawText` and preserve literals.
describe("export — non-.mdi preserves literal editor HTML (Codex P3)", () => {
  describe("txt exporter", () => {
    it(".txt: literal <br /> is PRESERVED (not turned into a newline)", () => {
      const txt = mdiToPlainText("行1<br />行2", ".txt");
      // The literal tag must survive verbatim; it must NOT be rewritten to a
      // line break that splits 行1 / 行2 onto separate lines.
      expect(txt).toContain("<br />");
      expect(txt).toContain("行1<br />行2");
    });

    it(".md: literal <p>x</p> is PRESERVED (tags not stripped)", () => {
      const txt = mdiToPlainText("前<p>中</p>後", ".md");
      expect(txt).toContain("<p>中</p>");
    });

    it(".mdi: standalone <br /> still normalizes to a blank line (unchanged)", () => {
      const txt = mdiToPlainText("A段落\n\n<br />\n\nB段落", ".mdi");
      expect(txt).not.toContain("<br");
    });

    it(".mdi: <p>x</p> tags are still stripped (unchanged)", () => {
      const txt = mdiToPlainText("<p>本文</p>", ".mdi");
      expect(txt).not.toContain("<p>");
      expect(txt).not.toContain("</p>");
      expect(txt).toContain("本文");
    });
  });

  describe("docx exporter", () => {
    it(".txt: literal <br /> survives into the docx text run (not a <w:br/>)", async () => {
      const blob = await generateDocxBlob("行1<br />行2", {
        metadata: { title: "story.txt", language: "ja" },
        fileType: ".txt",
      });
      const unzipped = unzipSync(new Uint8Array(await blob.arrayBuffer()));
      const documentXml = strFromU8(unzipped["word/document.xml"]!);
      // The literal angle-bracket tag is preserved as text (XML-escaped).
      expect(documentXml).toContain("&lt;br /&gt;");
      // No explicit line break should have been emitted from the literal tag.
      expect(documentXml).not.toContain("<w:br/>");
    });

    it(".md: literal <p>x</p> tags are preserved as text (not stripped)", async () => {
      const blob = await generateDocxBlob("前<p>中</p>後", {
        metadata: { title: "note.md", language: "ja" },
        fileType: ".md",
      });
      const unzipped = unzipSync(new Uint8Array(await blob.arrayBuffer()));
      const documentXml = strFromU8(unzipped["word/document.xml"]!);
      expect(documentXml).toContain("&lt;p&gt;");
      expect(documentXml).toContain("&lt;/p&gt;");
    });

    it(".mdi: <p>x</p> tags are still stripped (unchanged)", async () => {
      const blob = await generateDocxBlob("<p>本文</p>", {
        metadata: { title: "novel.mdi", language: "ja" },
        fileType: ".mdi",
      });
      const unzipped = unzipSync(new Uint8Array(await blob.arrayBuffer()));
      const documentXml = strFromU8(unzipped["word/document.xml"]!);
      expect(documentXml).not.toContain("&lt;p&gt;");
      expect(documentXml).toContain("本文");
    });
  });
});
