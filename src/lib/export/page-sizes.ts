/**
 * Comprehensive page size definitions for export (PDF, DOCX, EPUB).
 *
 * 80+ sizes across 8 categories. Each size has a unique key,
 * display label (Japanese), and dimensions in mm.
 */

export interface PageSizeEntry {
  key: string;
  label: string;
  width: number; // mm
  height: number; // mm
}

export interface PageSizeCategory {
  name: string;
  sizes: PageSizeEntry[];
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export const PAGE_SIZE_CATEGORIES: PageSizeCategory[] = [
  {
    name: "おすすめ",
    sizes: [
      { key: "A4", label: "A4", width: 210, height: 297 },
      { key: "A5", label: "A5", width: 148, height: 210 },
      { key: "JIS-B5", label: "B5 (JIS)", width: 182, height: 257 },
      { key: "JIS-B6", label: "B6 (JIS)", width: 128, height: 182 },
      { key: "Bunko", label: "文庫判", width: 105, height: 148 },
      { key: "Shinsho", label: "新書判", width: 103, height: 182 },
      { key: "Shirokuban", label: "四六判", width: 127, height: 188 },
      { key: "Letter", label: "Letter", width: 216, height: 279 },
    ],
  },
  {
    name: "ISO A",
    sizes: [
      { key: "A0", label: "A0", width: 841, height: 1189 },
      { key: "A1", label: "A1", width: 594, height: 841 },
      { key: "A2", label: "A2", width: 420, height: 594 },
      { key: "A3", label: "A3", width: 297, height: 420 },
      { key: "A4", label: "A4", width: 210, height: 297 },
      { key: "A5", label: "A5", width: 148, height: 210 },
      { key: "A6", label: "A6", width: 105, height: 148 },
      { key: "A7", label: "A7", width: 74, height: 105 },
      { key: "A8", label: "A8", width: 52, height: 74 },
      { key: "A9", label: "A9", width: 37, height: 52 },
      { key: "A10", label: "A10", width: 26, height: 37 },
    ],
  },
  {
    name: "JIS B",
    sizes: [
      { key: "JIS-B0", label: "B0 (JIS)", width: 1030, height: 1456 },
      { key: "JIS-B1", label: "B1 (JIS)", width: 728, height: 1030 },
      { key: "JIS-B2", label: "B2 (JIS)", width: 515, height: 728 },
      { key: "JIS-B3", label: "B3 (JIS)", width: 364, height: 515 },
      { key: "JIS-B4", label: "B4 (JIS)", width: 257, height: 364 },
      { key: "JIS-B5", label: "B5 (JIS)", width: 182, height: 257 },
      { key: "JIS-B6", label: "B6 (JIS)", width: 128, height: 182 },
      { key: "JIS-B7", label: "B7 (JIS)", width: 91, height: 128 },
      { key: "JIS-B8", label: "B8 (JIS)", width: 64, height: 91 },
      { key: "JIS-B9", label: "B9 (JIS)", width: 45, height: 64 },
      { key: "JIS-B10", label: "B10 (JIS)", width: 32, height: 45 },
    ],
  },
  {
    name: "ISO B",
    sizes: [
      { key: "ISO-B0", label: "B0 (ISO)", width: 1000, height: 1414 },
      { key: "ISO-B1", label: "B1 (ISO)", width: 707, height: 1000 },
      { key: "ISO-B2", label: "B2 (ISO)", width: 500, height: 707 },
      { key: "ISO-B3", label: "B3 (ISO)", width: 353, height: 500 },
      { key: "ISO-B4", label: "B4 (ISO)", width: 250, height: 353 },
      { key: "ISO-B5", label: "B5 (ISO)", width: 176, height: 250 },
      { key: "ISO-B6", label: "B6 (ISO)", width: 125, height: 176 },
      { key: "ISO-B7", label: "B7 (ISO)", width: 88, height: 125 },
      { key: "ISO-B8", label: "B8 (ISO)", width: 62, height: 88 },
      { key: "ISO-B9", label: "B9 (ISO)", width: 44, height: 62 },
      { key: "ISO-B10", label: "B10 (ISO)", width: 31, height: 44 },
    ],
  },
  {
    name: "日本出版・文芸",
    sizes: [
      { key: "Bunko", label: "文庫判", width: 105, height: 148 },
      { key: "Shinsho", label: "新書判", width: 103, height: 182 },
      { key: "Shirokuban", label: "四六判", width: 127, height: 188 },
      { key: "Kikuban", label: "菊判", width: 150, height: 220 },
      { key: "A5-ban", label: "A5判", width: 148, height: 210 },
      { key: "B6-ban", label: "B6判", width: 128, height: 182 },
      { key: "AB-ban", label: "AB判", width: 210, height: 257 },
      { key: "Ju-ban", label: "重箱判", width: 182, height: 206 },
      { key: "Kiku-tate", label: "菊判（変形）", width: 152, height: 218 },
      { key: "Tankobon", label: "単行本判", width: 130, height: 188 },
    ],
  },
  {
    name: "北米・国際オフィス",
    sizes: [
      { key: "Letter", label: "Letter", width: 216, height: 279 },
      { key: "Legal", label: "Legal", width: 216, height: 356 },
      { key: "Tabloid", label: "Tabloid", width: 279, height: 432 },
      { key: "Executive", label: "Executive", width: 184, height: 267 },
      { key: "Statement", label: "Statement", width: 140, height: 216 },
      { key: "Folio", label: "Folio", width: 210, height: 330 },
      { key: "Quarto", label: "Quarto", width: 203, height: 254 },
      { key: "10x14", label: "10×14", width: 254, height: 356 },
    ],
  },
  {
    name: "日本封筒",
    sizes: [
      { key: "Naga-3", label: "長形3号", width: 120, height: 235 },
      { key: "Naga-4", label: "長形4号", width: 90, height: 205 },
      { key: "Kaku-2", label: "角形2号", width: 240, height: 332 },
      { key: "Kaku-3", label: "角形3号", width: 216, height: 277 },
      { key: "Kaku-6", label: "角形6号", width: 162, height: 229 },
      { key: "Kaku-8", label: "角形8号", width: 119, height: 197 },
      { key: "You-4", label: "洋形4号", width: 105, height: 235 },
      { key: "You-6", label: "洋形6号", width: 98, height: 190 },
    ],
  },
  {
    name: "郵便・新聞・写真",
    sizes: [
      { key: "Hagaki", label: "はがき", width: 100, height: 148 },
      { key: "Ofuku-Hagaki", label: "往復はがき", width: 200, height: 148 },
      { key: "L-ban", label: "L判", width: 89, height: 127 },
      { key: "2L-ban", label: "2L判", width: 127, height: 178 },
      { key: "KG", label: "KG判", width: 102, height: 152 },
      { key: "Cabinet", label: "キャビネ判", width: 130, height: 180 },
    ],
  },
];

// ---------------------------------------------------------------------------
// Derived lookups
// ---------------------------------------------------------------------------

/** Flat map: key → { width, height } in mm */
export const PAGE_DIMENSIONS: Record<string, { width: number; height: number }> = {};

/** Set of all valid page size keys */
export const ALL_PAGE_SIZE_KEYS: Set<string> = new Set();

for (const cat of PAGE_SIZE_CATEGORIES) {
  for (const s of cat.sizes) {
    if (!PAGE_DIMENSIONS[s.key]) {
      PAGE_DIMENSIONS[s.key] = { width: s.width, height: s.height };
    }
    ALL_PAGE_SIZE_KEYS.add(s.key);
  }
}

// Legacy aliases: "B5"/"B6" historically meant ISO dimensions in pdf-export-settings.
// Preserve these so existing saved settings resolve correctly after upgrade.
PAGE_DIMENSIONS["B5"] ??= PAGE_DIMENSIONS["ISO-B5"];
PAGE_DIMENSIONS["B6"] ??= PAGE_DIMENSIONS["ISO-B6"];
ALL_PAGE_SIZE_KEYS.add("B5");
ALL_PAGE_SIZE_KEYS.add("B6");

/** Format dimensions as "W×H mm" for display */
export function formatDimensions(key: string): string {
  const d = PAGE_DIMENSIONS[key];
  if (!d) return "";
  return `${d.width}×${d.height} mm`;
}
