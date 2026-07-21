import { describe, expect, it } from "vitest";

import {
  electronPdfOptions,
  electronSystemPrintOptions,
  preparePdfPrintDocument,
  type PdfExportOptions,
} from "../pdf-exporter";

const options: PdfExportOptions = {
  metadata: { title: "組版テスト", author: "著者" },
  verticalWriting: true,
  pageSize: "A4",
  landscape: true,
  margins: { top: 11, right: 12, bottom: 13, left: 14 },
  charsPerLine: 33,
  linesPerPage: 22,
  fontFamily: '"Noto Serif JP", serif',
  googleFontFamily: "Noto Serif JP",
  showPageNumbers: true,
  pageNumberFormat: "fraction",
  pageNumberPosition: "bottom-right",
  textIndent: 2,
  fullwidthSpaceIndent: false,
  fileType: ".mdi",
};

describe("PDF Chromium profile adapter", () => {
  it("applies every publication setting to the shared print document", () => {
    const prepared = preparePdfPrintDocument("# 見出し\n\n本文。\n\n[[blank]]\n\n次。", options);

    expect(prepared.profile.typesetting).toMatchObject({
      writingMode: "vertical",
      fontFamily: '"Noto Serif JP", serif',
      textIndentEm: 2,
    });
    expect(prepared.profile.pagination).toMatchObject({
      pageSize: "A4",
      landscape: true,
      charactersPerLine: 33,
      linesPerPage: 22,
      margins: { top: 11, right: 12, bottom: 13, left: 14 },
      pageNumbers: { enabled: true, format: "fraction", position: "bottom-right" },
    });
    expect(prepared.page).toMatchObject({ widthMm: 297, heightMm: 210, landscape: true });

    expect(prepared.html).toContain("@page{size:297mm 210mm;margin:11mm 12mm 13mm 14mm}");
    expect(prepared.html).toContain("writing-mode:vertical-rl");
    expect(prepared.html).toContain("--mdi-characters-per-line:33");
    expect(prepared.html).toContain("--mdi-lines-per-page:22");
    expect(prepared.html).toContain('font-family:"Noto Serif JP", serif');
    expect(prepared.html).toContain("text-indent:2em");
    expect(prepared.html).toContain('<p class="mdi-blank"></p>');
    expect(prepared.html).not.toContain("[[blank]]");
    expect(prepared.html).toContain(
      "https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@400;700&amp;display=swap",
    );
    expect(prepared.pageNumbers.footerTemplate).toContain('class="pageNumber"');
    expect(prepared.pageNumbers.footerTemplate).toContain('class="totalPages"');
  });

  it("maps page-number templates to Electron PDF without duplicating CSS margins", () => {
    const prepared = preparePdfPrintDocument("本文。", options);
    const printOptions = electronPdfOptions(prepared);

    expect(printOptions).toMatchObject({
      preferCSSPageSize: true,
      printBackground: true,
      margins: { top: 0, right: 0, bottom: 0, left: 0 },
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
    });
    expect(printOptions.footerTemplate).toBe(prepared.pageNumbers.footerTemplate);
  });

  it("maps the physical page profile to Electron system-print microns", () => {
    const prepared = preparePdfPrintDocument("本文。", options);

    expect(electronSystemPrintOptions(prepared)).toEqual({
      silent: false,
      printBackground: true,
      landscape: true,
      pageSize: { width: 210_000, height: 297_000 },
      margins: { marginType: "none" },
    });
  });
});
