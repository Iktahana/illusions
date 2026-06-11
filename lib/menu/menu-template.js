/**
 * Single source of truth for the application menu (#1433).
 *
 * The Web menu bar (lib/menu/menu-definitions.ts) and the Electron native
 * menu (electron/menu.js) are both derived from MENU_TEMPLATE so that menu
 * structure, labels, ordering, action ids, and default accelerators can no
 * longer drift between the two platforms.
 *
 * Platform-only entries stay on each side:
 * - Electron-only items (macOS app menu, devtools, quit, window roles,
 *   update check) are appended/prepended in electron/menu.js.
 * - Click handling stays platform-side: the Web menu dispatches `id` as the
 *   action string, Electron uses `electronChannel`/`electronRole`/etc.
 *
 * NOTE: this module is a plain CommonJS file (not TypeScript) because it is
 * required by both the Electron main process (bundled via esbuild without
 * path aliases) and the Next.js renderer. Types live in menu-template.d.ts.
 *
 * @typedef {import("./menu-template").MenuTemplateItem} MenuTemplateItem
 * @typedef {import("./menu-template").MenuTemplateSection} MenuTemplateSection
 */

/** @type {MenuTemplateItem} */
const SEPARATOR = { type: "separator" };

/** @type {MenuTemplateSection[]} */
const MENU_TEMPLATE = [
  {
    id: "file",
    label: "ファイル",
    items: [
      {
        id: "new-window",
        label: "新規ウィンドウ",
        commandId: "file.newWindow",
        nativeAccelerator: "CmdOrCtrl+N",
        webAccelerator: "Ctrl+N",
        electronHandler: "new-window",
      },
      {
        id: "open-recent-project",
        label: "最近のプロジェクトを開く",
        dynamicSubmenu: "recent-projects",
        electronChannel: "menu-open-recent-project",
      },
      {
        id: "open-project",
        label: "プロジェクトを開く",
        electronChannel: "menu-open-project",
      },
      SEPARATOR,
      {
        id: "open-file",
        label: "ファイルを開く...",
        commandId: "file.open",
        nativeAccelerator: "CmdOrCtrl+O",
        webAccelerator: "Ctrl+O",
        electronChannel: "menu-open-triggered",
      },
      {
        id: "save-file",
        label: "保存",
        commandId: "file.save",
        nativeAccelerator: "CmdOrCtrl+S",
        webAccelerator: "Ctrl+S",
        electronChannel: "menu-save-triggered",
      },
      {
        id: "save-as",
        label: "別名で保存...",
        commandId: "file.saveAs",
        nativeAccelerator: "CmdOrCtrl+Shift+S",
        webAccelerator: "Shift+Ctrl+S",
        electronChannel: "menu-save-as-triggered",
      },
      SEPARATOR,
      {
        id: "print",
        label: "印刷...",
        // Electron resolves user overrides for file.print but has no default
        // native accelerator; the Web menu shows a static platform string.
        commandId: "file.print",
        webCommandLookup: false,
        webAccelerator: { mac: "Cmd+P", other: "Ctrl+P" },
        electronChannel: "menu-print",
      },
      {
        id: "export",
        label: "エクスポート",
        submenu: [
          {
            id: "export-txt",
            label: "テキスト（プレーン）としてエクスポート...",
            electronChannel: "menu-export-txt",
          },
          {
            id: "export-txt-ruby",
            label: "テキスト（ルビ付き）としてエクスポート...",
            electronChannel: "menu-export-txt-ruby",
          },
          SEPARATOR,
          {
            id: "export-pdf",
            label: "PDF としてエクスポート...",
            electronChannel: "menu-export-pdf",
          },
          {
            id: "export-epub",
            label: "EPUB としてエクスポート...",
            electronChannel: "menu-export-epub",
          },
          {
            id: "export-docx",
            label: "DOCX としてエクスポート...",
            electronChannel: "menu-export-docx",
          },
        ],
      },
      SEPARATOR,
      {
        id: "new-tab",
        label: "新しいタブ",
        commandId: "file.newTab",
        nativeAccelerator: "CmdOrCtrl+T",
        webAccelerator: "Ctrl+T",
        electronChannel: "menu-new-tab",
      },
      {
        id: "close-tab",
        label: "タブを閉じる",
        commandId: "file.closeTab",
        nativeAccelerator: "CmdOrCtrl+W",
        webAccelerator: "Ctrl+W",
        electronChannel: "menu-close-tab",
      },
    ],
  },
  {
    id: "edit",
    label: "編集",
    items: [
      {
        id: "undo",
        label: "元に戻す",
        commandId: "edit.undo",
        webAccelerator: "Ctrl+Z",
        electronRole: "undo",
      },
      {
        id: "redo",
        label: "やり直す",
        commandId: "edit.redo",
        webAccelerator: "Ctrl+Y",
        electronRole: "redo",
      },
      SEPARATOR,
      { id: "cut", label: "切り取り", webAccelerator: "Ctrl+X", electronRole: "cut" },
      { id: "copy", label: "コピー", webAccelerator: "Ctrl+C", electronRole: "copy" },
      { id: "paste", label: "貼り付け", webAccelerator: "Ctrl+V", electronRole: "paste" },
      {
        id: "paste-plaintext",
        label: "プレーンテキストとして貼り付け",
        commandId: "edit.pasteAsPlaintext",
        nativeAccelerator: "CmdOrCtrl+Shift+V",
        webAccelerator: "Shift+Ctrl+V",
        electronChannel: "menu-paste-as-plaintext",
      },
      SEPARATOR,
      {
        id: "select-all",
        label: "すべて選択",
        commandId: "edit.selectAll",
        webAccelerator: "Ctrl+A",
        electronRole: "selectAll",
      },
    ],
  },
  {
    id: "format",
    label: "書式",
    items: [
      {
        id: "line-height",
        label: "行間",
        submenu: [
          {
            id: "format-line-height-increase",
            label: "広くする",
            nativeAccelerator: "CmdOrCtrl+]",
            webAccelerator: "Ctrl+]",
            electronChannel: "menu-format",
            electronArgs: ["lineHeight", "increase"],
          },
          {
            id: "format-line-height-decrease",
            label: "狭くする",
            nativeAccelerator: "CmdOrCtrl+[",
            webAccelerator: "Ctrl+[",
            electronChannel: "menu-format",
            electronArgs: ["lineHeight", "decrease"],
          },
        ],
      },
      {
        id: "paragraph-spacing",
        label: "段落間隔",
        submenu: [
          {
            id: "format-paragraph-spacing-increase",
            label: "広くする",
            electronChannel: "menu-format",
            electronArgs: ["paragraphSpacing", "increase"],
          },
          {
            id: "format-paragraph-spacing-decrease",
            label: "狭くする",
            electronChannel: "menu-format",
            electronArgs: ["paragraphSpacing", "decrease"],
          },
        ],
      },
      {
        id: "text-indent",
        label: "字下げ",
        submenu: [
          {
            id: "format-text-indent-increase",
            label: "深くする",
            electronChannel: "menu-format",
            electronArgs: ["textIndent", "increase"],
          },
          {
            id: "format-text-indent-decrease",
            label: "浅くする",
            electronChannel: "menu-format",
            electronArgs: ["textIndent", "decrease"],
          },
          {
            id: "format-text-indent-none",
            label: "なし",
            electronChannel: "menu-format",
            electronArgs: ["textIndent", "none"],
          },
        ],
      },
      SEPARATOR,
      {
        id: "chars-per-line",
        label: "1行あたりの文字数",
        submenu: [
          {
            id: "format-chars-per-line-auto",
            label: "自動",
            type: "checkbox",
            checkedState: { key: "autoCharsPerLine" },
            electronChannel: "menu-format",
            electronArgs: ["charsPerLine", "auto"],
          },
          SEPARATOR,
          {
            id: "format-chars-per-line-increase",
            label: "増やす",
            enabledWhenNotState: "autoCharsPerLine",
            electronChannel: "menu-format",
            electronArgs: ["charsPerLine", "increase"],
          },
          {
            id: "format-chars-per-line-decrease",
            label: "減らす",
            enabledWhenNotState: "autoCharsPerLine",
            electronChannel: "menu-format",
            electronArgs: ["charsPerLine", "decrease"],
          },
        ],
      },
      SEPARATOR,
      {
        id: "format-paragraph-numbers-toggle",
        label: "段落番号を表示",
        type: "checkbox",
        checkedState: { key: "showParagraphNumbers" },
        electronChannel: "menu-format",
        electronArgs: ["paragraphNumbers", "toggle"],
      },
    ],
  },
  {
    id: "view",
    label: "表示",
    items: [
      {
        id: "reset-zoom",
        label: "実際のサイズ",
        commandId: "view.resetZoom",
        webAccelerator: "Ctrl+0",
        electronRole: "resetZoom",
      },
      {
        id: "zoom-in",
        label: "拡大",
        commandId: "view.zoomIn",
        webAccelerator: "Ctrl++",
        electronRole: "zoomIn",
      },
      {
        id: "zoom-out",
        label: "縮小",
        commandId: "view.zoomOut",
        webAccelerator: "Ctrl+-",
        electronRole: "zoomOut",
      },
    ],
  },
  {
    id: "window",
    label: "ウィンドウ",
    items: [
      {
        id: "toggle-compact-mode",
        label: "コンパクトモード",
        type: "checkbox",
        commandId: "view.compactMode",
        nativeAccelerator: "CmdOrCtrl+Shift+M",
        checkedState: { key: "compactMode" },
        electronChannel: "menu-toggle-compact-mode",
      },
      {
        id: "dark-mode",
        label: "ダークモード",
        submenu: [
          {
            id: "theme-auto",
            label: "自動",
            type: "checkbox",
            electronType: "radio",
            checkedState: { key: "themeMode", value: "auto" },
            electronChannel: "menu-theme",
            electronArgs: ["auto"],
          },
          {
            id: "theme-light",
            label: "オフ",
            type: "checkbox",
            electronType: "radio",
            checkedState: { key: "themeMode", value: "light" },
            electronChannel: "menu-theme",
            electronArgs: ["light"],
          },
          {
            id: "theme-dark",
            label: "オン",
            type: "checkbox",
            electronType: "radio",
            checkedState: { key: "themeMode", value: "dark" },
            electronChannel: "menu-theme",
            electronArgs: ["dark"],
          },
        ],
      },
    ],
  },
  {
    id: "help",
    label: "ヘルプ",
    items: [
      { id: "app-version", dynamicLabel: "version", enabled: false },
      SEPARATOR,
      {
        id: "open-website",
        label: "公式サイトへ",
        electronOpenExternal: "https://www.illusions.app/",
      },
      {
        id: "report-ai-inappropriate",
        label: "AI回答の不適切を報告",
        electronOpenExternal: "https://github.com/Iktahana/illusions/issues/new",
      },
    ],
  },
];

