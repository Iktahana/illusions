/**
 * Unified export settings for PDF and DOCX.
 *
 * Uses charsPerLine / linesPerPage as the canonical typesetting model
 * (more expressive than raw fontSize + lineSpacing). DOCX-specific values
 * are derived at export time via toDocxExportSettings().
 *
 * Migrates from legacy per-format localStorage keys on first load.
 */

import { calculateTypesetting, PAGE_DIMENSIONS } from "./pdf-export-settings";
import { ALL_JAPANESE_FONTS } from "@/lib/utils/fonts";

import type { PdfExportSettings } from "./pdf-export-settings";
import type { DocxExportSettings } from "./docx-export-settings";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExportPageSize = "A4" | "A5" | "B5" | "B6";

export type PageNumberFormat = "simple" | "dash" | "fraction";
export type PageNumberPosition =
  | "bottom-left"
  | "bottom-center"
  | "bottom-right"
  | "top-left"
  | "top-center"
  | "top-right";

export interface UnifiedExportSettings {
  pageSize: ExportPageSize;
  landscape: boolean;
  verticalWriting: boolean;
  charsPerLine: number;
  linesPerPage: number;
  margins: { top: number; bottom: number; left: number; right: number };
  fontFamily: string; // font family name or legacy canonical key
  showPageNumbers: boolean;
  pageNumberFormat: PageNumberFormat;
  pageNumberPosition: PageNumberPosition;
  textIndent: number;
}

export const DEFAULT_EXPORT_SETTINGS: UnifiedExportSettings = {
  pageSize: "A4",
  landscape: true,
  verticalWriting: true,
  charsPerLine: 40,
  linesPerPage: 30,
  margins: { top: 34, bottom: 28, left: 28, right: 45 },
  fontFamily: "serif",
  showPageNumbers: true,
  pageNumberFormat: "simple",
  pageNumberPosition: "bottom-center",
  textIndent: 1,
};

// ---------------------------------------------------------------------------
// Font mapping
// ---------------------------------------------------------------------------

export interface FontOption {
  key: string;
  label: string;
  css: string;
  docx: string;
}

export const FONT_OPTIONS: FontOption[] = [
  {
    key: "serif",
    label: "明朝体（既定）",
    css: "serif",
    docx: "Yu Mincho",
  },
  {
    key: "yu-mincho",
    label: "游明朝",
    css: '"游明朝", "Yu Mincho", serif',
    docx: "Yu Mincho",
  },
  {
    key: "hiragino",
    label: "ヒラギノ明朝",
    css: '"ヒラギノ明朝 ProN", "Hiragino Mincho ProN", serif',
    docx: "Hiragino Mincho ProN",
  },
  {
    key: "noto-serif",
    label: "Noto Serif JP",
    css: '"Noto Serif JP", serif',
    docx: "Noto Serif JP",
  },
  {
    key: "sans-serif",
    label: "ゴシック体",
    css: "sans-serif",
    docx: "Yu Gothic",
  },
  {
    key: "yu-gothic",
    label: "游ゴシック",
    css: '"游ゴシック", "Yu Gothic", sans-serif',
    docx: "Yu Gothic",
  },
];

/** CSS font-family string → canonical key. Falls back to "serif". */
export function cssToFontKey(css: string): string {
  const match = FONT_OPTIONS.find((o) => o.css === css);
  return match?.key ?? "serif";
}

/** DOCX font name → canonical key. Falls back to "serif". */
export function docxToFontKey(name: string): string {
  const match = FONT_OPTIONS.find((o) => o.docx === name);
  return match?.key ?? "serif";
}

/**
 * Font family → CSS font-family string.
 * Supports both legacy canonical keys (e.g. "serif", "yu-mincho")
 * and direct font family names (e.g. "Noto Serif JP", "Shippori Mincho").
 */
export function fontKeyToCss(key: string): string {
  // Check legacy canonical keys first
  const match = FONT_OPTIONS.find((o) => o.key === key);
  if (match) return match.css;
  // Direct font family name — wrap in quotes with generic fallback
  if (key && key !== "serif" && key !== "sans-serif") {
    return `"${key}", serif`;
  }
  return key || "serif";
}

