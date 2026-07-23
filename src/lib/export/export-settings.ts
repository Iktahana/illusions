/**
 * Unified export settings for PDF, DOCX, and EPUB.
 *
 * Uses charsPerLine / linesPerPage as the canonical typesetting model
 * (more expressive than raw fontSize + lineSpacing). The same canonical
 * settings are mapped directly to the upstream export profile for every format.
 *
 * Persisted via the unified StorageService (SQLite on Electron, IndexedDB on Web).
 * Migrates from legacy localStorage keys (unified + per-format) on first load,
 * then removes them so settings are governed by StorageService.clearAll().
 */

import { getStorageService } from "@/lib/storage/storage-service";
import { ALL_JAPANESE_FONTS } from "@/lib/utils/fonts";
import { PAGE_DIMENSIONS, ALL_PAGE_SIZE_KEYS } from "./page-sizes";
import { resolvePrintProfile } from "@illusions-lab/mdi-export-profile";

import type { PdfExportSettings } from "./pdf-export-settings";
import type { ChapterSplitLevel, EpubExportOptions } from "./epub-shared";
import type { ExportMetadata } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Page size key — any key in PAGE_DIMENSIONS (e.g. "A4", "Bunko", "Letter") */
export type ExportPageSize = string;

export type PageNumberFormat = "simple" | "dash" | "fraction";
export type PageNumberPosition =
  "bottom-left" | "bottom-center" | "bottom-right" | "top-left" | "top-center" | "top-right";

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
  /**
   * When true, PDF/DOCX 字下げ is rendered as literal full-width spaces (U+3000)
   * prepended to each paragraph instead of a layout indent. The number of spaces
   * is derived from `textIndent` (rounded). Default false. EPUB is unaffected.
   */
  fullwidthSpaceIndent: boolean;
  /** TXT export: prepend literal full-width spaces (U+3000) as 字下げ. Default false. */
  txtFullwidthSpaceIndent: boolean;
  /** TXT export: number of full-width spaces to prepend when enabled (1–4). */
  txtIndentCount: number;
  // EPUB-specific
  epubPublisher: string;
  epubIdentifier: string;
  epubChapterSplitLevel: ChapterSplitLevel;
}

const UPSTREAM_DEFAULTS = resolvePrintProfile(
  { layout: { system: "japanese-publisher" } },
  "vertical",
);

export const DEFAULT_EXPORT_SETTINGS: UnifiedExportSettings = {
  pageSize: UPSTREAM_DEFAULTS.pagination.pageSize,
  landscape: UPSTREAM_DEFAULTS.pagination.landscape,
  verticalWriting: UPSTREAM_DEFAULTS.typesetting.writingMode === "vertical",
  charsPerLine: UPSTREAM_DEFAULTS.pagination.charactersPerLine,
  linesPerPage: UPSTREAM_DEFAULTS.pagination.linesPerPage,
  margins: { ...UPSTREAM_DEFAULTS.pagination.margins },
  fontFamily: "serif",
  showPageNumbers: true,
  pageNumberFormat: "simple",
  pageNumberPosition: "bottom-center",
  textIndent: 1,
  fullwidthSpaceIndent: false,
  txtFullwidthSpaceIndent: false,
  txtIndentCount: 1,
  epubPublisher: "",
  epubIdentifier: "",
  epubChapterSplitLevel: "h1",
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
  const fontFamily = fontKeyToCss(s.fontFamily);
  // Legacy settings use canonical keys such as `noto-serif`. Resolve the CSS
  // first so those users still receive the required Google Fonts stylesheet.
  const googleFontFamily = ALL_JAPANESE_FONTS.find(
    (font) => font.family === s.fontFamily || fontFamily.includes(`"${font.family}"`),
  )?.family;

  return {
    pageSize: s.pageSize,
    landscape: s.landscape,
    verticalWriting: s.verticalWriting,
    charsPerLine: s.charsPerLine,
    linesPerPage: s.linesPerPage,
    margins: { ...s.margins },
    fontFamily,
    showPageNumbers: s.showPageNumbers,
    pageNumberFormat: s.pageNumberFormat,
    pageNumberPosition: s.pageNumberPosition,
    textIndent: s.textIndent,
    fullwidthSpaceIndent: s.fullwidthSpaceIndent,
    googleFontFamily,
  };
}

export function toEpubExportOptions(
  s: UnifiedExportSettings,
  metadata: ExportMetadata,
  coverImage?: Uint8Array,
  coverMediaType?: "image/jpeg" | "image/png",
): EpubExportOptions {
  return {
    metadata: {
      ...metadata,
      publisher: s.epubPublisher || undefined,
      identifier: s.epubIdentifier || undefined,
    },
    verticalWriting: s.verticalWriting,
    fontFamily: fontKeyToCss(s.fontFamily),
    textIndent: s.textIndent,
    chapterSplitLevel: s.epubChapterSplitLevel,
    coverImage,
    coverMediaType,
  };
}

