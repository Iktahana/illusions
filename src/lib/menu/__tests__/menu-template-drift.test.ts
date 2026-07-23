/**
 * Drift-prevention tests for the shared menu template (#1433).
 *
 * The Web menu (lib/menu/menu-definitions.ts) and the Electron native menu
 * (electron/menu.js) are both derived from lib/menu/menu-template.js. These
 * tests assert that both sides derive an identical core structure (ids,
 * order, labels, accelerators) from the shared source, and that the existing
 * behavior pinned in #1433 (recent-project submenu, checked states, keymap
 * overrides, macOS role-based app menu) is preserved.
 */
import { createRequire } from "module";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WEB_MENU_STRUCTURE, ACTION_TO_COMMAND_ID } from "@/lib/menu/menu-definitions";
import { MENU_TEMPLATE } from "@/lib/menu/menu-template";
import { isMacOS } from "@/lib/utils/runtime-env";

import type { MenuItem } from "@/lib/menu/menu-definitions";
import type { MenuTemplateItem } from "@/lib/menu/menu-template";

// ---------------------------------------------------------------------------
// Electron main-process stub (electron/menu.js is a CJS module).
// vi.mock("electron") does not intercept require() inside externalized CJS
// modules, so the stub is injected directly into Node's require cache.
// ---------------------------------------------------------------------------

const nodeRequire = createRequire(import.meta.url);
const electronId = nodeRequire.resolve("electron");
nodeRequire.cache[electronId] = {
  id: electronId,
  filename: electronId,
  loaded: true,
  exports: {
    app: { getVersion: () => "9.9.9" },
    BrowserWindow: { getFocusedWindow: () => null },
    Menu: { buildFromTemplate: vi.fn(), setApplicationMenu: vi.fn() },
    shell: { openExternal: vi.fn() },
  },
} as unknown as NodeJS.Module;

interface NativeMenuItem {
  label?: string;
  type?: string;
  role?: string;
  accelerator?: string;
  enabled?: boolean;
  checked?: boolean;
  submenu?: NativeMenuItem[];
  click?: () => void;
}

interface ElectronMenuModule {
  buildApplicationMenu: (
    recentProjects?: Array<{ id: string; name: string }>,
    platform?: string,
  ) => NativeMenuItem[];
  setMenuUiState: (state: Record<string, unknown>, windowId: number) => void;
  setKeymapOverrides: (overrides: Record<string, unknown>, windowId: number) => void;
  setActiveWindowId: (windowId: number | null) => void;
  removeWindowState: (windowId: number) => void;
}

