/** Electron is only the Chromium host; MDI HTML and publication profile come from Rust. */
import { preparePdfExport } from "@illusions-lab/mdi/node";
import type { ExportProfile } from "@illusions-lab/mdi-export-profile";
import {
  prepareChromiumPrintProfile,
  type ChromiumPrintProfile,
} from "@illusions-lab/mdi-to-pdf/profile";
import type { PrintToPDFOptions, WebContents, WebContentsPrintOptions } from "electron";

import { normalizeExportSource } from "./mdi-export";
import type { ExportMetadata } from "./types";

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
  const request = preparePdfExport(
    normalizeExportSource(content, options.fileType),
    pdfExportProfile(options),
  );
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

/** Match the upstream Playwright adapter while using Electron's Chromium. */
export function electronPdfOptions(prepared: ChromiumPrintProfile): PrintToPDFOptions {
  return {
    preferCSSPageSize: true,
    printBackground: true,
    // Profile margins already live in @page. Zero host margins avoid applying
    // Chromium defaults a second time.
    margins: { top: 0, right: 0, bottom: 0, left: 0 },
    displayHeaderFooter: prepared.pageNumbers.enabled,
    headerTemplate: prepared.pageNumbers.headerTemplate ?? EMPTY_PRINT_TEMPLATE,
    footerTemplate: prepared.pageNumbers.footerTemplate ?? EMPTY_PRINT_TEMPLATE,
  };
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

export async function generatePdf(content: string, options: PdfExportOptions): Promise<Buffer> {
  const { BrowserWindow } = await import("electron");
  const prepared = preparePdfPrintDocument(content, options);
  const hiddenWin = new BrowserWindow({
    show: false,
    webPreferences: {
      offscreen: true,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  try {
    await hiddenWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(prepared.html)}`);
    await waitForPrintFonts(hiddenWin.webContents);
    return Buffer.from(await hiddenWin.webContents.printToPDF(electronPdfOptions(prepared)));
  } finally {
    hiddenWin.destroy();
  }
}