/**
 * Font family → DOCX font name.
 * Supports both legacy canonical keys and direct font family names.
 */
export function fontKeyToDocx(key: string): string {
  const match = FONT_OPTIONS.find((o) => o.key === key);
  if (match) return match.docx;
  // Direct font family name — use as-is
  return key || "Yu Mincho";
}

// ---------------------------------------------------------------------------
// Conversion to format-specific settings
// ---------------------------------------------------------------------------

export function toPdfExportSettings(s: UnifiedExportSettings): PdfExportSettings {
  // Determine if the font is a Google Font (for <link> injection in export HTML)
  const isGoogleFont = ALL_JAPANESE_FONTS.some((f) => f.family === s.fontFamily);

  return {
    pageSize: s.pageSize,
    landscape: s.landscape,
    verticalWriting: s.verticalWriting,
    charsPerLine: s.charsPerLine,
    linesPerPage: s.linesPerPage,
    margins: { ...s.margins },
    fontFamily: fontKeyToCss(s.fontFamily),
    showPageNumbers: s.showPageNumbers,
    pageNumberFormat: s.pageNumberFormat,
    pageNumberPosition: s.pageNumberPosition,
    textIndent: s.textIndent,
    googleFontFamily: isGoogleFont ? s.fontFamily : undefined,
  };
}

export function toDocxExportSettings(s: UnifiedExportSettings): DocxExportSettings {
  const { fontSizeMm, lineHeightRatio } = calculateTypesetting(
    s.pageSize,
    s.margins,
    s.charsPerLine,
    s.linesPerPage,
    s.verticalWriting,
    s.landscape,
  );
  const fontSizePt = fontSizeMm * (72 / 25.4);

  return {
    pageSize: s.pageSize,
    landscape: s.landscape,
    verticalWriting: s.verticalWriting,
    fontFamily: fontKeyToDocx(s.fontFamily),
    fontSize: Math.round(fontSizePt * 2) / 2, // nearest 0.5pt
    lineSpacing: Math.round(lineHeightRatio * 10) / 10,
    margins: { ...s.margins },
    textIndent: s.textIndent,
    showPageNumbers: s.showPageNumbers,
    pageNumberFormat: s.pageNumberFormat,
    pageNumberPosition: s.pageNumberPosition,
  };
}

// ---------------------------------------------------------------------------
// Persistence & migration
// ---------------------------------------------------------------------------

const STORAGE_KEY = "illusions:export-settings";
const LEGACY_PDF_KEY = "illusions:pdf-export-settings";
const LEGACY_DOCX_KEY = "illusions:docx-export-settings";

