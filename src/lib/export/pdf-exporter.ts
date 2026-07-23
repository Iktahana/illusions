/** Electron is only the Chromium host; MDI HTML and publication profile come from Rust. */
import { preparePdfExport } from "@illusions-lab/mdi/node";
import type { ExportProfile } from "@illusions-lab/mdi-export-profile";
import {
  prepareChromiumPrintProfile,
  type ChromiumPrintProfile,
} from "@illusions-lab/mdi-to-pdf/profile";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  BrowserWindow,
  PrintToPDFOptions,
  WebContents,
  WebContentsPrintOptions,
} from "electron";

import { normalizeExportSource } from "./mdi-export";
import { PDF_PREVIEW_ABSOLUTE_MAX_PAGES, PDF_PREVIEW_DEFAULT_PAGES } from "./pdf-preview-limits";
import type { ExportMetadata } from "./types";

export {
  PDF_PREVIEW_ABSOLUTE_MAX_PAGES,
  PDF_PREVIEW_DEFAULT_PAGES,
  PDF_PREVIEW_LOW_MEMORY_PAGES,
  PDF_PREVIEW_MANUAL_PAGE_LIMITS,
  pdfPreviewPageLimitForMemory,
  resolvePdfPreviewPagePolicy,
} from "./pdf-preview-limits";

export interface PdfExportOptions {
  metadata: ExportMetadata;
  verticalWriting?: boolean;
  pageSize?: string;
  landscape?: boolean;
  margins?: { top: number; bottom: number; left: number; right: number };
  charsPerLine?: number;
  linesPerPage?: number;
  fontFamily?: string;
  showPageNumbers?: boolean;
  pageNumberFormat?: "simple" | "dash" | "fraction";
  pageNumberPosition?:
    "bottom-left" | "bottom-center" | "bottom-right" | "top-left" | "top-center" | "top-right";
  textIndent?: number;
  fullwidthSpaceIndent?: boolean;
  googleFontFamily?: string;
  fileType?: string;
}

const EMPTY_PRINT_TEMPLATE = "<span></span>";
const MICRONS_PER_MM = 1000;
const PRINT_DOCUMENT_SCHEME_PREFIX = "illusions-print";
const SYSTEM_PRINT_PAGE_NUMBER_STYLE_ID = "mdi-system-print-page-numbers";
const PDF_FILE_WRITE_CHUNK_BYTES = 1024 * 1024;
const DEFAULT_CHARACTERS_PER_LINE = 40;
const DEFAULT_LINES_PER_PAGE = 30;

/**
 * A second safety ceiling for unusual page grids. One million Japanese
 * characters is already roughly 1,000 pages in the default 40 × 30 layout.
 */
export const PDF_PREVIEW_MAX_SOURCE_CHARACTERS = 1_000_000;

export interface PdfRenderControl {
  signal?: AbortSignal;
  pageRanges?: string;
}

export interface PdfPreviewResult {
  pdf: Buffer;
  maxPages: number;
  sourceCharacterLimit: number;
  sourceTruncated: boolean;
}

export interface PdfPreviewControl extends Omit<PdfRenderControl, "pageRanges"> {
  maxPages?: number;
}

function injectGoogleFontStylesheet(html: string, fontFamily?: string): string {
  const family = fontFamily?.trim();
  if (!family) return html;

  const fontUrl = encodeURIComponent(family).replace(/%20/g, "+");
  const link = `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${fontUrl}:wght@400;700&amp;display=swap">`;

  if (/<\/head\s*>/i.test(html)) {
    return html.replace(/<\/head\s*>/i, `${link}</head>`);
  }
  return `${link}${html}`;
}

export function pdfExportProfile(options: PdfExportOptions): ExportProfile {
  return {
    layout: { system: "japanese-publisher" },
    metadata: options.metadata,
    typesetting: {
      writingMode: options.verticalWriting ? "vertical" : "horizontal",
      fontFamily: options.fontFamily,
      textIndentEm: options.textIndent,
      fullwidthSpaceIndent: options.fullwidthSpaceIndent,
    },
    pagination: {
      pageSize: options.pageSize as NonNullable<ExportProfile["pagination"]>["pageSize"],
      landscape: options.landscape,
      charactersPerLine: options.charsPerLine,
      linesPerPage: options.linesPerPage,
      margins: options.margins,
      pageNumbers: {
        enabled: options.showPageNumbers,
        format: options.pageNumberFormat,
        position: options.pageNumberPosition,
      },
    },
  };
}

