/**
 * Typed facade for localStorage-based UI preferences.
 *
 * These values are read synchronously on mount to prevent visual flash,
 * which is why they use localStorage instead of the async StorageService.
 */

import {
  isPdfPreviewMaxPagesPreference,
  type PdfPreviewMaxPagesPreference,
} from "@/lib/export/pdf-preview-limits";

export type { PdfPreviewMaxPagesPreference } from "@/lib/export/pdf-preview-limits";

const PREFIX = "illusions:" as const;

const KEYS = {
  themeMode: `${PREFIX}theme-mode`,
  writingMode: `${PREFIX}writing-mode`,
  leftTab: `${PREFIX}left-tab`,
  rightTab: `${PREFIX}right-tab`,
  sidebarTopOrder: `${PREFIX}sidebar-top-order`,
  sidebarBottomOrder: `${PREFIX}sidebar-bottom-order`,
  searchHistory: `${PREFIX}search-history`,
  genjiAnalysisExpanded: `${PREFIX}genji-analysis-expanded`,
  pdfPreviewMaxPages: `${PREFIX}pdf-preview-max-pages`,
} as const;

// One-time migration from old keys to new keys
function migrateOldKeys(): void {
  if (typeof window === "undefined") return;
  const migrations: [string, string][] = [
    ["themeMode", KEYS.themeMode],
    ["illusions-writing-mode", KEYS.writingMode],
    ["illusions:leftTab", KEYS.leftTab],
    ["illusions:rightTab", KEYS.rightTab],
    // These old keys already match the new keys, so no migration needed:
    // "illusions:sidebar-top-order" === KEYS.sidebarTopOrder
    // "illusions:sidebar-bottom-order" === KEYS.sidebarBottomOrder
  ];
  try {
    for (const [oldKey, newKey] of migrations) {
      if (oldKey === newKey) continue;
      const value = localStorage.getItem(oldKey);
      if (value !== null && localStorage.getItem(newKey) === null) {
        localStorage.setItem(newKey, value);
        localStorage.removeItem(oldKey);
      }
    }
  } catch {
    // localStorage may throw SecurityError in private browsing or sandboxed contexts;
    // silently skip migration rather than crashing the module.
  }
}

// Run migration on first import
migrateOldKeys();

function get(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function set(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // Silently ignore write failures (e.g. SecurityError, QuotaExceededError).
  }
}

export type ThemeMode = "light" | "dark" | "auto";
export type WritingMode = "vertical" | "horizontal";
export const localPreferences = {
  // --- Theme ---
  getThemeMode(): ThemeMode | null {
    return get(KEYS.themeMode) as ThemeMode | null;
  },
  setThemeMode(mode: ThemeMode): void {
    set(KEYS.themeMode, mode);
  },

  // --- Writing mode ---
  getWritingMode(): WritingMode | null {
    return get(KEYS.writingMode) as WritingMode | null;
  },
  setWritingMode(mode: WritingMode): void {
    set(KEYS.writingMode, mode);
  },

  // --- Left sidebar tab ---
  getLeftTab(): string | null {
    return get(KEYS.leftTab);
  },
  setLeftTab(tab: string): void {
    set(KEYS.leftTab, tab);
  },

  // --- Right panel tab ---
  getRightTab(): string | null {
    return get(KEYS.rightTab);
  },
  setRightTab(tab: string): void {
    set(KEYS.rightTab, tab);
  },

  // --- Sidebar icon order ---
  getSidebarTopOrder(): string[] | null {
    const raw = get(KEYS.sidebarTopOrder);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as string[];
    } catch {
      return null;
    }
  },
  setSidebarTopOrder(ids: string[]): void {
    set(KEYS.sidebarTopOrder, JSON.stringify(ids));
  },

  getSidebarBottomOrder(): string[] | null {
    const raw = get(KEYS.sidebarBottomOrder);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as string[];
    } catch {
      return null;
    }
  },
  setSidebarBottomOrder(ids: string[]): void {
    set(KEYS.sidebarBottomOrder, JSON.stringify(ids));
  },

  // --- Search history ---
  getSearchHistory(): string[] {
    const raw = get(KEYS.searchHistory);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed)
        ? parsed.filter((value): value is string => typeof value === "string")
        : [];
    } catch {
      return [];
    }
  },
  setSearchHistory(entries: readonly string[]): void {
    set(KEYS.searchHistory, JSON.stringify(entries));
  },

  // --- 語彙統計「辞書データからの分析」セクションの開閉（既定: 展開）---
  getGenjiAnalysisExpanded(): boolean {
    // 未保存 (null) のときは既定で展開。明示的に "0" のときだけ折り畳み。
    return get(KEYS.genjiAnalysisExpanded) !== "0";
  },
  setGenjiAnalysisExpanded(expanded: boolean): void {
    set(KEYS.genjiAnalysisExpanded, expanded ? "1" : "0");
  },

  // --- PDF preview ---
  getPdfPreviewMaxPages(): PdfPreviewMaxPagesPreference {
    const value = get(KEYS.pdfPreviewMaxPages);
    return isPdfPreviewMaxPagesPreference(value) ? value : "auto";
  },
  setPdfPreviewMaxPages(value: PdfPreviewMaxPagesPreference): void {
    if (isPdfPreviewMaxPagesPreference(value)) {
      set(KEYS.pdfPreviewMaxPages, value);
    }
  },
} as const;