/**
 * Shared label format for the version info row in the help menu.
 * @param {string} version
 * @returns {string}
 */
function formatVersionLabel(version) {
  return `バージョン ${version}`;
}

/**
 * @param {MenuTemplateItem[]} items
 * @param {(item: MenuTemplateItem) => void} visit
 * @returns {void}
 */
function walkItems(items, visit) {
  for (const item of items) {
    visit(item);
    if (item.submenu) walkItems(item.submenu, visit);
  }
}

/**
 * Visits every item (including nested submenus) in the shared template.
 * @param {(item: MenuTemplateItem) => void} visit
 * @returns {void}
 */
function forEachTemplateItem(visit) {
  for (const section of MENU_TEMPLATE) {
    walkItems(section.items, visit);
  }
}

/**
 * Default Electron accelerator strings keyed by CommandId, derived from the
 * shared template. Used by electron/menu.js as the fallback when the user
 * has no keymap override for a command.
 * @returns {Record<string, string>}
 */
function getNativeDefaultAccelerators() {
  /** @type {Record<string, string>} */
  const map = {};
  forEachTemplateItem((item) => {
    if (item.commandId && item.nativeAccelerator) {
      map[item.commandId] = item.nativeAccelerator;
    }
  });
  return map;
}

module.exports = {
  MENU_TEMPLATE,
  formatVersionLabel,
  forEachTemplateItem,
  getNativeDefaultAccelerators,
};
