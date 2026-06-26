(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Regression tests for:
 * - #1932: Dictionary sequential search race — old response must not overwrite new query's result
 * - #1934: User dictionary write failure treated as success — error must be surfaced, not swallowed
 */

import { act } from "react";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — must be hoisted before any SUT import
// ---------------------------------------------------------------------------

// dict-service: control resolution timing per test
const mockDictQuery = vi.hoisted(() => vi.fn<(term: string) => Promise<{ entries: unknown[] }>>());
vi.mock("@/lib/dict/dict-service", () => ({
  getDictService: () => ({
    query: (term: string) => mockDictQuery(term),
    getDownloadState: async () => ({ providerId: "genji", status: "not-installed" as const }),
  }),
}));

// user-dictionary-service: tests use StandaloneMode so the *Standalone paths are active
const mockLoadStandalone = vi.hoisted(() => vi.fn<() => Promise<unknown[]>>());
const mockSaveStandalone = vi.hoisted(() => vi.fn<() => Promise<void>>());
vi.mock("@/lib/services/user-dictionary-service", () => ({
  getUserDictionaryService: () => ({
    loadEntries: async () => [],
    saveEntries: async () => {},
    loadEntriesStandalone: () => mockLoadStandalone(),
    saveEntriesStandalone: () => mockSaveStandalone(),
  }),
}));

// notification-manager: capture error calls
const mockNotifError = vi.hoisted(() => vi.fn<(msg: string) => string>());
vi.mock("@/lib/services/notification-manager", () => ({
  notificationManager: {
    error: (msg: string) => mockNotifError(msg),
    info: vi.fn(),
    warning: vi.fn(),
    success: vi.fn(),
    showMessage: vi.fn(),
  },
}));

// runtime-env: not Electron, so download banners don't appear
vi.mock("@/lib/utils/runtime-env", () => ({
  isElectronRenderer: () => false,
}));

// DictionaryEntryDialog: minimal stub — avoids portal/modal complexity
vi.mock("../Dictionary/DictionaryEntryDialog", () => ({
  default: ({
    isOpen,
    formData,
    onFormChange,
    onSave,
    onClose,
  }: {
    isOpen: boolean;
    formData: { word?: string };
    onFormChange: (d: { word: string }) => void;
    onSave: () => void;
    onClose: () => void;
  }) => {
    if (!isOpen) return null;
    return React.createElement(
      "div",
      { "data-testid": "entry-dialog" },
      React.createElement("input", {
        "data-testid": "word-input",
        value: formData.word ?? "",
        onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
          onFormChange({ word: e.target.value }),
      }),
      React.createElement("button", { "data-testid": "save-btn", onClick: onSave }, "保存"),
      React.createElement(
        "button",
        { "data-testid": "cancel-btn", onClick: onClose },
        "キャンセル",
      ),
    );
  },
}));

// Import SUT after mocks
import Dictionary from "../Dictionary";
import type { EditorMode } from "@/lib/project/project-types";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

// Use StandaloneMode so we don't need FileSystemDirectoryHandle objects.
const STANDALONE_MODE = {
  type: "standalone",
  fileHandle: null,
  fileName: "/tmp/test.mdi",
  fileExtension: ".mdi",
  editorSettings: {
    fontScale: 1,
    lineHeight: 1.5,
    paragraphSpacing: 0,
    textIndent: 1,
    fontFamily: "sans-serif",
    charsPerLine: 40,
    showParagraphNumbers: false,
    mdiExtensionsEnabled: true,
    posHighlightEnabled: false,
    posHighlightColors: {},
  },
} as EditorMode;

/** Minimal dict entry for assertions */
function makeDictEntry(id: string, entry: string, gloss: string) {
  return {
    id,
    entry,
    definitions: [{ gloss }],
    reading: { primary: `${entry}-reading`, alternatives: [] },
    partOfSpeech: "名詞",
    relationships: { synonyms: [], homophones: [], antonyms: [], related: [] },
    inflections: null,
    source: "genji",
  };
}

// ---------------------------------------------------------------------------
// #1932 — Sequential search race: stale response must be discarded
// ---------------------------------------------------------------------------

describe("#1932 — dictionary sequential search race", () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadStandalone.mockResolvedValue([]);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("discards slow first-query response when second query resolves first", async () => {
    // Two promises whose resolution order we fully control
    let resolveYuki!: (v: { entries: ReturnType<typeof makeDictEntry>[] }) => void;
    let resolveAme!: (v: { entries: ReturnType<typeof makeDictEntry>[] }) => void;

    const yukiPromise = new Promise<{ entries: ReturnType<typeof makeDictEntry>[] }>(
      (r) => (resolveYuki = r),
    );
    const amePromise = new Promise<{ entries: ReturnType<typeof makeDictEntry>[] }>(
      (r) => (resolveAme = r),
    );

    mockDictQuery.mockImplementation((term: string) => {
      if (term === "雪") return yukiPromise;
      if (term === "雨") return amePromise;
      return Promise.resolve({ entries: [] });
    });

    // Mount — first search "雪" is issued immediately via initialSearchTerm/searchTriggerId
    await act(async () => {
      root.render(
        React.createElement(Dictionary, {
          editorMode: STANDALONE_MODE,
          initialSearchTerm: "雪",
          searchTriggerId: 1,
        }),
      );
    });

    // Re-render with second search "雨" before "雪" resolves — generation bumped to 2
    await act(async () => {
      root.render(
        React.createElement(Dictionary, {
          editorMode: STANDALONE_MODE,
          initialSearchTerm: "雨",
          searchTriggerId: 2,
        }),
      );
    });

    // Resolve "雨" first (fast response — must win)
    const ameEntry = makeDictEntry("ame-1", "雨", "water-falling-gloss");
    await act(async () => {
      resolveAme({ entries: [ameEntry] });
      await Promise.resolve();
    });

    // Resolve "雪" second (stale — must be discarded)
    const yukiEntry = makeDictEntry("yuki-1", "雪", "frozen-precipitation-gloss");
    await act(async () => {
      resolveYuki({ entries: [yukiEntry] });
      await Promise.resolve();
    });

    const bodyText = container.textContent ?? "";
    expect(bodyText).toContain("water-falling-gloss");
    expect(bodyText).not.toContain("frozen-precipitation-gloss");
  });

  it("shows the most-recent query result when both resolve in order", async () => {
    mockDictQuery
      .mockResolvedValueOnce({ entries: [makeDictEntry("a-1", "A語", "a-gloss")] })
      .mockResolvedValueOnce({ entries: [makeDictEntry("b-1", "B語", "b-gloss")] });

    await act(async () => {
      root.render(
        React.createElement(Dictionary, {
          editorMode: STANDALONE_MODE,
          initialSearchTerm: "A語",
          searchTriggerId: 1,
        }),
      );
    });

    await act(async () => {
      root.render(
        React.createElement(Dictionary, {
          editorMode: STANDALONE_MODE,
          initialSearchTerm: "B語",
          searchTriggerId: 2,
        }),
      );
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const bodyText = container.textContent ?? "";
    expect(bodyText).toContain("b-gloss");
    expect(bodyText).not.toContain("a-gloss");
  });
});

// ---------------------------------------------------------------------------
// #1934 — Write failure must surface as error, not silent success
// ---------------------------------------------------------------------------

describe("#1934 — user dictionary write failure surfaced to user", () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadStandalone.mockResolvedValue([]);
    mockDictQuery.mockResolvedValue({ entries: [] });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function switchToUserTab(): Promise<void> {
    await act(async () => {
      const tabs = container.querySelectorAll("button");
      const userTab = Array.from(tabs).find((b) => b.textContent?.includes("ユーザー辞書"));
      userTab?.click();
    });
  }

  async function openAddDialog(): Promise<void> {
    await act(async () => {
      const buttons = container.querySelectorAll("button");
      const addBtn = Array.from(buttons).find((b) => b.textContent?.includes("新しい項目を追加"));
      addBtn?.click();
    });
  }

  async function typeWord(word: string): Promise<void> {
    await act(async () => {
      const wordInput = container.querySelector(
        '[data-testid="word-input"]',
      ) as HTMLInputElement | null;
      if (!wordInput) return;
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      nativeSetter?.call(wordInput, word);
      wordInput.dispatchEvent(new Event("input", { bubbles: true }));
      wordInput.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  it("shows error notification and keeps dialog open when save throws", async () => {
    mockSaveStandalone.mockRejectedValue(new Error("EACCES: permission denied"));

    await act(async () => {
      root.render(React.createElement(Dictionary, { editorMode: STANDALONE_MODE }));
    });

    await switchToUserTab();
    await openAddDialog();
    await typeWord("保存失敗QA");

    await act(async () => {
      const saveBtn = container.querySelector('[data-testid="save-btn"]') as HTMLElement | null;
      saveBtn?.click();
    });

    // Error notification must have been called
    expect(mockNotifError).toHaveBeenCalledOnce();
    expect(mockNotifError.mock.calls[0][0]).toMatch(/保存に失敗/);

    // Dialog must remain open so user can retry
    const dialog = container.querySelector('[data-testid="entry-dialog"]');
    expect(dialog).not.toBeNull();
  });

  it("closes dialog and does NOT notify error when save succeeds", async () => {
    mockSaveStandalone.mockResolvedValue(undefined);

    await act(async () => {
      root.render(React.createElement(Dictionary, { editorMode: STANDALONE_MODE }));
    });

    await switchToUserTab();
    await openAddDialog();
    await typeWord("成功テスト");

    await act(async () => {
      const saveBtn = container.querySelector('[data-testid="save-btn"]') as HTMLElement | null;
      saveBtn?.click();
    });

    expect(mockNotifError).not.toHaveBeenCalled();

    const dialog = container.querySelector('[data-testid="entry-dialog"]');
    expect(dialog).toBeNull();
  });

  it("shows error notification and rolls back entry when delete persist throws", async () => {
    const existingEntry = { id: "existing-1", word: "既存", reading: "きそん" };
    mockLoadStandalone.mockResolvedValue([existingEntry]);
    mockSaveStandalone.mockRejectedValue(new Error("disk full"));

    await act(async () => {
      root.render(React.createElement(Dictionary, { editorMode: STANDALONE_MODE }));
    });

    await switchToUserTab();

    expect(container.textContent).toContain("既存");

    await act(async () => {
      const deleteButton = container.querySelector('[title="削除"]') as HTMLElement | null;
      deleteButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // Error notification for delete failure
    expect(mockNotifError).toHaveBeenCalledOnce();
    expect(mockNotifError.mock.calls[0][0]).toMatch(/削除に失敗/);

    // Entry rolled back — still visible
    expect(container.textContent).toContain("既存");
  });
});
