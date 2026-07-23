import { describe, expect, it } from "vitest";
import { renderHtmlWithDiagnostics } from "@illusions-lab/mdi";
import { resolvePrintProfile } from "@illusions-lab/mdi-export-profile";
import { strFromU8, unzipSync } from "fflate";

import { generateDocx } from "../docx-exporter";
import { generateEpub } from "../epub-exporter";
import { exportMdiText } from "../txt-exporter";
import { normalizeExportSource, toExportProfile } from "../mdi-export";
import { DEFAULT_EXPORT_SETTINGS } from "../export-settings";

const source = "# 見出し\n\n{漢字|かんじ}と^12^月。\n\n[[blank]]\n\n次。";

describe("@illusions-lab/mdi export boundary", () => {
  it.each([
    ["txt", "見出し\n　漢字と12月。\n\n　次。"],
    ["txt-ruby", "見出し\n　{漢字|かんじ}と12月。\n\n　次。"],
    ["narou", "見出し\n　｜漢字《かんじ》と12月。\n\n　次。"],
    ["kakuyomu", "見出し\n　｜漢字《かんじ》と12月。\n\n　次。"],
    ["aozora", "見出し［＃「見出し」は大見出し］\r\n　｜漢字《かんじ》と12月。\r\n\r\n　次。"],
  ] as const)("renders the exact upstream %s text convention", async (format, expected) => {
    await expect(
      exportMdiText(source, format, ".mdi", {
        fullwidthSpaceIndent: true,
        indentCount: 1,
      }),
    ).resolves.toBe(expected);
  });

  it.each([
    [Number.NaN, 1],
    [-100, 1],
    [999_999, 4],
  ])("bounds an untrusted TXT indent count %s to %s spaces", async (indentCount, spaces) => {
    const output = await exportMdiText("本文。", "txt", ".mdi", {
      fullwidthSpaceIndent: true,
      indentCount,
    });
    expect(output).toBe(`${"　".repeat(spaces)}本文。`);
  });

  it("normalizes escaped MDI blank macros without rewriting raw Markdown/TXT source", () => {
    const editorOutput = String.raw`前。\n\n\[\[blank]]\n\n後。`;
    expect(normalizeExportSource(editorOutput, ".mdi")).toBe(String.raw`前。\n\n[[blank]]\n\n後。`);
    expect(normalizeExportSource(editorOutput, ".md")).toBe(editorOutput);
    expect(normalizeExportSource(editorOutput, ".txt")).toBe(editorOutput);
  });

  it("retains Rust diagnostics and headings for HTML consumers", () => {
    const result = renderHtmlWithDiagnostics(normalizeExportSource(source), { bodyOnly: true });
    expect(result.diagnostics).toEqual([]);
    expect(result.headings).toEqual(
      expect.arrayContaining([expect.objectContaining({ text: "見出し" })]),
    );
    expect(result.output).toContain('<ruby class="mdi-ruby">');
    expect(result.output).toContain('<p class="mdi-blank"></p>');
  });

  it("uses the upstream japanese-publisher defaults", () => {
    const profile = toExportProfile(DEFAULT_EXPORT_SETTINGS, { title: "テスト", language: "ja" });
    const resolved = resolvePrintProfile(profile, "vertical");
    expect(resolved.layout.system).toBe("japanese-publisher");
    expect(resolved.pagination.pageSize).toBeDefined();
  });

  it("preserves blank paragraphs across the Rust DOCX and EPUB renderers", async () => {
    const editorSource = String.raw`# 第一章

A

\[\[blank]]

B`;
    const metadata = { title: "空段落テスト", language: "ja" };

    const [docx, epub] = await Promise.all([
      generateDocx(editorSource, {
        metadata,
        fileType: ".mdi",
        settings: DEFAULT_EXPORT_SETTINGS,
      }),
      generateEpub(editorSource, {
        metadata,
        fileType: ".mdi",
        verticalWriting: true,
        fontFamily: "serif",
        textIndent: 1,
        chapterSplitLevel: "h1",
      }),
    ]);

    const documentXml = strFromU8(unzipSync(new Uint8Array(docx))["word/document.xml"]!);
    const epubFiles = unzipSync(new Uint8Array(epub));
    const chapterXml = strFromU8(epubFiles["OEBPS/chapter-1.xhtml"]!);

    expect(documentXml).not.toContain("[[blank]]");
    expect(documentXml).toMatch(/<w:p><w:r><w:t xml:space="preserve"><\/w:t><\/w:r><\/w:p>/);
    expect(chapterXml).not.toContain("[[blank]]");
    expect(chapterXml).toContain('<p class="mdi-blank"></p>');
  });

  it("applies the unified grid and full-width indentation to the DOCX output", async () => {
    async function documentXml(charsPerLine: number, linesPerPage: number): Promise<string> {
      const docx = await generateDocx("本文。", {
        metadata: { title: "組版" },
        settings: {
          ...DEFAULT_EXPORT_SETTINGS,
          charsPerLine,
          linesPerPage,
          textIndent: 2,
          fullwidthSpaceIndent: true,
        },
      });
      return strFromU8(unzipSync(docx)["word/document.xml"]!);
    }

    const defaults = await documentXml(40, 30);
    const customized = await documentXml(33, 22);
    const defaultGrid = defaults.match(/<w:docGrid\b[^>]*>/)?.[0];
    const customizedGrid = customized.match(/<w:docGrid\b[^>]*>/)?.[0];

    expect(defaultGrid).toBeDefined();
    expect(customizedGrid).toBeDefined();
    expect(customizedGrid).not.toBe(defaultGrid);
    expect(customized).toContain('<w:t xml:space="preserve">　　</w:t>');
  });
});
