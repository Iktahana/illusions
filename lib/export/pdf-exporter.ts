/**
 * PDF exporter for MDI content
 *
 * Uses Electron's BrowserWindow.printToPDF() to render HTML to PDF.
 * This module runs in the Electron main process.
 */

import type { ExportMetadata } from "./types";
import { PAGE_DIMENSIONS } from "./pdf-export-settings";

export interface PdfExportOptions {
  metadata: ExportMetadata;
  verticalWriting?: boolean;
  pageSize?: "A4" | "A5" | "B5" | "B6";
  landscape?: boolean;
  /** Explicit margins in mm. Takes precedence over marginsType. */
  margins?: { top: number; bottom: number; left: number; right: number };
  /** @deprecated Use margins instead */
  marginsType?: 0 | 1 | 2;
  charsPerLine?: number;
  linesPerPage?: number;
  fontFamily?: string;
  showPageNumbers?: boolean;
  /** First-line indent in em units */
  textIndent?: number;
}

/**
 * Calculate font size and line height from page layout parameters.
 *
 * For horizontal writing, chars flow left-to-right → font size derived from page width.
 * For vertical writing, chars flow top-to-bottom → font size derived from page height.
 */
function calculateTypesetting(
  pageSize: string,
  margins: { top: number; bottom: number; left: number; right: number },
  charsPerLine: number,
  linesPerPage: number,
  verticalWriting: boolean,
): { fontSizeMm: number; lineHeightRatio: number } {
  const dims = PAGE_DIMENSIONS[pageSize] ?? PAGE_DIMENSIONS["A5"];

  // Primary axis: direction characters flow along
  // Cross axis: direction lines stack along
  let primarySpan: number;
  let crossSpan: number;

  if (verticalWriting) {
    // Vertical: chars flow top→bottom, lines stack right→left
    primarySpan = dims.height - margins.top - margins.bottom;
    crossSpan = dims.width - margins.left - margins.right;
  } else {
    // Horizontal: chars flow left→right, lines stack top→bottom
    primarySpan = dims.width - margins.left - margins.right;
    crossSpan = dims.height - margins.top - margins.bottom;
  }

  const fontSizeMm = primarySpan / charsPerLine;
  const lineHeightRatio = crossSpan / linesPerPage / fontSizeMm;

  return { fontSizeMm, lineHeightRatio };
}

/**
 * Generate a PDF buffer from MDI markdown content.
 *
 * Creates a hidden BrowserWindow, loads the HTML, and calls printToPDF.
 * The caller is responsible for saving the buffer to disk.
 *
 * @param content - MDI markdown content
 * @param options - PDF export options
 * @returns PDF data as a Buffer
 */
export async function generatePdf(content: string, options: PdfExportOptions): Promise<Buffer> {
  // Dynamic import for Electron (only available in main process at runtime)
  const { BrowserWindow } = await import("electron");
  const { mdiToHtml } = await import("./mdi-to-html");

  // Build typesetting options when chars/lines are specified
  const hasTypesetting = options.charsPerLine != null && options.linesPerPage != null;
  const typesetting = hasTypesetting
    ? (() => {
        const pageSize = options.pageSize ?? "A5";
        const margins = options.margins ?? { top: 20, bottom: 20, left: 15, right: 15 };
        const { fontSizeMm, lineHeightRatio } = calculateTypesetting(
          pageSize,
          margins,
          options.charsPerLine!,
          options.linesPerPage!,
          options.verticalWriting ?? false,
        );
        return {
          fontFamily: options.fontFamily,
          fontSizeMm,
          lineHeightRatio,
          textIndentEm: options.textIndent,
          margins,
        };
      })()
    : undefined;

  const html = mdiToHtml(content, {
    metadata: options.metadata,
    verticalWriting: options.verticalWriting,
    typesetting,
  });

  // Use a unique in-memory partition (no "persist:" prefix) per export so
  // that the CSP webRequest hook is registered on a fresh, isolated session.
  // The session is automatically GC'd when the BrowserWindow is destroyed,
  // preventing hook accumulation on the shared default session (#1034).
  const partition = `pdf-export-${Date.now()}`;
  const hiddenWin = new BrowserWindow({
    show: false,
    width: 800,
    height: 600,
    webPreferences: {
      offscreen: true,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      partition,
    },
  });

  // Set a strict CSP header to block all script execution and data: URLs.
  // This is a defense-in-depth measure alongside html:false in markdown-it
  // and the CSP meta tag in the HTML document.
  // The hook is registered on the isolated per-export partition session,
  // so it never leaks into the shared default session (#1034).
  hiddenWin.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          "default-src 'none'; style-src 'unsafe-inline'; img-src 'self';",
        ],
      },
    });
  });

  try {
    // Register did-finish-load listener BEFORE loadURL to avoid race condition
    // where data: URLs finish loading before the listener is attached (#513)
    const loadPromise = new Promise<void>((resolve) => {
      hiddenWin.webContents.once("did-finish-load", () => resolve());
    });

    // Load HTML content into the hidden window.
    // Uses data: URL which is necessary for inline HTML rendering.
    // The CSP meta tag in the HTML itself blocks script execution.
    await hiddenWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

    // Wait for did-finish-load to fire (guaranteed since listener was registered first)
    await loadPromise;

    // Brief delay to allow CSS paint to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Derive physical dimensions in microns from PAGE_DIMENSIONS (mm)
    const dims = PAGE_DIMENSIONS[options.pageSize ?? "A5"] ?? PAGE_DIMENSIONS["A5"];
    const size = { width: dims.width * 1000, height: dims.height * 1000 };

    // When explicit margins are provided via @page CSS, set printToPDF margins to zero
    // to avoid double-margin. Otherwise fall back to legacy marginsType behavior.
    let pdfMargins: { top: number; bottom: number; left: number; right: number } | undefined;
    if (typesetting?.margins) {
      pdfMargins = { top: 0, bottom: 0, left: 0, right: 0 };
    } else if (options.marginsType === 1) {
      pdfMargins = { top: 0, bottom: 0, left: 0, right: 0 };
    } else if (options.marginsType === 2) {
      pdfMargins = { top: 4, bottom: 4, left: 4, right: 4 };
    }

    // Build printToPDF options
    const printOptions: Electron.PrintToPDFOptions = {
      landscape: options.landscape ?? false,
      pageSize: { width: size.width, height: size.height },
      printBackground: true,
      margins: pdfMargins,
    };

    // Page numbers via Electron's header/footer template
    if (options.showPageNumbers) {
      printOptions.displayHeaderFooter = true;
      printOptions.headerTemplate = "<span></span>";
      printOptions.footerTemplate =
        '<div style="font-size:8px; text-align:center; width:100%; color:#666;">' +
        '<span class="pageNumber"></span> / <span class="totalPages"></span>' +
        "</div>";
    }

    const pdfBuffer = await hiddenWin.webContents.printToPDF(printOptions);

    return Buffer.from(pdfBuffer);
  } finally {
    hiddenWin.destroy();
  }
}
