import { describe, expect, it, vi } from "vitest";

import {
  electronPdfOptions,
  electronSystemPrintHtml,
  electronSystemPrintOptions,
  isPrintCancellationReason,
  loadPrintDocumentHtml,
  pdfPreviewPageLimitForMemory,
  pdfPreviewSourceCharacterLimit,
  preparePdfPreviewDocument,
  preparePdfPrintDocument,
  resolvePdfPreviewPagePolicy,
  PDF_PREVIEW_ABSOLUTE_MAX_PAGES,
  PDF_PREVIEW_MAX_SOURCE_CHARACTERS,
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
    expect(electronPdfOptions(prepared, "1-300").pageRanges).toBe("1-300");
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

  it.each(
    (
      [
        ["simple", "content:counter(page)"],
        ["dash", String.raw`content:"\2014 " counter(page) " \2014"`],
        ["fraction", 'content:counter(page) " / " counter(pages)'],
      ] as const
    ).flatMap(([format, expectedContent]) =>
      (
        [
          "bottom-left",
          "bottom-center",
          "bottom-right",
          "top-left",
          "top-center",
          "top-right",
        ] as const
      ).map((position) => [format, position, expectedContent] as const),
    ),
  )(
    "adds %s page counters at %s for Chromium system print",
    (format, position, expectedContent) => {
      const prepared = preparePdfPrintDocument("本文。", {
        ...options,
        pageNumberFormat: format,
        pageNumberPosition: position,
      });
      const html = electronSystemPrintHtml(prepared);

      expect(html).toContain('<style id="mdi-system-print-page-numbers">');
      expect(html).toContain(`@page{@${position}{${expectedContent};`);
      expect(html).toContain("writing-mode:horizontal-tb");
      expect(html).toContain("text-orientation:mixed");
    },
  );

  it("does not inject page counters when page numbering is disabled", () => {
    const prepared = preparePdfPrintDocument("本文。", {
      ...options,
      showPageNumbers: false,
    });

    expect(electronSystemPrintHtml(prepared)).toBe(prepared.html);
  });

  it.each([
    [
      "<html><body><p>本文。</p></body></html>",
      /<html><head><style id="mdi-system-print-page-numbers">/,
    ],
    ["<p>本文。</p>", /^<style id="mdi-system-print-page-numbers">[\s\S]*<\/style><p>本文。<\/p>$/],
  ])("injects page counters into alternate Chromium HTML shells", (html, expected) => {
    const prepared = preparePdfPrintDocument("本文。", options);

    expect(electronSystemPrintHtml({ ...prepared, html })).toMatch(expected);
  });

  it("keeps preview and final export profile semantics identical", () => {
    const content = "# 見出し\n\n本文。";

    expect(preparePdfPreviewDocument(content, options, 32).prepared).toEqual(
      preparePdfPrintDocument(content, options),
    );
  });

  it.each(["cancelled", "canceled", "Print job canceled", "Print job cancelled"])(
    "recognizes the system-print cancellation reason %s",
    (reason) => {
      expect(isPrintCancellationReason(reason)).toBe(true);
    },
  );

  it.each([undefined, null, "", "Invalid printer settings", "Print job failed"])(
    "does not hide the system-print failure reason %s",
    (reason) => {
      expect(isPrintCancellationReason(reason)).toBe(false);
    },
  );

  it("loads large print HTML through an in-memory protocol instead of a data URL", async () => {
    const html = `<!doctype html><html><body>${"長編本文。".repeat(300_000)}</body></html>`;
    let handler: ((request: { url: string }) => Response | Promise<Response>) | undefined;
    const handle = vi.fn(
      (
        _scheme: string,
        nextHandler: (request: { url: string }) => Response | Promise<Response>,
      ) => {
        handler = nextHandler;
      },
    );
    const unhandle = vi.fn();
    const loadURL = vi.fn(async (url: string) => {
      expect(url).toMatch(/^illusions-print-[\da-f-]+:\/\/document\/$/);
      expect(url.length).toBeLessThan(100);
      expect(url).not.toContain(encodeURIComponent(html.slice(0, 100)));
      const response = await handler?.({ url });
      expect(await response?.text()).toBe(html);
      expect(response?.headers.get("content-type")).toBe("text/html; charset=utf-8");
    });
    const window = {
      loadURL,
      webContents: { session: { protocol: { handle, unhandle } } },
    };

    const dispose = await loadPrintDocumentHtml(window as never, html);

    expect(handle).toHaveBeenCalledOnce();
    expect(loadURL).toHaveBeenCalledOnce();
    expect(unhandle).not.toHaveBeenCalled();

    dispose();
    expect(unhandle).toHaveBeenCalledWith(expect.stringMatching(/^illusions-print-/));
  });

  it("unregisters the in-memory protocol when document loading fails", async () => {
    const handle = vi.fn();
    const unhandle = vi.fn();
    const loadURL = vi.fn().mockRejectedValue(new Error("navigation failed"));
    const window = {
      loadURL,
      webContents: { session: { protocol: { handle, unhandle } } },
    };

    await expect(loadPrintDocumentHtml(window as never, "<p>本文</p>")).rejects.toThrow(
      "navigation failed",
    );

    expect(handle).toHaveBeenCalledOnce();
    expect(unhandle).toHaveBeenCalledWith(expect.stringMatching(/^illusions-print-/));
  });
});

