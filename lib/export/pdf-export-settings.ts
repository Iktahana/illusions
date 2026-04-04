/**
 * PDF export settings persistence.
 *
 * Uses localStorage for synchronous read on dialog open,
 * following the same pattern as local-preferences.ts.
 */

export interface PdfExportSettings {
  pageSize: "A4" | "A5" | "B5" | "B6";
  verticalWriting: boolean;
  charsPerLine: number;
  linesPerPage: number;
  margins: { top: number; bottom: number; left: number; right: number };
  fontFamily: string;
  showPageNumbers: boolean;
  textIndent: number;
}

export const DEFAULT_PDF_SETTINGS: PdfExportSettings = {
  pageSize: "A5",
  verticalWriting: true,
  charsPerLine: 30,
  linesPerPage: 17,
  margins: { top: 20, bottom: 20, left: 15, right: 15 },
  fontFamily: "serif",
  showPageNumbers: true,
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
 */
export function calculateTypesetting(
  pageSize: string,
  margins: { top: number; bottom: number; left: number; right: number },
  charsPerLine: number,
  linesPerPage: number,
  verticalWriting: boolean,
): { fontSizeMm: number; lineHeightRatio: number } {
  const dims = PAGE_DIMENSIONS[pageSize] ?? PAGE_DIMENSIONS["A5"];

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
