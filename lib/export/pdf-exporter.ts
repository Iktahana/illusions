/**
 * PDF exporter for MDI content
 *
 * Uses Electron's BrowserWindow.printToPDF() to render HTML to PDF.
 * This module runs in the Electron main process.
 */

import type { ExportMetadata } from "./types";
import { calculateTypesetting, PAGE_DIMENSIONS } from "./pdf-export-settings";

export interface PdfExportOptions {
  metadata: ExportMetadata;
  verticalWriting?: boolean;
  pageSize?: "A4" | "A5" | "B5" | "B6";
  landscape?: boolean;
  /** Margins in mm */
  margins?: { top: number; bottom: number; left: number; right: number };
  charsPerLine?: number;
  linesPerPage?: number;
  fontFamily?: string;
  showPageNumbers?: boolean;
  pageNumberFormat?: "simple" | "dash" | "fraction";
  pageNumberPosition?:
    | "bottom-left"
    | "bottom-center"
    | "bottom-right"
    | "top-left"
    | "top-center"
    | "top-right";
  /** First-line indent in em units */
  textIndent?: number;
  /** Google Font family name — triggers <link> injection and CSP relaxation */
  googleFontFamily?: string;
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
          options.landscape ?? false,
        );
        return {
          fontFamily: options.fontFamily,
          fontSizeMm,
          lineHeightRatio,
          textIndentEm: options.textIndent,
          margins,
          pageSize: options.pageSize ?? "A5",
          landscape: options.landscape ?? false,
        };
      })()
    : undefined;

  const html = mdiToHtml(content, {
    metadata: options.metadata,
    verticalWriting: options.verticalWriting,
    typesetting: typesetting ?? {
      pageSize: options.pageSize ?? "A5",
      landscape: options.landscape ?? false,
      margins: options.margins,
    },
    googleFontFamily: options.googleFontFamily,
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
  // When a Google Font is requested, relax CSP to allow external stylesheet and font sources.
  const hasGoogleFont = !!options.googleFontFamily;
  const exportStyleSrc = hasGoogleFont
    ? "style-src 'unsafe-inline' https://fonts.googleapis.com"
    : "style-src 'unsafe-inline'";
  const exportFontSrc = hasGoogleFont ? " font-src https://fonts.gstatic.com;" : "";
  hiddenWin.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          `default-src 'none'; ${exportStyleSrc}; img-src 'self';${exportFontSrc}`,
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

    // Wait for CSS paint (and Google Font loading if applicable) to complete.
    // Google Fonts need additional time to fetch the stylesheet + font files.
    const paintDelay = hasGoogleFont ? 2000 : 100;
    await new Promise((resolve) => setTimeout(resolve, paintDelay));

    // Convert page dimensions from mm to inches (printToPDF expects inches)
    const dims = PAGE_DIMENSIONS[options.pageSize ?? "A5"] ?? PAGE_DIMENSIONS["A5"];
    const isLandscape = options.landscape ?? false;
    const widthMm = isLandscape ? dims.height : dims.width;
    const heightMm = isLandscape ? dims.width : dims.height;
    const widthInches = widthMm / 25.4;
    const heightInches = heightMm / 25.4;

    // Build printToPDF options
    // Page size, margins, and orientation are controlled via CSS @page rule
    // (generated by mdi-to-html). Use preferCSSPageSize to let CSS take precedence.
    // Set printToPDF margins to zero to avoid double-margin with @page margins.
    const printOptions: Electron.PrintToPDFOptions = {
      pageSize: { width: widthInches, height: heightInches },
      printBackground: true,
      preferCSSPageSize: true,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
    };

    // Page numbers via Electron's header/footer template
    if (options.showPageNumbers) {
      const format = options.pageNumberFormat ?? "simple";
      const position = options.pageNumberPosition ?? "bottom-center";

      // Build page number content based on format
      let pageContent: string;
      switch (format) {
        case "dash":
          pageContent = '- <span class="pageNumber"></span> -';
          break;
        case "fraction":
          pageContent = '<span class="pageNumber"></span> / <span class="totalPages"></span>';
          break;
        default:
          pageContent = '<span class="pageNumber"></span>';
          break;
      }

      // Determine alignment from position
      const align = position.endsWith("-left")
        ? "left"
        : position.endsWith("-right")
          ? "right"
          : "center";
      const padding =
        align === "left" ? "padding-left:10mm;" : align === "right" ? "padding-right:10mm;" : "";
      const template =
        `<div style="font-size:8px; text-align:${align}; width:100%; color:#666; ${padding}">` +
        pageContent +
        "</div>";
      const emptyTemplate = "<span></span>";

      printOptions.displayHeaderFooter = true;
      if (position.startsWith("top-")) {
        printOptions.headerTemplate = template;
        printOptions.footerTemplate = emptyTemplate;
      } else {
        printOptions.headerTemplate = emptyTemplate;
        printOptions.footerTemplate = template;
      }
    }

    const pdfBuffer = await hiddenWin.webContents.printToPDF(printOptions);

    return Buffer.from(pdfBuffer);
  } finally {
    hiddenWin.destroy();
  }
}