const VALID_PAGE_SIZES: ExportPageSize[] = ["A4", "A5", "B5", "B6"];
const VALID_PAGE_NUMBER_FORMATS: PageNumberFormat[] = ["simple", "dash", "fraction"];
const VALID_PAGE_NUMBER_POSITIONS: PageNumberPosition[] = [
  "bottom-left",
  "bottom-center",
  "bottom-right",
  "top-left",
  "top-center",
  "top-right",
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sanitize(raw: Partial<UnifiedExportSettings>): UnifiedExportSettings {
  const d = DEFAULT_EXPORT_SETTINGS;
  const pageSize = VALID_PAGE_SIZES.includes(raw.pageSize as ExportPageSize)
    ? (raw.pageSize as ExportPageSize)
    : d.pageSize;

  const rawMargins = raw.margins;
  const hasMargins = typeof rawMargins === "object" && rawMargins !== null;

  // Accept any non-empty string for fontFamily (supports both legacy keys and direct names)
  const fontFamily =
    typeof raw.fontFamily === "string" && raw.fontFamily.length > 0 ? raw.fontFamily : d.fontFamily;

  return {
    pageSize,
    landscape: typeof raw.landscape === "boolean" ? raw.landscape : d.landscape,
    verticalWriting:
      typeof raw.verticalWriting === "boolean" ? raw.verticalWriting : d.verticalWriting,
    charsPerLine:
      typeof raw.charsPerLine === "number" ? clamp(raw.charsPerLine, 10, 60) : d.charsPerLine,
    linesPerPage:
      typeof raw.linesPerPage === "number" ? clamp(raw.linesPerPage, 10, 50) : d.linesPerPage,
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
    fontFamily,
    showPageNumbers:
      typeof raw.showPageNumbers === "boolean" ? raw.showPageNumbers : d.showPageNumbers,
    pageNumberFormat: VALID_PAGE_NUMBER_FORMATS.includes(raw.pageNumberFormat as PageNumberFormat)
      ? (raw.pageNumberFormat as PageNumberFormat)
      : d.pageNumberFormat,
    pageNumberPosition: VALID_PAGE_NUMBER_POSITIONS.includes(
      raw.pageNumberPosition as PageNumberPosition,
    )
      ? (raw.pageNumberPosition as PageNumberPosition)
      : d.pageNumberPosition,
    textIndent: typeof raw.textIndent === "number" ? clamp(raw.textIndent, 0, 4) : d.textIndent,
  };
}

/**
 * Attempt to migrate from legacy PDF export settings.
 * Maps CSS fontFamily string → canonical key.
 */
function migrateLegacyPdf(raw: Record<string, unknown>): Partial<UnifiedExportSettings> {
  const migrated: Partial<UnifiedExportSettings> = { ...raw };
  if (typeof raw.fontFamily === "string") {
    migrated.fontFamily = cssToFontKey(raw.fontFamily as string);
  }
  return migrated;
}

/**
 * Attempt to migrate from legacy DOCX export settings.
 * Maps DOCX font name → canonical key; does not carry fontSize/lineSpacing
 * (they are derived from charsPerLine/linesPerPage at export time).
 */
function migrateLegacyDocx(raw: Record<string, unknown>): Partial<UnifiedExportSettings> {
  return {
    pageSize: raw.pageSize as ExportPageSize | undefined,
    landscape: raw.landscape as boolean | undefined,
    margins: raw.margins as UnifiedExportSettings["margins"] | undefined,
    textIndent: raw.textIndent as number | undefined,
    showPageNumbers: raw.showPageNumbers as boolean | undefined,
    fontFamily: typeof raw.fontFamily === "string" ? docxToFontKey(raw.fontFamily) : undefined,
    // charsPerLine / linesPerPage / verticalWriting: use defaults (DOCX didn't have these)
  };
}

export function loadExportSettings(): UnifiedExportSettings {
  if (typeof window === "undefined") return { ...DEFAULT_EXPORT_SETTINGS };

  try {
    // 1. Try unified key
    const unified = localStorage.getItem(STORAGE_KEY);
    if (unified) {
      return sanitize(JSON.parse(unified) as Partial<UnifiedExportSettings>);
    }

    // 2. Try legacy PDF key (richer model, preferred)
    const legacyPdf = localStorage.getItem(LEGACY_PDF_KEY);
    if (legacyPdf) {
      const parsed = JSON.parse(legacyPdf) as Record<string, unknown>;
      const migrated = migrateLegacyPdf(parsed);
      const settings = sanitize(migrated);
      // Persist under new key so migration runs only once
      saveExportSettings(settings);
      return settings;
    }

    // 3. Try legacy DOCX key
    const legacyDocx = localStorage.getItem(LEGACY_DOCX_KEY);
    if (legacyDocx) {
      const parsed = JSON.parse(legacyDocx) as Record<string, unknown>;
      const migrated = migrateLegacyDocx(parsed);
      const settings = sanitize(migrated);
      saveExportSettings(settings);
      return settings;
    }
  } catch {
    // Corrupted localStorage — fall through to defaults
  }

  return { ...DEFAULT_EXPORT_SETTINGS };
}

export function saveExportSettings(settings: UnifiedExportSettings): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // localStorage quota exceeded — silently ignore
  }
}

export { PAGE_DIMENSIONS };