// ---------------------------------------------------------------------------
// Persistence & migration
// ---------------------------------------------------------------------------

const STORAGE_KEY = "illusions:export-settings";
const LEGACY_PDF_KEY = "illusions:pdf-export-settings";
const LEGACY_DOCX_KEY = "illusions:docx-export-settings";

const VALID_PAGE_NUMBER_FORMATS: PageNumberFormat[] = ["simple", "dash", "fraction"];
const VALID_PAGE_NUMBER_POSITIONS: PageNumberPosition[] = [
  "bottom-left",
  "bottom-center",
  "bottom-right",
  "top-left",
  "top-center",
  "top-right",
];
const VALID_CHAPTER_SPLIT_LEVELS: ChapterSplitLevel[] = ["h1", "h2", "h3", "none"];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sanitize(raw: Partial<UnifiedExportSettings>): UnifiedExportSettings {
  const d = DEFAULT_EXPORT_SETTINGS;
  const pageSize =
    typeof raw.pageSize === "string" && ALL_PAGE_SIZE_KEYS.has(raw.pageSize)
      ? raw.pageSize
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
    fullwidthSpaceIndent:
      typeof raw.fullwidthSpaceIndent === "boolean"
        ? raw.fullwidthSpaceIndent
        : d.fullwidthSpaceIndent,
    txtFullwidthSpaceIndent:
      typeof raw.txtFullwidthSpaceIndent === "boolean"
        ? raw.txtFullwidthSpaceIndent
        : d.txtFullwidthSpaceIndent,
    txtIndentCount:
      typeof raw.txtIndentCount === "number"
        ? clamp(Math.round(raw.txtIndentCount), 1, 4)
        : d.txtIndentCount,
    epubPublisher: typeof raw.epubPublisher === "string" ? raw.epubPublisher : d.epubPublisher,
    epubIdentifier: typeof raw.epubIdentifier === "string" ? raw.epubIdentifier : d.epubIdentifier,
    epubChapterSplitLevel: VALID_CHAPTER_SPLIT_LEVELS.includes(
      raw.epubChapterSplitLevel as ChapterSplitLevel,
    )
      ? (raw.epubChapterSplitLevel as ChapterSplitLevel)
      : d.epubChapterSplitLevel,
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

/**
 * Read legacy localStorage keys (one-time migration source).
 * Priority: unified key > legacy PDF (richer model) > legacy DOCX.
 */
function readLegacyLocalStorage(): UnifiedExportSettings | null {
  try {
    const unified = localStorage.getItem(STORAGE_KEY);
    if (unified) {
      return sanitize(JSON.parse(unified) as Partial<UnifiedExportSettings>);
    }

    const legacyPdf = localStorage.getItem(LEGACY_PDF_KEY);
    if (legacyPdf) {
      return sanitize(migrateLegacyPdf(JSON.parse(legacyPdf) as Record<string, unknown>));
    }

    const legacyDocx = localStorage.getItem(LEGACY_DOCX_KEY);
    if (legacyDocx) {
      return sanitize(migrateLegacyDocx(JSON.parse(legacyDocx) as Record<string, unknown>));
    }
  } catch {
    // Corrupted localStorage — treat as absent
  }
  return null;
}

/** Remove all legacy localStorage keys after a successful migration. */
function removeLegacyLocalStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_PDF_KEY);
    localStorage.removeItem(LEGACY_DOCX_KEY);
  } catch {
    // localStorage が利用できない環境では何もしない
  }
}

export async function loadExportSettings(): Promise<UnifiedExportSettings> {
  if (typeof window === "undefined") return { ...DEFAULT_EXPORT_SETTINGS };

  try {
    // 1. StorageService (canonical location)
    const stored = await getStorageService().getItem(STORAGE_KEY);
    if (stored) {
      return sanitize(JSON.parse(stored) as Partial<UnifiedExportSettings>);
    }

    // 2. One-time migration from legacy localStorage keys
    const migrated = readLegacyLocalStorage();
    if (migrated) {
      await saveExportSettings(migrated);
      removeLegacyLocalStorage();
      return migrated;
    }
  } catch {
    // Corrupted data or storage failure — fall through to defaults
  }

  return { ...DEFAULT_EXPORT_SETTINGS };
}

export async function saveExportSettings(settings: UnifiedExportSettings): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    await getStorageService().setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // 保存失敗は致命的ではないため無視する
  }
}

export { PAGE_DIMENSIONS };
export type { ChapterSplitLevel, EpubExportOptions };
