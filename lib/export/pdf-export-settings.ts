/**
 * PDF export settings persistence.
 *
 * Uses localStorage for synchronous read on dialog open,
 * following the same pattern as local-preferences.ts.
 */

export interface PdfExportSettings {
  pageSize: "A4" | "A5" | "B5" | "B6";
  landscape: boolean;
  verticalWriting: boolean;
  charsPerLine: number;
  linesPerPage: number;
  margins: { top: number; bottom: number; left: number; right: number };
  fontFamily: string;
  showPageNumbers: boolean;
  pageNumberFormat: "simple" | "dash" | "fraction";
  pageNumberPosition:
    | "bottom-left"
    | "bottom-center"
    | "bottom-right"
    | "top-left"
    | "top-center"
    | "top-right";
  textIndent: number;
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
};

/** Page dimensions in mm */
export const PAGE_DIMENSIONS: Record<string, { width: number; height: number }> = {
  A4: { width: 210, height: 297 },
  A5: { width: 148, height: 210 },
  B5: { width: 176, height: 250 },
  B6: { width: 125, height: 176 },
};

const STORAGE_KEY = "illusions:pdf-export-settings";

export function loadPdfExportSettings(): PdfExportSettings {
  if (typeof window === "undefined") return { ...DEFAULT_PDF_SETTINGS };

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PDF_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<PdfExportSettings>;
    return { ...DEFAULT_PDF_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_PDF_SETTINGS };
  }
}

export function savePdfExportSettings(settings: PdfExportSettings): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // localStorage quota exceeded — silently ignore
  }
}

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
