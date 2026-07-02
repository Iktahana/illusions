/**
 * PDF export settings types and typesetting calculation.
 *
 * Persistence lives in export-settings.ts (unified settings via StorageService).
 * The legacy localStorage key "illusions:pdf-export-settings" is only read
 * there for one-time migration.
 */

export interface PdfExportSettings {
  pageSize: string;
  landscape: boolean;
  verticalWriting: boolean;
  charsPerLine: number;
  linesPerPage: number;
  margins: { top: number; bottom: number; left: number; right: number };
  fontFamily: string;
  showPageNumbers: boolean;
  pageNumberFormat: "simple" | "dash" | "fraction";
  pageNumberPosition:
    "bottom-left" | "bottom-center" | "bottom-right" | "top-left" | "top-center" | "top-right";
  textIndent: number;
  /**
   * Render 字下げ as literal full-width spaces (U+3000) prepended to each
   * paragraph instead of a CSS `text-indent`. Count is derived from `textIndent`
   * (rounded). Default/absent → false.
   */
  fullwidthSpaceIndent?: boolean;
  /** Google Font family name for PDF export (triggers <link> injection) */
  googleFontFamily?: string;
}

export const DEFAULT_PDF_SETTINGS: PdfExportSettings = {
  pageSize: "A4",
  landscape: true,
  verticalWriting: true,
  charsPerLine: 40,
  linesPerPage: 30,
  margins: { top: 35, bottom: 30, left: 30, right: 40 },
  fontFamily: "serif",
  showPageNumbers: true,
  pageNumberFormat: "simple",
  pageNumberPosition: "bottom-center",
  textIndent: 1,
  fullwidthSpaceIndent: false,
};

// Import and re-export comprehensive page dimensions from page-sizes module
import { PAGE_DIMENSIONS } from "./page-sizes";
export { PAGE_DIMENSIONS };

/**
 * Calculate font size and line height from page layout parameters.
 *
 * For horizontal writing, chars flow left-to-right → font size derived from page width.
 * For vertical writing, chars flow top-to-bottom → font size derived from page height.
 * For landscape orientation, the page width and height are swapped before calculation.
 */
export function calculateTypesetting(
  pageSize: string,
  margins: { top: number; bottom: number; left: number; right: number },
  charsPerLine: number,
  linesPerPage: number,
  verticalWriting: boolean,
  landscape: boolean = false,
): { fontSizeMm: number; lineHeightRatio: number } {
  const base = PAGE_DIMENSIONS[pageSize] ?? PAGE_DIMENSIONS["A5"];
  // Swap width/height when landscape
  const dims = landscape ? { width: base.height, height: base.width } : base;

  let primarySpan: number;
  let crossSpan: number;

  if (verticalWriting) {
    primarySpan = dims.height - margins.top - margins.bottom;
    crossSpan = dims.width - margins.left - margins.right;
  } else {
    primarySpan = dims.width - margins.left - margins.right;
    crossSpan = dims.height - margins.top - margins.bottom;
  }

  const fontSizeMm = primarySpan / charsPerLine;
  const lineHeightRatio = crossSpan / linesPerPage / fontSizeMm;

  return { fontSizeMm, lineHeightRatio };
}
