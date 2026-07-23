import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";

import { generateDocx } from "../docx-exporter";
import { generateEpub } from "../epub-exporter";
import { DEFAULT_EXPORT_SETTINGS } from "../export-settings";
import { generateHtml } from "../html-exporter";
import { preparePdfPrintDocument, type PdfExportOptions } from "../pdf-exporter";
import { exportMdiText } from "../txt-exporter";
import type { TxtExportFormat } from "../txt-export-types";

const source = `---
mdi: "2.0"
title: 前付タイトル
author: 著者名
lang: ja
writing-mode: vertical
---

# 第一章

{東京|とうきょう}へ行った。

[[blank]]

次の段落。`;

const metadata = {
  title: "前付タイトル",
  author: "著者名",
  language: "ja",
};

const leakedFrontmatter = ['mdi: "2.0"', "title: 前付タイトル", "author: 著者名"];

function expectNoFrontmatterLeak(output: string): void {
  for (const field of leakedFrontmatter) {
    expect(output).not.toContain(field);
  }
}

describe("MDI official export format acceptance matrix", () => {
  it("exports a standalone Rust-rendered HTML document", async () => {
    const html = await generateHtml(source, ".mdi");

    expect(html).toMatch(/^<!DOCTYPE html><html\b/);
    expect(html).toContain('<html lang="ja" style="writing-mode: vertical-rl;">');
    expect(html).toContain("<title>前付タイトル</title>");
    expect(html).toContain('<ruby class="mdi-ruby">東京');
    expect(html).toContain('<p class="mdi-blank"></p>');
    expect(html).not.toContain("[[blank]]");
    expectNoFrontmatterLeak(html);
  });

  it("passes the upstream bodyOnly option through without inventing a second renderer", async () => {
    const fragment = await generateHtml(source, ".mdi", { bodyOnly: true });

    expect(fragment).toMatch(/^<h1>第一章<\/h1>/);
    expect(fragment).not.toContain("<!DOCTYPE html>");
    expect(fragment).not.toContain("<html");
    expect(fragment).toContain('<ruby class="mdi-ruby">東京');
    expect(fragment).toContain('<p class="mdi-blank"></p>');
    expectNoFrontmatterLeak(fragment);
  });

  it.each<[TxtExportFormat, string]>([
    ["txt", "東京へ行った。"],
    ["txt-ruby", "{東京|とうきょう}へ行った。"],
    ["narou", "｜東京《とうきょう》へ行った。"],
    ["kakuyomu", "｜東京《とうきょう》へ行った。"],
    ["aozora", "｜東京《とうきょう》へ行った。"],
  ])("exports the Rust-rendered %s text flavor", async (format, expectedBody) => {
    const text = await exportMdiText(source, format, ".mdi");

    expect(text).toContain(expectedBody);
    expect(text).toContain("次の段落。");
    expect(text).not.toContain("[[blank]]");
    expectNoFrontmatterLeak(text);
  });

  it("exports a valid Rust-rendered EPUB 3 archive", async () => {
    const epub = await generateEpub(source, {
      metadata,
      fileType: ".mdi",
      verticalWriting: true,
      fontFamily: "serif",
      textIndent: 1,
      chapterSplitLevel: "h1",
    });
    const files = unzipSync(epub);
    const mimetype = strFromU8(files.mimetype!);
    const packageXml = strFromU8(files["OEBPS/package.opf"]!);
    const navigationXml = strFromU8(files["OEBPS/nav.xhtml"]!);
    const chapterXml = strFromU8(files["OEBPS/chapter-1.xhtml"]!);

    expect(mimetype).toBe("application/epub+zip");
    expect(packageXml).toContain('<package xmlns="http://www.idpf.org/2007/opf" version="3.0"');
    expect(packageXml).toContain("<dc:title>前付タイトル</dc:title>");
    expect(packageXml).toContain("<dc:creator>著者名</dc:creator>");
    expect(packageXml).toContain('page-progression-direction="rtl"');
    expect(navigationXml).toContain('<a href="chapter-1.xhtml">第一章</a>');
    expect(chapterXml).toContain('<ruby class="mdi-ruby">東京');
    expect(chapterXml).toContain('<p class="mdi-blank"></p>');
    expect(chapterXml).not.toContain("[[blank]]");
    expectNoFrontmatterLeak(chapterXml);
  });

  it("exports a valid Rust-rendered OOXML DOCX archive", async () => {
    const docx = await generateDocx(source, {
      metadata,
      fileType: ".mdi",
      settings: {
        ...DEFAULT_EXPORT_SETTINGS,
        verticalWriting: true,
      },
    });
    const files = unzipSync(docx);
    const contentTypes = strFromU8(files["[Content_Types].xml"]!);
    const coreProperties = strFromU8(files["docProps/core.xml"]!);
    const documentXml = strFromU8(files["word/document.xml"]!);

    expect(contentTypes).toContain(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
    );
    expect(coreProperties).toContain("<dc:title>前付タイトル</dc:title>");
    expect(coreProperties).toContain("<dc:creator>著者名</dc:creator>");
    expect(documentXml).toContain("第一章");
    expect(documentXml).toContain("東京");
    expect(documentXml).toContain("とうきょう");
    expect(documentXml).toContain("<w:p/>");
    expect(documentXml).not.toContain("[[blank]]");
    expectNoFrontmatterLeak(documentXml);
  });

  it("prepares Rust-rendered HTML and the complete publication profile for PDF", () => {
    const options: PdfExportOptions = {
      metadata,
      fileType: ".mdi",
      verticalWriting: true,
      pageSize: "A4",
      landscape: false,
      margins: { top: 20, right: 21, bottom: 22, left: 23 },
      charsPerLine: 40,
      linesPerPage: 30,
      fontFamily: "serif",
      showPageNumbers: true,
      pageNumberFormat: "simple",
      pageNumberPosition: "bottom-center",
      textIndent: 1,
    };
    const prepared = preparePdfPrintDocument(source, options);

    expect(prepared.html).toContain("<title>前付タイトル</title>");
    expect(prepared.html).toContain('<ruby class="mdi-ruby">東京');
    expect(prepared.html).toContain('<p class="mdi-blank"></p>');
    expect(prepared.html).toContain("@page{size:210mm 297mm;margin:20mm 21mm 22mm 23mm}");
    expect(prepared.html).toContain("writing-mode:vertical-rl");
    expect(prepared.html).toContain("--mdi-characters-per-line:40");
    expect(prepared.html).toContain("--mdi-lines-per-page:30");
    expect(prepared.profile.metadata).toMatchObject(metadata);
    expect(prepared.profile.pagination).toMatchObject({
      pageSize: "A4",
      landscape: false,
      charactersPerLine: 40,
      linesPerPage: 30,
    });
    expect(prepared.pageNumbers.footerTemplate).toContain('class="pageNumber"');
    expect(prepared.html).not.toContain("[[blank]]");
    expectNoFrontmatterLeak(prepared.html);
  });
});