async function loadElectronMenu(): Promise<ElectronMenuModule> {
  return (await import("../../../../electron/menu.js")) as unknown as ElectronMenuModule;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalizes an accelerator for cross-platform comparison (modifier order/name). */
function normalizeAccelerator(accel: string): string {
  const tokens = accel.endsWith("++")
    ? [...accel.slice(0, -2).split("+").filter(Boolean), "+"]
    : accel.split("+");
  const key = tokens[tokens.length - 1];
  const modifiers = tokens
    .slice(0, -1)
    .map((m) => (m === "CmdOrCtrl" || m === "Cmd" ? "Ctrl" : m))
    .sort();
  return [...modifiers, key].join("+");
}

function nonSeparator<T extends { type?: string }>(items: T[]): T[] {
  return items.filter((i) => i.type !== "separator");
}

/** Asserts the shared labels appear in order within the native labels. */
function assertOrderedSubsequence(sharedLabels: string[], nativeLabels: string[]): number[] {
  const indexes: number[] = [];
  let cursor = 0;
  for (const label of sharedLabels) {
    const found = nativeLabels.indexOf(label, cursor);
    expect(
      found,
      `label "${label}" missing or out of order in [${nativeLabels.join(", ")}]`,
    ).toBeGreaterThanOrEqual(0);
    indexes.push(found);
    cursor = found + 1;
  }
  return indexes;
}

function templateLabel(item: MenuTemplateItem): string {
  // The version row is dynamic on both platforms; compare by marker
  return item.dynamicLabel === "version" ? "__version__" : (item.label ?? "");
}

function labelOf(item: { label?: string }): string {
  return (item.label ?? "").startsWith("バージョン ") ? "__version__" : (item.label ?? "");
}

// ---------------------------------------------------------------------------
// Core structure: Web and Electron derive identical ids / order / labels
// ---------------------------------------------------------------------------

describe("shared menu template drift prevention", () => {
  let electronMenu: ElectronMenuModule;

  beforeEach(async () => {
    electronMenu = await loadElectronMenu();
    electronMenu.removeWindowState(1);
    electronMenu.removeWindowState(2);
    electronMenu.setActiveWindowId(null);
  });

  it("Web sections mirror the shared template (labels and order)", () => {
    expect(WEB_MENU_STRUCTURE.map((s) => s.label)).toEqual(MENU_TEMPLATE.map((s) => s.label));
  });

  it("Electron sections mirror the shared template (labels and order, no app menu on win32)", () => {
    const native = electronMenu.buildApplicationMenu([], "win32");
    expect(native.map((s) => s.label)).toEqual(MENU_TEMPLATE.map((s) => s.label));
  });

  it("Web and Electron derive identical core items (ids, order, labels) per section", () => {
    const native = electronMenu.buildApplicationMenu([], "win32");

    MENU_TEMPLATE.forEach((section, sectionIndex) => {
      const sharedItems = nonSeparator(section.items).filter((item) => item.webVisible !== false);
      const webItems = nonSeparator(WEB_MENU_STRUCTURE[sectionIndex].items);
      const nativeItems = nonSeparator(native[sectionIndex].submenu ?? []);

      // Web: exact one-to-one match with the shared core
      expect(webItems.map(labelOf)).toEqual(sharedItems.map(templateLabel));
      // Electron: shared core appears as an ordered subsequence
      // (electron-only items such as devtools/quit are allowed around it)
      const indexes = assertOrderedSubsequence(
        sharedItems.map(templateLabel),
        nativeItems.map(labelOf),
      );

      // Recurse one level into static submenus: nested levels must match exactly
      sharedItems.forEach((sharedItem, i) => {
        if (!sharedItem.submenu || sharedItem.dynamicSubmenu) return;
        const sharedChildren = nonSeparator(sharedItem.submenu);
        const webChildren = nonSeparator(webItems[i].submenu ?? []);
        const nativeChildren = nonSeparator(nativeItems[indexes[i]].submenu ?? []);
        expect(webChildren.map(labelOf)).toEqual(sharedChildren.map(templateLabel));
        expect(nativeChildren.map(labelOf)).toEqual(sharedChildren.map(templateLabel));
      });
    });
  });

  it("Web actions use the shared item ids", () => {
    MENU_TEMPLATE.forEach((section, sectionIndex) => {
      const sharedItems = nonSeparator(section.items).filter((item) => item.webVisible !== false);
      const webItems = nonSeparator(WEB_MENU_STRUCTURE[sectionIndex].items);
      sharedItems.forEach((sharedItem, i) => {
        if (sharedItem.submenu && !sharedItem.dynamicSubmenu) return; // containers
        if (sharedItem.enabled === false) return; // version row has no action
        expect(webItems[i].action).toBe(sharedItem.id);
      });
    });
  });

  it("default accelerators agree between Web and Electron for shared items", () => {
    const native = electronMenu.buildApplicationMenu([], "win32");

    const collectShared: Array<{ item: MenuTemplateItem }> = [];
    const walk = (items: MenuTemplateItem[]): void => {
      for (const item of items) {
        collectShared.push({ item });
        if (item.submenu) walk(item.submenu);
      }
    };
    MENU_TEMPLATE.forEach((s) => walk(s.items));

    const nativeByLabel = new Map<string, NativeMenuItem[]>();
    const walkNative = (items: NativeMenuItem[]): void => {
      for (const item of items) {
        if (item.label) {
          const list = nativeByLabel.get(item.label) ?? [];
          list.push(item);
          nativeByLabel.set(item.label, list);
        }
        if (item.submenu) walkNative(item.submenu);
      }
    };
    walkNative(native);

    for (const { item } of collectShared) {
      if (!item.nativeAccelerator || !item.label) continue;
      const candidates = nativeByLabel.get(item.label) ?? [];
      const accelerators = candidates.map((c) => c.accelerator).filter(Boolean);
      expect(accelerators, `native accelerator for ${item.id}`).toContain(item.nativeAccelerator);
      if (typeof item.webAccelerator === "string") {
        expect(normalizeAccelerator(item.webAccelerator)).toBe(
          normalizeAccelerator(item.nativeAccelerator),
        );
      }
    }
  });

  // -------------------------------------------------------------------------
  // recent-project dynamic submenu
  // -------------------------------------------------------------------------

  it("Electron injects recent projects into the dynamic submenu", () => {
    const native = electronMenu.buildApplicationMenu([{ id: "p1", name: "小説A" }], "win32");
    const fileSection = native.find((s) => s.label === "ファイル");
    const recent = fileSection?.submenu?.find((i) => i.label === "最近のプロジェクトを開く");
    expect(recent?.submenu?.map((i) => i.label)).toEqual(["小説A"]);
  });

  it("Electron shows 項目なし when there are no recent projects", () => {
    const native = electronMenu.buildApplicationMenu([], "win32");
    const fileSection = native.find((s) => s.label === "ファイル");
    const recent = fileSection?.submenu?.find((i) => i.label === "最近のプロジェクトを開く");
    expect(recent?.submenu).toEqual([{ label: "項目なし", enabled: false }]);
  });

  it("Web keeps the recent-project injection marker (action + empty submenu)", () => {
    const fileSection = WEB_MENU_STRUCTURE.find((s) => s.label === "ファイル");
    const recent = fileSection?.items.find((i) => i.label === "最近のプロジェクトを開く");
    expect(recent?.action).toBe("open-recent-project");
    expect(recent?.submenu).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // checked states reflect renderer UI state
  // -------------------------------------------------------------------------

  it("checkbox/radio checked states reflect the renderer-reported UI state", () => {
    electronMenu.setMenuUiState(
      {
        compactMode: true,
        showParagraphNumbers: false,
        themeMode: "dark",
        autoCharsPerLine: false,
      },
      1,
    );
    electronMenu.setActiveWindowId(1);
    const native = electronMenu.buildApplicationMenu([], "win32");

    const windowSection = native.find((s) => s.label === "ウィンドウ");
    const compact = windowSection?.submenu?.find((i) => i.label === "コンパクトモード");
    expect(compact?.type).toBe("checkbox");
    expect(compact?.checked).toBe(true);

    const darkMode = windowSection?.submenu?.find((i) => i.label === "ダークモード");
    const themes = darkMode?.submenu ?? [];
    expect(themes.map((t) => [t.label, t.type, t.checked])).toEqual([
      ["自動", "radio", false],
      ["オフ", "radio", false],
      ["オン", "radio", true],
    ]);

    const formatSection = native.find((s) => s.label === "書式");
    const paragraphNumbers = formatSection?.submenu?.find((i) => i.label === "段落番号を表示");
    expect(paragraphNumbers?.type).toBe("checkbox");
    expect(paragraphNumbers?.checked).toBe(false);

    const charsPerLine = formatSection?.submenu?.find((i) => i.label === "1行あたりの文字数");
    const auto = charsPerLine?.submenu?.find((i) => i.label === "自動");
    expect(auto?.type).toBe("checkbox");
    expect(auto?.checked).toBe(false);
    // increase/decrease are enabled only when auto is off
    const increase = charsPerLine?.submenu?.find((i) => i.label === "増やす");
    const decrease = charsPerLine?.submenu?.find((i) => i.label === "減らす");
    expect(increase?.enabled).toBe(true);
    expect(decrease?.enabled).toBe(true);
  });

  it("disables document actions when no editor tab is active", () => {
    electronMenu.setMenuUiState({ hasActiveEditor: false }, 1);
    electronMenu.setActiveWindowId(1);
    const native = electronMenu.buildApplicationMenu([], "win32");
    const fileSection = native.find((s) => s.label === "ファイル");

    for (const label of ["保存", "別名で保存...", "印刷...", "エクスポート", "タブを閉じる"]) {
      expect(fileSection?.submenu?.find((item) => item.label === label)?.enabled).toBe(false);
    }
  });

  // -------------------------------------------------------------------------
  // user keymap overrides affect the native accelerator
  // -------------------------------------------------------------------------

  it("user keymap overrides replace the default native accelerator", () => {
    electronMenu.setKeymapOverrides(
      { "file.save": { modifiers: ["CmdOrCtrl", "Shift"], key: "p" } },
      2,
    );
    electronMenu.setActiveWindowId(2);
    const native = electronMenu.buildApplicationMenu([], "win32");
    const fileSection = native.find((s) => s.label === "ファイル");
    const save = fileSection?.submenu?.find((i) => i.label === "保存");
    expect(save?.accelerator).toBe("CmdOrCtrl+Shift+P");
  });

  it("a null override unbinds the native accelerator", () => {
    electronMenu.setKeymapOverrides({ "file.save": null }, 2);
    electronMenu.setActiveWindowId(2);
    const native = electronMenu.buildApplicationMenu([], "win32");
    const fileSection = native.find((s) => s.label === "ファイル");
    const save = fileSection?.submenu?.find((i) => i.label === "保存");
    expect(save?.accelerator).toBeUndefined();
  });

  it("Settings uses its nav.settings keymap binding", () => {
    electronMenu.setKeymapOverrides(
      { "nav.settings": { modifiers: ["CmdOrCtrl", "Shift"], key: "s" } },
      2,
    );
    electronMenu.setActiveWindowId(2);
    const native = electronMenu.buildApplicationMenu([], "darwin");
    const settings = native[0].submenu?.find((i) => i.label === "設定…");
    expect(settings?.accelerator).toBe("CmdOrCtrl+Shift+S");
  });

  // -------------------------------------------------------------------------
  // macOS app menu (role-based) and platform-only items
  // -------------------------------------------------------------------------

  it("macOS puts Settings in the app menu and drops the file-menu quit item", () => {
    const native = electronMenu.buildApplicationMenu([], "darwin");
    expect(native[0].label).toBe("illusions");
    expect(
      native[0].submenu?.every((i) => i.role || i.type === "separator" || i.label === "設定…"),
    ).toBe(true);
    const settings = native[0].submenu?.find((i) => i.label === "設定…");
    expect(settings?.accelerator).toBe("CmdOrCtrl+,");

    const fileSection = native.find((s) => s.label === "ファイル");
    expect(fileSection?.submenu?.some((i) => i.role === "quit")).toBe(false);
    expect(fileSection?.submenu?.some((i) => i.label === "設定…")).toBe(false);
  });

  it("non-macOS appends quit to the file menu", () => {
    const native = electronMenu.buildApplicationMenu([], "win32");
    const fileSection = native.find((s) => s.label === "ファイル");
    const last = fileSection?.submenu?.[fileSection.submenu.length - 1];
    expect(last).toMatchObject({ role: "quit", label: "終了" });
    expect(fileSection?.submenu?.some((i) => i.label === "設定…")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Behavior pinning: the derived Web structure equals the pre-refactor literal
// ---------------------------------------------------------------------------

describe("WEB_MENU_STRUCTURE", () => {
  it("includes the Settings entry in the shared Web menu definition", () => {
    const APP_VERSION = (() => {
      const v = process.env.NEXT_PUBLIC_APP_VERSION || "0.0.0";
      const parts = v.split(".");
      if (parts.length >= 3 && parts[2] !== "0") return v;
      return parts.slice(0, 2).join(".");
    })();

    const expected: Array<{ label: string; items: MenuItem[] }> = [
      {
        label: "ファイル",
        items: [
          { label: "新規ウィンドウ", accelerator: "Ctrl+N", action: "new-window" },
          { label: "最近のプロジェクトを開く", action: "open-recent-project", submenu: [] },
          { label: "プロジェクトを開く", action: "open-project" },
          { type: "separator" },
          { label: "ファイルを開く...", accelerator: "Ctrl+O", action: "open-file" },
          { label: "保存", accelerator: "Ctrl+S", action: "save-file" },
          { label: "別名で保存...", accelerator: "Shift+Ctrl+S", action: "save-as" },
          { type: "separator" },
          {
            label: "印刷...",
            accelerator: isMacOS() ? "Cmd+P" : "Ctrl+P",
            action: "print",
          },
          {
            label: "エクスポート",
            submenu: [
              { label: "テキスト（プレーン）としてエクスポート...", action: "export-txt" },
              { label: "テキスト（ルビ付き）としてエクスポート...", action: "export-txt-ruby" },
              { label: "小説家になろう形式としてエクスポート...", action: "export-narou" },
              { label: "カクヨム形式としてエクスポート...", action: "export-kakuyomu" },
              { label: "青空文庫形式としてエクスポート...", action: "export-aozora" },
              { type: "separator" },
              {
                label: "テキスト（プレーン）をクリップボードにコピー",
                action: "copy-txt",
              },
              {
                label: "テキスト（ルビ付き）をクリップボードにコピー",
                action: "copy-txt-ruby",
              },
              {
                label: "小説家になろう形式をクリップボードにコピー",
                action: "copy-narou",
              },
              {
                label: "カクヨム形式をクリップボードにコピー",
                action: "copy-kakuyomu",
              },
              {
                label: "青空文庫形式をクリップボードにコピー",
                action: "copy-aozora",
              },
              { type: "separator" },
              { label: "PDF としてエクスポート...", action: "export-pdf" },
              { label: "EPUB としてエクスポート...", action: "export-epub" },
              { label: "DOCX としてエクスポート...", action: "export-docx" },
            ],
          },
          { type: "separator" },
          { label: "新しいタブ", accelerator: "Ctrl+T", action: "new-tab" },
          { label: "タブを閉じる", accelerator: "Ctrl+W", action: "close-tab" },
          { label: "設定…", action: "settings" },
        ],
      },
      {
        label: "編集",
        items: [
          { label: "元に戻す", accelerator: "Ctrl+Z", action: "undo" },
          { label: "やり直す", accelerator: "Ctrl+Y", action: "redo" },
          { type: "separator" },
          { label: "切り取り", accelerator: "Ctrl+X", action: "cut" },
          { label: "コピー", accelerator: "Ctrl+C", action: "copy" },
          { label: "貼り付け", accelerator: "Ctrl+V", action: "paste" },
          {
            label: "プレーンテキストとして貼り付け",
            accelerator: "Shift+Ctrl+V",
            action: "paste-plaintext",
          },
          { type: "separator" },
          { label: "すべて選択", accelerator: "Ctrl+A", action: "select-all" },
        ],
      },
      {
        label: "書式",
        items: [
          {
            label: "行間",
            submenu: [
              { label: "広くする", accelerator: "Ctrl+]", action: "format-line-height-increase" },
              { label: "狭くする", accelerator: "Ctrl+[", action: "format-line-height-decrease" },
            ],
          },
          {
            label: "段落間隔",
            submenu: [
              { label: "広くする", action: "format-paragraph-spacing-increase" },
              { label: "狭くする", action: "format-paragraph-spacing-decrease" },
            ],
          },
          {
            label: "字下げ",
            submenu: [
              { label: "深くする", action: "format-text-indent-increase" },
              { label: "浅くする", action: "format-text-indent-decrease" },
              { label: "なし", action: "format-text-indent-none" },
            ],
          },
          { type: "separator" },
          {
            label: "1行あたりの文字数",
            submenu: [
              { label: "自動", type: "checkbox", action: "format-chars-per-line-auto" },
              { type: "separator" },
              { label: "増やす", action: "format-chars-per-line-increase" },
              { label: "減らす", action: "format-chars-per-line-decrease" },
            ],
          },
          { type: "separator" },
          { label: "段落番号を表示", type: "checkbox", action: "format-paragraph-numbers-toggle" },
        ],
      },
      {
        label: "表示",
        items: [
          { label: "実際のサイズ", accelerator: "Ctrl+0", action: "reset-zoom" },
          { label: "拡大", accelerator: "Ctrl++", action: "zoom-in" },
          { label: "縮小", accelerator: "Ctrl+-", action: "zoom-out" },
          { type: "separator" },
          {
            label: "縦書き／横書きを切り替え",
            accelerator: "Alt+V",
            action: "toggle-writing-mode",
          },
        ],
      },
      {
        label: "ウィンドウ",
        items: [
          { label: "コンパクトモード", type: "checkbox", action: "toggle-compact-mode" },
          {
            label: "ダークモード",
            submenu: [
              { label: "自動", type: "checkbox", action: "theme-auto" },
              { label: "オフ", type: "checkbox", action: "theme-light" },
              { label: "オン", type: "checkbox", action: "theme-dark" },
            ],
          },
        ],
      },
      {
        label: "ヘルプ",
        items: [
          { label: `バージョン ${APP_VERSION}`, enabled: false },
          { type: "separator" },
          { label: "公式サイトへ", action: "open-website" },
          { label: "バグ・ご要望を報告", action: "report-bug" },
          { label: "AI回答の不適切を報告", action: "report-ai-inappropriate" },
        ],
      },
    ];

    expect(WEB_MENU_STRUCTURE).toEqual(expected);
  });

  it("maps Settings to its keyboard command", () => {
    expect(ACTION_TO_COMMAND_ID).toEqual({
      "new-window": "file.newWindow",
      "open-file": "file.open",
      "save-file": "file.save",
      "save-as": "file.saveAs",
      "new-tab": "file.newTab",
      "close-tab": "file.closeTab",
      undo: "edit.undo",
      redo: "edit.redo",
      "paste-plaintext": "edit.pasteAsPlaintext",
      "select-all": "edit.selectAll",
      "reset-zoom": "view.resetZoom",
      "zoom-in": "view.zoomIn",
      "zoom-out": "view.zoomOut",
      "toggle-writing-mode": "view.toggleWritingMode",
      "toggle-compact-mode": "view.compactMode",
      settings: "nav.settings",
    });
  });
});
