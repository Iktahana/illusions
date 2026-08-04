/**
 * Renderer-safe snapshot of the @illusions-lab/mdi-export-profile 2.0.17
 * paper catalogue. The upstream WASM binding is Node-only, so renderer code
 * must not import it directly. A Node-side contract test keeps this snapshot
 * aligned with the upstream package on every MDI dependency update.
 */
export interface PageSizeEntry {
  key: string;
  label: string;
  width: number;
  height: number;
}

export interface PageSizeCategory {
  name: string;
  sizes: PageSizeEntry[];
}

const MDI_PAGE_SIZE_ROWS: readonly (readonly [string, string, number, number])[] = [
  ["A0", "A0判", 841, 1189],
  ["A1", "A1判", 594, 841],
  ["A2", "A2判", 420, 594],
  ["A3", "A3判", 297, 420],
  ["A4", "A4判", 210, 297],
  ["A5", "A5判", 148, 210],
  ["A6", "A6判", 105, 148],
  ["A7", "A7判", 74, 105],
  ["A8", "A8判", 52, 74],
  ["A9", "A9判", 37, 52],
  ["A10", "A10判", 26, 37],
  ["JIS-B0", "JIS B0判", 1030, 1456],
  ["JIS-B1", "JIS B1判", 728, 1030],
  ["JIS-B2", "JIS B2判", 515, 728],
  ["JIS-B3", "JIS B3判", 364, 515],
  ["JIS-B4", "JIS B4判", 257, 364],
  ["JIS-B5", "JIS B5判", 182, 257],
  ["JIS-B6", "JIS B6判", 128, 182],
  ["JIS-B7", "JIS B7判", 91, 128],
  ["JIS-B8", "JIS B8判", 64, 91],
  ["JIS-B9", "JIS B9判", 45, 64],
  ["JIS-B10", "JIS B10判", 32, 45],
  ["ISO-B0", "ISO B0判", 1000, 1414],
  ["ISO-B1", "ISO B1判", 707, 1000],
  ["ISO-B2", "ISO B2判", 500, 707],
  ["ISO-B3", "ISO B3判", 353, 500],
  ["ISO-B4", "ISO B4判", 250, 353],
  ["ISO-B5", "ISO B5判", 176, 250],
  ["ISO-B6", "ISO B6判", 125, 176],
  ["ISO-B7", "ISO B7判", 88, 125],
  ["ISO-B8", "ISO B8判", 62, 88],
  ["ISO-B9", "ISO B9判", 44, 62],
  ["ISO-B10", "ISO B10判", 31, 44],
  ["Bunko", "文庫判", 105, 148],
  ["Shinsho", "新書判", 103, 182],
  ["Shirokuban", "四六判", 127, 188],
  ["Kikuban", "菊判", 150, 220],
  ["A5-ban", "A5判", 148, 210],
  ["B6-ban", "B6判", 128, 182],
  ["AB-ban", "AB判", 210, 257],
  ["Ju-ban", "十六判", 182, 206],
  ["Kiku-tate", "菊判縦", 152, 218],
  ["Tankobon", "単行本判", 130, 188],
  ["Letter", "レター", 216, 279],
  ["Legal", "リーガル", 216, 356],
  ["Tabloid", "タブロイド", 279, 432],
  ["Executive", "エグゼクティブ", 184, 267],
  ["Statement", "ステートメント", 140, 216],
  ["Folio", "フォリオ", 210, 330],
  ["Quarto", "クォート", 203, 254],
  ["10x14", "10 × 14インチ", 254, 356],
  ["Naga-3", "長形3号", 120, 235],
  ["Naga-4", "長形4号", 90, 205],
  ["Kaku-2", "角形2号", 240, 332],
  ["Kaku-3", "角形3号", 216, 277],
  ["Kaku-6", "角形6号", 162, 229],
  ["Kaku-8", "角形8号", 119, 197],
  ["You-4", "洋形4号", 105, 235],
  ["You-6", "洋形6号", 98, 190],
  ["Hagaki", "はがき", 100, 148],
  ["Ofuku-Hagaki", "往復はがき", 200, 148],
  ["L-ban", "L判", 89, 127],
  ["2L-ban", "2L判", 127, 178],
  ["KG", "KG判", 102, 152],
  ["Cabinet", "キャビネ判", 130, 180],
  ["B5", "ISO B5判", 176, 250],
  ["B6", "ISO B6判", 125, 176],
];

const MDI_PAGE_SIZE_CATALOG: readonly PageSizeEntry[] = MDI_PAGE_SIZE_ROWS.map(
  ([key, label, width, height]): PageSizeEntry => ({ key, label, width, height }),
);

export const PAGE_DIMENSIONS: Record<string, { width: number; height: number }> =
  Object.fromEntries(
    MDI_PAGE_SIZE_CATALOG.map(({ key, width, height }) => [key, { width, height }]),
  );
export const ALL_PAGE_SIZE_KEYS = new Set<string>(MDI_PAGE_SIZE_CATALOG.map(({ key }) => key));

export const PAGE_SIZE_CATEGORIES: PageSizeCategory[] = [
  { name: "MDI 標準用紙サイズ", sizes: [...MDI_PAGE_SIZE_CATALOG] },
];

/** Resolved @illusions-lab/mdi-export-profile defaults for vertical MDI output. */
export const MDI_VERTICAL_PRINT_DEFAULTS = {
  pageSize: "A4",
  landscape: true,
  verticalWriting: true,
  charsPerLine: 40,
  linesPerPage: 30,
  margins: {
    top: 30.91666666666667,
    bottom: 30.91666666666667,
    left: 28,
    right: 28,
  },
} as const;

export function formatDimensions(key: string): string {
  const dimensions = PAGE_DIMENSIONS[key];
  return dimensions ? `${dimensions.width}×${dimensions.height} mm` : "";
}