/**
 * Prepare the single Chromium document used by preview, PDF export, and system
 * print. MDI owns semantic HTML; mdi-to-pdf owns all publication CSS/profile
 * resolution; Electron only hosts the resulting document.
 */
export function preparePdfPrintDocument(
  content: string,
  options: PdfExportOptions,
): ChromiumPrintProfile {
  return prepareNormalizedPdfPrintDocument(
    normalizeExportSource(content, options.fileType),
    options,
  );
}

function prepareNormalizedPdfPrintDocument(
  normalizedSource: string,
  options: PdfExportOptions,
): ChromiumPrintProfile {
  const request = preparePdfExport(normalizedSource, pdfExportProfile(options));
  const prepared = prepareChromiumPrintProfile(
    request.html,
    request.profile,
    request.sourceWritingMode,
  );

  return {
    ...prepared,
    html: injectGoogleFontStylesheet(prepared.html, options.googleFontFamily),
  };
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback;
}

/** Estimate the source required to fill the preview's page budget. */
export function pdfPreviewSourceCharacterLimit(
  options: PdfExportOptions,
  maxPages = PDF_PREVIEW_DEFAULT_PAGES,
): number {
  const charactersPerLine = positiveInteger(options.charsPerLine, DEFAULT_CHARACTERS_PER_LINE);
  const linesPerPage = positiveInteger(options.linesPerPage, DEFAULT_LINES_PER_PAGE);
  return Math.min(
    PDF_PREVIEW_MAX_SOURCE_CHARACTERS,
    charactersPerLine * linesPerPage * positiveInteger(maxPages, PDF_PREVIEW_DEFAULT_PAGES),
  );
}

function sliceWithoutSplittingSurrogatePair(source: string, limit: number): string {
  if (source.length <= limit) return source;
  let end = limit;
  const previous = source.charCodeAt(end - 1);
  const next = source.charCodeAt(end);
  if (previous >= 0xd800 && previous <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) {
    end -= 1;
  }
  return source.slice(0, end);
}

export function preparePdfPreviewDocument(
  content: string,
  options: PdfExportOptions,
  maxPages = PDF_PREVIEW_DEFAULT_PAGES,
): Omit<PdfPreviewResult, "pdf"> & { prepared: ChromiumPrintProfile } {
  const normalizedSource = normalizeExportSource(content, options.fileType);
  const sourceCharacterLimit = pdfPreviewSourceCharacterLimit(options, maxPages);
  const previewSource = sliceWithoutSplittingSurrogatePair(normalizedSource, sourceCharacterLimit);

  return {
    prepared: prepareNormalizedPdfPrintDocument(previewSource, options),
    maxPages,
    sourceCharacterLimit,
    sourceTruncated: previewSource.length < normalizedSource.length,
  };
}

/** Match the upstream Playwright adapter while using Electron's Chromium. */
export function electronPdfOptions(
  prepared: ChromiumPrintProfile,
  pageRanges?: string,
): PrintToPDFOptions {
  return {
    preferCSSPageSize: true,
    printBackground: true,
    // Profile margins already live in @page. Zero host margins avoid applying
    // Chromium defaults a second time.
    margins: { top: 0, right: 0, bottom: 0, left: 0 },
    displayHeaderFooter: prepared.pageNumbers.enabled,
    headerTemplate: prepared.pageNumbers.headerTemplate ?? EMPTY_PRINT_TEMPLATE,
    footerTemplate: prepared.pageNumbers.footerTemplate ?? EMPTY_PRINT_TEMPLATE,
    ...(pageRanges ? { pageRanges } : {}),
  };
}

function systemPrintPageNumberContent(
  format: ChromiumPrintProfile["pageNumbers"]["format"],
): string {
  switch (format) {
    case "dash":
      return String.raw`"\2014 " counter(page) " \2014"`;
    case "fraction":
      return 'counter(page) " / " counter(pages)';
    default:
      return "counter(page)";
  }
}

/**
 * Add Chromium page-margin counters for native/system print.
 *
 * printToPDF accepts the upstream header/footer HTML templates directly, but
 * webContents.print() does not. Modern Chromium prints CSS @page margin boxes,
 * so system print can preserve the same resolved page-number semantics without
 * reimplementing pagination or typesetting.
 */
