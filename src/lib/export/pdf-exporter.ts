/** Electron is only the Chromium host; MDI HTML and publication profile come from Rust. */
import { preparePdfExport } from "@illusions-lab/mdi/node";
import type { ExportProfile } from "@illusions-lab/mdi-export-profile";

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
  fileType?: string;
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

export async function generatePdf(content: string, options: PdfExportOptions): Promise<Buffer> {
  const { BrowserWindow } = await import("electron");
  const request = preparePdfExport(
    normalizeExportSource(content, options.fileType),
    pdfExportProfile(options),
  );
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
    await hiddenWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(request.html)}`);
    return Buffer.from(
      await hiddenWin.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true }),
    );
  } finally {
    hiddenWin.destroy();
  }
}
