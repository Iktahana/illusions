/**
 * DOCX export settings persistence.
 *
 * Uses localStorage with deep merge and range sanitization.
 * Font mapping handles Office-style ascii/eastAsia/hAnsi slots
 * for proper Japanese font rendering in Word.
 */

import { PAGE_DIMENSIONS } from "./pdf-export-settings";

export type DocxPageSize = "A4" | "A5" | "B5" | "B6";

export interface DocxExportSettings {
  pageSize: DocxPageSize;
  landscape: boolean;
  fontFamily: string;
  fontSize: number;
  lineSpacing: number;
  margins: { top: number; bottom: number; left: number; right: number };
  textIndent: number;
  showPageNumbers: boolean;
}

export const DEFAULT_DOCX_SETTINGS: DocxExportSettings = {
  pageSize: "A5",
  landscape: false,
  fontFamily: "Yu Mincho",
  fontSize: 12,
  lineSpacing: 1.5,
  margins: { top: 20, bottom: 20, left: 20, right: 20 },
  textIndent: 1,
  showPageNumbers: false,
};

/** Office font descriptor for docx library's run font property */
export interface DocxFontConfig {
  ascii: string;
  eastAsia: string;
  hAnsi: string;
}

/**
 * Map a display font name to Office-style font slots.
 *
 * eastAsia receives the Japanese name so Word resolves the font
 * correctly on Japanese OS locales. ascii/hAnsi receive the
 * Latin-script name for Western character fallback.
 */
const FONT_MAP: Record<string, DocxFontConfig> = {
  "Yu Mincho": { ascii: "Yu Mincho", eastAsia: "游明朝", hAnsi: "Yu Mincho" },
  "Yu Gothic": { ascii: "Yu Gothic", eastAsia: "游ゴシック", hAnsi: "Yu Gothic" },
  "Hiragino Mincho ProN": {
    ascii: "Hiragino Mincho ProN",
    eastAsia: "ヒラギノ明朝 ProN",
    hAnsi: "Hiragino Mincho ProN",
  },
  "Noto Serif JP": { ascii: "Noto Serif JP", eastAsia: "Noto Serif JP", hAnsi: "Noto Serif JP" },
};

export function toDocxFont(fontFamily: string): DocxFontConfig {
  return FONT_MAP[fontFamily] ?? { ascii: fontFamily, eastAsia: fontFamily, hAnsi: fontFamily };
}

// --- Unit conversion ---

/** 1 mm = 56.692913… twips (1 inch = 25.4 mm, 1 inch = 1440 twips) */
export function mmToTwips(mm: number): number {
  return Math.round(mm * (1440 / 25.4));
}

/** 1 em at a given font size in pt → twips (1 pt = 20 twips) */
export function emToTwips(em: number, fontSizePt: number): number {
  return Math.round(em * fontSizePt * 20);
}

/** Font size in pt → half-points (docx library uses half-points for run.size) */
export function ptToHalfPoints(pt: number): number {
  return Math.round(pt * 2);
}

/** Line spacing multiplier → twips (240 twips = single spacing) */
export function lineSpacingToTwips(multiplier: number): number {
  return Math.round(multiplier * 240);
}

// --- Persistence ---

const STORAGE_KEY = "illusions:docx-export-settings";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sanitizeSettings(raw: Partial<DocxExportSettings>): DocxExportSettings {
  const d = DEFAULT_DOCX_SETTINGS;
  const validPageSizes: DocxPageSize[] = ["A4", "A5", "B5", "B6"];
  const pageSize = validPageSizes.includes(raw.pageSize as DocxPageSize)
    ? (raw.pageSize as DocxPageSize)
    : d.pageSize;

  const rawMargins = raw.margins;
  const hasMargins = typeof rawMargins === "object" && rawMargins !== null;

  return {
    pageSize,
    landscape: typeof raw.landscape === "boolean" ? raw.landscape : d.landscape,
    fontFamily:
      typeof raw.fontFamily === "string" && raw.fontFamily ? raw.fontFamily : d.fontFamily,
    fontSize: typeof raw.fontSize === "number" ? clamp(raw.fontSize, 8, 20) : d.fontSize,
    lineSpacing:
      typeof raw.lineSpacing === "number" ? clamp(raw.lineSpacing, 1.0, 3.0) : d.lineSpacing,
    margins: {
      top:
        hasMargins && typeof rawMargins.top === "number"
          ? clamp(rawMargins.top, 0, 50)
          : d.margins.top,
      bottom:
        hasMargins && typeof rawMargins.bottom === "number"
          ? clamp(rawMargins.bottom, 0, 50)
          : d.margins.bottom,
      left:
        hasMargins && typeof rawMargins.left === "number"
          ? clamp(rawMargins.left, 0, 50)
          : d.margins.left,
      right:
        hasMargins && typeof rawMargins.right === "number"
          ? clamp(rawMargins.right, 0, 50)
          : d.margins.right,
    },
    textIndent: typeof raw.textIndent === "number" ? clamp(raw.textIndent, 0, 4) : d.textIndent,
    showPageNumbers:
      typeof raw.showPageNumbers === "boolean" ? raw.showPageNumbers : d.showPageNumbers,
  };
}

export function loadDocxExportSettings(): DocxExportSettings {
  if (typeof window === "undefined") return { ...DEFAULT_DOCX_SETTINGS };

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_DOCX_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<DocxExportSettings>;
    return sanitizeSettings(parsed);
  } catch {
    return { ...DEFAULT_DOCX_SETTINGS };
  }
}

export function saveDocxExportSettings(settings: DocxExportSettings): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // localStorage quota exceeded — silently ignore
  }
}

export { PAGE_DIMENSIONS };