export function electronSystemPrintHtml(prepared: ChromiumPrintProfile): string {
  if (!prepared.pageNumbers.enabled) return prepared.html;

  const marginBox = `@${prepared.pageNumbers.position}`;
  const content = systemPrintPageNumberContent(prepared.pageNumbers.format);
  const style =
    `<style id="${SYSTEM_PRINT_PAGE_NUMBER_STYLE_ID}">` +
    `@page{${marginBox}{content:${content};font-family:sans-serif;font-size:8pt;` +
    "font-weight:normal;color:#000;writing-mode:horizontal-tb;text-orientation:mixed}}" +
    "</style>";

  if (/<\/head\s*>/i.test(prepared.html)) {
    return prepared.html.replace(/<\/head\s*>/i, `${style}</head>`);
  }
  if (/<html(?:\s[^>]*)?>/i.test(prepared.html)) {
    return prepared.html.replace(/<html(?:\s[^>]*)?>/i, `$&<head>${style}</head>`);
  }
  return `${style}${prepared.html}`;
}

/** Convert physical profile metadata to webContents.print() host options. */
export function electronSystemPrintOptions(
  prepared: ChromiumPrintProfile,
): WebContentsPrintOptions {
  // Electron's custom print page size uses portrait dimensions in microns;
  // landscape is represented separately. prepareChromiumPrintProfile exposes
  // dimensions after orientation, so swap them back for the host API.
  const portraitWidthMm = prepared.page.landscape ? prepared.page.heightMm : prepared.page.widthMm;
  const portraitHeightMm = prepared.page.landscape ? prepared.page.widthMm : prepared.page.heightMm;

  return {
    silent: false,
    printBackground: true,
    landscape: prepared.page.landscape,
    pageSize: {
      width: Math.round(portraitWidthMm * MICRONS_PER_MM),
      height: Math.round(portraitHeightMm * MICRONS_PER_MM),
    },
    // The profile's @page rule is the only margin source.
    margins: { marginType: "none" },
  };
}

/** Electron uses platform-dependent spelling and may prefix cancellation text. */
export function isPrintCancellationReason(reason: unknown): boolean {
  return typeof reason === "string" && /\bcancel(?:l)?ed\b/i.test(reason);
}