describe("memory-adaptive PDF preview", () => {
  const gib = 1024 ** 3;

  it.each([
    [Number.NaN, 32],
    [8 * gib, 32],
    [8 * gib + 1, 100],
    [16 * gib, 100],
    [16 * gib + 1, 200],
    [24 * gib, 200],
    [24 * gib + 1, 300],
    [63 * gib, 300],
    [64 * gib, 500],
    [128 * gib, PDF_PREVIEW_ABSOLUTE_MAX_PAGES],
  ])("maps %s bytes to a %s-page ceiling", (bytes, pages) => {
    expect(pdfPreviewPageLimitForMemory(bytes)).toBe(pages);
  });

  it.each([32, 100, 200, 300, 500])("accepts the supported manual limit %s", (maxPages) => {
    expect(resolvePdfPreviewPagePolicy(8 * gib, maxPages)).toEqual({
      automaticMaxPages: 32,
      maxPages,
    });
  });

  it.each([undefined, null, 0, 1, 31, 33, 501, 500.1, Number.NaN, Infinity, "300"])(
    "falls back to automatic for the untrusted override %s",
    (requestedMaxPages) => {
      expect(resolvePdfPreviewPagePolicy(32 * gib, requestedMaxPages)).toEqual({
        automaticMaxPages: 300,
        maxPages: 300,
      });
    },
  );

  it("derives the source budget from the selected layout and caps extreme grids", () => {
    expect(pdfPreviewSourceCharacterLimit(options, 32)).toBe(33 * 22 * 32);
    expect(pdfPreviewSourceCharacterLimit(options, 300)).toBe(33 * 22 * 300);
    expect(
      pdfPreviewSourceCharacterLimit(
        { ...options, charsPerLine: 10_000, linesPerPage: 10_000 },
        500,
      ),
    ).toBe(PDF_PREVIEW_MAX_SOURCE_CHARACTERS);
  });

  it("prepares only the bounded source and does not split a surrogate pair", () => {
    const limitedOptions = { ...options, charsPerLine: 10, linesPerPage: 10 };
    const source = `${"あ".repeat(3_199)}😀末尾`;
    const result = preparePdfPreviewDocument(source, limitedOptions, 32);

    expect(result.maxPages).toBe(32);
    expect(result.sourceCharacterLimit).toBe(3_200);
    expect(result.sourceTruncated).toBe(true);
    expect(result.prepared.html).not.toContain("�");
    expect(result.prepared.html).not.toContain("末尾");
  });
});
