/**
 * PDF exporter for MDI content
 *
 * Uses Electron's BrowserWindow.printToPDF() to render HTML to PDF.
 * This module runs in the Electron main process.
 */

import type { ExportMetadata } from "./types";

export interface PdfExportOptions {
  metadata: ExportMetadata;
  verticalWriting?: boolean;
  pageSize?: "A4" | "A5" | "B5" | "B6";
  landscape?: boolean;
  marginsType?: 0 | 1 | 2; // 0=default, 1=none, 2=minimum
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
export async function generatePdf(
  content: string,
  options: PdfExportOptions
): Promise<Buffer> {
  // Dynamic import for Electron (only available in main process at runtime)
  const { BrowserWindow } = await import("electron");
  const { mdiToHtml } = await import("./mdi-to-html");

  const html = mdiToHtml(content, {
    metadata: options.metadata,
    verticalWriting: options.verticalWriting,
  });

  const hiddenWin = new BrowserWindow({
    show: false,
    width: 800,
    height: 600,
    webPreferences: {
      offscreen: true,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  // Set a strict CSP header to block all script execution and data: URLs.
  // This is a defense-in-depth measure alongside html:false in markdown-it
  // and the CSP meta tag in the HTML document.
  hiddenWin.webContents.session.webRequest.onHeadersReceived(
    (details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          "Content-Security-Policy": [
            "default-src 'none'; style-src 'unsafe-inline'; img-src 'self';",
          ],
        },
      });
    }
  );

  try {
    // Load HTML content into the hidden window.
    // Uses data: URL which is necessary for inline HTML rendering.
    // The CSP meta tag in the HTML itself blocks script execution.
    await hiddenWin.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
    );

    // Wait for content to render
    await new Promise<void>((resolve) => {
      hiddenWin.webContents.once("did-finish-load", () => resolve());
      // Fallback timeout in case did-finish-load already fired
      setTimeout(() => resolve(), 1000);
    });

    // Map page size to physical dimensions in microns
    const pageSizes: Record<string, { width: number; height: number }> = {
      A4: { width: 210000, height: 297000 },
      A5: { width: 148000, height: 210000 },
      B5: { width: 176000, height: 250000 },
      B6: { width: 125000, height: 176000 },
    };

    const size = pageSizes[options.pageSize ?? "A5"];

    const pdfBuffer = await hiddenWin.webContents.printToPDF({
      landscape: options.landscape ?? false,
      pageSize: { width: size.width, height: size.height },
      printBackground: true,
      margins:
        options.marginsType === 1
          ? { top: 0, bottom: 0, left: 0, right: 0 }
          : options.marginsType === 2
            ? { top: 4, bottom: 4, left: 4, right: 4 }
            : undefined,
    });

    return Buffer.from(pdfBuffer);
  } finally {
    hiddenWin.destroy();
  }
}