/** Wait for local/remote fonts without letting a network failure hang export. */
export async function waitForPrintFonts(webContents: WebContents, timeoutMs = 10_000) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      webContents.executeJavaScript(
        "document.fonts ? document.fonts.ready.then(() => true) : Promise.resolve(true)",
        true,
      ),
      new Promise<void>((resolve) => {
        timeout = setTimeout(resolve, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

/**
 * Load generated print HTML without embedding the document in a data URL.
 *
 * Chromium limits URLs to roughly 2 MB. Percent-encoding Japanese prose can
 * expand each character to nine URL characters, so a normal novel can exceed
 * that limit even though the source itself is well below our export limit.
 * A one-shot in-memory protocol keeps the URL short and avoids writing the
 * manuscript to a temporary file.
 */
export async function loadPrintDocumentHtml(
  window: BrowserWindow,
  html: string,
): Promise<() => void> {
  const scheme = `${PRINT_DOCUMENT_SCHEME_PREFIX}-${randomUUID()}`;
  const documentUrl = `${scheme}://document/`;
  const protocol = window.webContents.session.protocol;

  protocol.handle(scheme, (request) => {
    if (request.url !== documentUrl) {
      return new Response(null, { status: 404 });
    }
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  });

  try {
    await window.loadURL(documentUrl);
  } catch (error) {
    protocol.unhandle(scheme);
    throw error;
  }

  return () => protocol.unhandle(scheme);
}

function pdfCancelledError(): Error {
  const error = new Error("PDF generation cancelled");
  error.name = "AbortError";
  return error;
}

function throwIfPdfCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw pdfCancelledError();
}

async function withPreparedPrintWindow<T>(
  prepared: ChromiumPrintProfile,
  control: PdfRenderControl,
  operation: (window: BrowserWindow) => Promise<T>,
): Promise<T> {
  throwIfPdfCancelled(control.signal);
  const { BrowserWindow } = await import("electron");
  const hiddenWin = new BrowserWindow({
    show: false,
    webPreferences: {
      offscreen: true,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  let disposePrintDocument: (() => void) | undefined;
  const abort = () => {
    if (!hiddenWin.isDestroyed()) hiddenWin.destroy();
  };
  control.signal?.addEventListener("abort", abort, { once: true });

  try {
    // The signal may have been aborted while the dynamic Electron import or
    // BrowserWindow construction was in progress. Avoid loading a potentially
    // huge manuscript into a window that is already obsolete.
    throwIfPdfCancelled(control.signal);
    disposePrintDocument = await loadPrintDocumentHtml(hiddenWin, prepared.html);
    throwIfPdfCancelled(control.signal);
    await waitForPrintFonts(hiddenWin.webContents);
    throwIfPdfCancelled(control.signal);
    return await operation(hiddenWin);
  } catch (error) {
    if (control.signal?.aborted) throw pdfCancelledError();
    throw error;
  } finally {
    control.signal?.removeEventListener("abort", abort);
    if (!hiddenWin.isDestroyed()) hiddenWin.destroy();
    disposePrintDocument?.();
  }
}

async function renderPreparedPdf(
  prepared: ChromiumPrintProfile,
  control: PdfRenderControl = {},
): Promise<Buffer> {
  return withPreparedPrintWindow(prepared, control, async (window) => {
    const pdf = await window.webContents.printToPDF(
      electronPdfOptions(prepared, control.pageRanges),
    );
    throwIfPdfCancelled(control.signal);
    return pdf;
  });
}

export async function generatePdfPreview(
  content: string,
  options: PdfExportOptions,
  control: PdfPreviewControl = {},
): Promise<PdfPreviewResult> {
  const maxPages = Math.min(
    positiveInteger(control.maxPages, PDF_PREVIEW_DEFAULT_PAGES),
    PDF_PREVIEW_ABSOLUTE_MAX_PAGES,
  );
  const preview = preparePdfPreviewDocument(content, options, maxPages);
  const pdf = await renderPreparedPdf(preview.prepared, {
    signal: control.signal,
    pageRanges: `1-${preview.maxPages}`,
  });
  return {
    pdf,
    maxPages: preview.maxPages,
    sourceCharacterLimit: preview.sourceCharacterLimit,
    sourceTruncated: preview.sourceTruncated,
  };
}

async function writeChunkFully(
  fileHandle: Awaited<ReturnType<typeof fs.open>>,
  chunk: Buffer,
): Promise<void> {
  let offset = 0;
  while (offset < chunk.byteLength) {
    const { bytesWritten } = await fileHandle.write(chunk, offset, chunk.byteLength - offset);
    if (bytesWritten <= 0) throw new Error("PDF file write made no progress");
    offset += bytesWritten;
  }
}

async function writePreparedPdfToFile(
  prepared: ChromiumPrintProfile,
  target: string,
  control: Omit<PdfRenderControl, "pageRanges"> = {},
): Promise<void> {
  const resolvedTarget = path.resolve(target);
  const temporaryPath = path.join(
    path.dirname(resolvedTarget),
    `.${path.basename(resolvedTarget)}.${process.pid}.${randomUUID()}.tmp`,
  );
  let fileHandle: Awaited<ReturnType<typeof fs.open>> | undefined;
  let committed = false;

  try {
    const pdf = await renderPreparedPdf(prepared, control);
    throwIfPdfCancelled(control.signal);
    fileHandle = await fs.open(temporaryPath, "wx");
    for (let offset = 0; offset < pdf.byteLength; offset += PDF_FILE_WRITE_CHUNK_BYTES) {
      throwIfPdfCancelled(control.signal);
      await writeChunkFully(fileHandle, pdf.subarray(offset, offset + PDF_FILE_WRITE_CHUNK_BYTES));
    }
    await fileHandle.sync();
    await fileHandle.close();
    fileHandle = undefined;
    await fs.rename(temporaryPath, resolvedTarget);
    committed = true;
  } finally {
    await fileHandle?.close().catch(() => undefined);
    if (!committed) await fs.unlink(temporaryPath).catch(() => undefined);
  }
}

/** Generate the complete document and write it atomically to the selected path. */
export async function writePdfToFile(
  content: string,
  options: PdfExportOptions,
  target: string,
  control: Omit<PdfRenderControl, "pageRanges"> = {},
): Promise<void> {
  await writePreparedPdfToFile(preparePdfPrintDocument(content, options), target, control);
}
