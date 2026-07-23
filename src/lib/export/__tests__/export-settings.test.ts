/**
 * Unit tests for export-settings persistence (StorageService migration, #1567).
 *
 * Verifies that unified export settings are persisted via getStorageService()
 * (not raw localStorage) and that legacy localStorage keys are migrated once
 * and then removed.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  DEFAULT_EXPORT_SETTINGS,
  loadExportSettings,
  saveExportSettings,
  toPdfExportSettings,
  toPdfGenerationOptions,
} from "@/lib/export/export-settings";

// インメモリ KV で StorageService をモックする
const kvStore = new Map<string, string>();

vi.mock("@/lib/storage/storage-service", () => ({
  getStorageService: () => ({
    getItem: async (key: string): Promise<string | null> => kvStore.get(key) ?? null,
    setItem: async (key: string, value: string): Promise<void> => {
      kvStore.set(key, value);
    },
    removeItem: async (key: string): Promise<void> => {
      kvStore.delete(key);
    },
  }),
}));

const STORAGE_KEY = "illusions:export-settings";
const LEGACY_PDF_KEY = "illusions:pdf-export-settings";
const LEGACY_DOCX_KEY = "illusions:docx-export-settings";

beforeEach(() => {
  kvStore.clear();
  localStorage.clear();
});

describe("saveExportSettings", () => {
  it("StorageService に保存し、localStorage には書き込まない", async () => {
    const settings = { ...DEFAULT_EXPORT_SETTINGS, charsPerLine: 32 };

    await saveExportSettings(settings);

    expect(kvStore.get(STORAGE_KEY)).toBe(JSON.stringify(settings));
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

describe("toPdfExportSettings", () => {
  it("旧形式の Noto Serif キーでも Google Fonts を読み込む", () => {
    const converted = toPdfExportSettings({
      ...DEFAULT_EXPORT_SETTINGS,
      fontFamily: "noto-serif",
    });

    expect(converted.fontFamily).toBe('"Noto Serif JP", serif');
    expect(converted.googleFontFamily).toBe("Noto Serif JP");
  });

  it("直接選択した Google Fonts のファミリー名を保持する", () => {
    const converted = toPdfExportSettings({
      ...DEFAULT_EXPORT_SETTINGS,
      fontFamily: "Shippori Mincho",
    });

    expect(converted.fontFamily).toBe('"Shippori Mincho", serif');
    expect(converted.googleFontFamily).toBe("Shippori Mincho");
  });
});

describe("toPdfGenerationOptions", () => {
  it("forwards the complete UI profile unchanged to preview, PDF, and system print IPCs", () => {
    const settings = toPdfExportSettings({
      ...DEFAULT_EXPORT_SETTINGS,
      pageSize: "Bunko",
      landscape: false,
      verticalWriting: false,
      charsPerLine: 33,
      linesPerPage: 22,
      margins: { top: 11, right: 12, bottom: 13, left: 14 },
      fontFamily: "Shippori Mincho",
      showPageNumbers: true,
      pageNumberFormat: "fraction",
      pageNumberPosition: "top-right",
      textIndent: 2,
      fullwidthSpaceIndent: true,
    });

    expect(
      toPdfGenerationOptions(settings, { title: "組版テスト", author: "著者" }, ".mdi"),
    ).toEqual({
      metadata: { title: "組版テスト", author: "著者" },
      fileType: ".mdi",
      pageSize: "Bunko",
      landscape: false,
      verticalWriting: false,
      charsPerLine: 33,
      linesPerPage: 22,
      margins: { top: 11, right: 12, bottom: 13, left: 14 },
      fontFamily: '"Shippori Mincho", serif',
      googleFontFamily: "Shippori Mincho",
      showPageNumbers: true,
      pageNumberFormat: "fraction",
      pageNumberPosition: "top-right",
      textIndent: 2,
      fullwidthSpaceIndent: true,
    });
  });
});

describe("loadExportSettings", () => {
  it("HTMLの本文のみ設定を保存値から復元する", async () => {
    kvStore.set(STORAGE_KEY, JSON.stringify({ ...DEFAULT_EXPORT_SETTINGS, htmlBodyOnly: true }));

    const loaded = await loadExportSettings();

    expect(loaded.htmlBodyOnly).toBe(true);
  });

  it("StorageService に保存済みの設定を読み込む", async () => {
    const settings = { ...DEFAULT_EXPORT_SETTINGS, linesPerPage: 22, landscape: false };
    kvStore.set(STORAGE_KEY, JSON.stringify(settings));

    const loaded = await loadExportSettings();

    expect(loaded).toEqual(settings);
  });

  it("何も保存されていなければ既定値を返す", async () => {
    const loaded = await loadExportSettings();
    expect(loaded).toEqual(DEFAULT_EXPORT_SETTINGS);
  });

  it("破損した保存データは既定値にフォールバックする", async () => {
    kvStore.set(STORAGE_KEY, "{not json");

    const loaded = await loadExportSettings();
    expect(loaded).toEqual(DEFAULT_EXPORT_SETTINGS);
  });

  it("レガシー localStorage（統一キー）から一度だけ移行しキーを削除する", async () => {
    const legacy = { ...DEFAULT_EXPORT_SETTINGS, charsPerLine: 28 };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy));

    const loaded = await loadExportSettings();

    expect(loaded.charsPerLine).toBe(28);
    // StorageService 側に永続化される
    expect(kvStore.has(STORAGE_KEY)).toBe(true);
    // レガシーキーは削除される
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("レガシー PDF キーから移行する（CSS fontFamily → 正規キー）", async () => {
    localStorage.setItem(
      LEGACY_PDF_KEY,
      JSON.stringify({ charsPerLine: 36, fontFamily: '"Noto Serif JP", serif' }),
    );

    const loaded = await loadExportSettings();

    expect(loaded.charsPerLine).toBe(36);
    expect(loaded.fontFamily).toBe("noto-serif");
    expect(localStorage.getItem(LEGACY_PDF_KEY)).toBeNull();
    expect(kvStore.has(STORAGE_KEY)).toBe(true);
  });

  it("レガシー DOCX キーから移行する（DOCX フォント名 → 正規キー）", async () => {
    localStorage.setItem(
      LEGACY_DOCX_KEY,
      JSON.stringify({ pageSize: "A5", fontFamily: "Hiragino Mincho ProN" }),
    );

    const loaded = await loadExportSettings();

    expect(loaded.pageSize).toBe("A5");
    expect(loaded.fontFamily).toBe("hiragino");
    expect(localStorage.getItem(LEGACY_DOCX_KEY)).toBeNull();
  });

  it("StorageService の値がレガシー localStorage より優先される", async () => {
    kvStore.set(STORAGE_KEY, JSON.stringify({ ...DEFAULT_EXPORT_SETTINGS, charsPerLine: 40 }));
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...DEFAULT_EXPORT_SETTINGS, charsPerLine: 20 }),
    );

    const loaded = await loadExportSettings();
    expect(loaded.charsPerLine).toBe(40);
  });
});
