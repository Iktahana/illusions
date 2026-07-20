import type { CommandId } from "./command-ids";
import type { ShortcutEntry } from "./keymap-types";

/**
 * Single source of truth for all keyboard shortcuts.
 * All command IDs, default bindings, labels, and scopes are defined here.
 */
export const SHORTCUT_REGISTRY: Record<CommandId, ShortcutEntry> = {
  // -- File ------------------------------------------------------------------
  "file.save": {
    id: "file.save",
    label: "保存",
    category: "file",
    defaultBinding: { modifiers: ["CmdOrCtrl"], key: "s" },
    scope: "all",
  },
  "file.saveAs": {
    id: "file.saveAs",
    label: "別名で保存",
    category: "file",
    defaultBinding: { modifiers: ["CmdOrCtrl", "Shift"], key: "s" },
    scope: "all",
  },
  "file.open": {
    id: "file.open",
    label: "ファイルを開く",
    category: "file",
    defaultBinding: { modifiers: ["CmdOrCtrl"], key: "o" },
    scope: "all",
  },
  "file.print": {
    id: "file.print",
    label: "印刷",
    category: "file",
    defaultBinding: { modifiers: ["CmdOrCtrl"], key: "p" },
    scope: "all",
  },
  "file.newWindow": {
    id: "file.newWindow",
    label: "新規ウィンドウ",
    category: "file",
    defaultBinding: { modifiers: ["CmdOrCtrl"], key: "n" },
    scope: "all",
  },
  "file.newTab": {
    id: "file.newTab",
    label: "新規タブ",
    category: "file",
    defaultBinding: { modifiers: ["CmdOrCtrl"], key: "t" },
    scope: "all",
  },
  "file.closeTab": {
    id: "file.closeTab",
    label: "タブを閉じる",
    category: "file",
    defaultBinding: { modifiers: ["CmdOrCtrl"], key: "w" },
    scope: "all",
  },

  // -- Edit ------------------------------------------------------------------
  "edit.undo": {
    id: "edit.undo",
    label: "元に戻す",
    category: "edit",
    defaultBinding: { modifiers: ["CmdOrCtrl"], key: "z" },
    scope: "all",
  },
  "edit.redo": {
    id: "edit.redo",
    label: "やり直す",
    category: "edit",
    defaultBinding: { modifiers: ["CmdOrCtrl"], key: "y" },
    scope: "all",
  },
  "edit.pasteAsPlaintext": {
    id: "edit.pasteAsPlaintext",
    label: "プレーンテキストとして貼り付け",
    category: "edit",
    defaultBinding: { modifiers: ["CmdOrCtrl", "Shift"], key: "v" },
    scope: "all",
  },
  "edit.selectAll": {
    id: "edit.selectAll",
    label: "すべて選択",
    category: "edit",
    defaultBinding: { modifiers: ["CmdOrCtrl"], key: "a" },
    scope: "all",
  },

  // -- View ------------------------------------------------------------------
  "view.zoomIn": {
    id: "view.zoomIn",
    label: "拡大",
    category: "view",
    defaultBinding: { modifiers: ["CmdOrCtrl"], key: "+" },
    scope: "all",
  },
  "view.zoomOut": {
    id: "view.zoomOut",
    label: "縮小",
    category: "view",
    defaultBinding: { modifiers: ["CmdOrCtrl"], key: "-" },
    scope: "all",
  },
  "view.resetZoom": {
    id: "view.resetZoom",
    label: "ズームをリセット",
    category: "view",
    defaultBinding: { modifiers: ["CmdOrCtrl"], key: "0" },
    scope: "all",
  },
  "view.compactMode": {
    id: "view.compactMode",
    label: "コンパクトモード切替",
    category: "view",
    defaultBinding: { modifiers: ["CmdOrCtrl", "Shift"], key: "m" },
    scope: "all",
  },
  "view.splitRight": {
    id: "view.splitRight",
    label: "右に分割",
    category: "view",
    defaultBinding: { modifiers: ["CmdOrCtrl"], key: "\\" },
    scope: "all",
  },
  "view.splitDown": {
    id: "view.splitDown",
    label: "下に分割",
    category: "view",
    defaultBinding: { modifiers: ["CmdOrCtrl", "Shift"], key: "\\" },
    scope: "all",
  },

  // -- Navigation ------------------------------------------------------------
  "nav.nextTab": {
    id: "nav.nextTab",
    label: "次のタブ",
    category: "nav",
    defaultBinding: { modifiers: ["Ctrl"], key: "Tab" },
    scope: "all",
  },
  "nav.prevTab": {
    id: "nav.prevTab",
    label: "前のタブ",
    category: "nav",
    defaultBinding: { modifiers: ["Ctrl", "Shift"], key: "Tab" },
    scope: "all",
  },
  "nav.tab1": {
    id: "nav.tab1",
    label: "タブ 1 へ移動",
    category: "nav",
    defaultBinding: { modifiers: ["CmdOrCtrl"], key: "1" },
    scope: "all",
  },
  "nav.tab2": {
    id: "nav.tab2",
    label: "タブ 2 へ移動",
    category: "nav",
    defaultBinding: { modifiers: ["CmdOrCtrl"], key: "2" },
    scope: "all",
  },
  "nav.tab3": {
    id: "nav.tab3",
    label: "タブ 3 へ移動",
    category: "nav",
    defaultBinding: { modifiers: ["CmdOrCtrl"], key: "3" },
    scope: "all",
  },
  "nav.tab4": {
    id: "nav.tab4",
    label: "タブ 4 へ移動",
    category: "nav",
    defaultBinding: { modifiers: ["CmdOrCtrl"], key: "4" },
    scope: "all",
  },
  "nav.tab5": {
    id: "nav.tab5",
    label: "タブ 5 へ移動",
    category: "nav",
    defaultBinding: { modifiers: ["CmdOrCtrl"], key: "5" },
    scope: "all",
  },
  "nav.tab6": {
    id: "nav.tab6",
    label: "タブ 6 へ移動",
    category: "nav",
    defaultBinding: { modifiers: ["CmdOrCtrl"], key: "6" },
    scope: "all",
  },
  "nav.tab7": {
    id: "nav.tab7",
    label: "タブ 7 へ移動",
    category: "nav",
    defaultBinding: { modifiers: ["CmdOrCtrl"], key: "7" },
    scope: "all",
  },
  "nav.tab8": {
    id: "nav.tab8",
    label: "タブ 8 へ移動",
    category: "nav",
    defaultBinding: { modifiers: ["CmdOrCtrl"], key: "8" },
    scope: "all",
  },
  "nav.tab9": {
    id: "nav.tab9",
    label: "タブ 9 へ移動",
    category: "nav",
    defaultBinding: { modifiers: ["CmdOrCtrl"], key: "9" },
    scope: "all",
  },
  "nav.settings": {
    id: "nav.settings",
    label: "設定を開く",
    category: "app",
    defaultBinding: { modifiers: ["CmdOrCtrl"], key: "," },
    scope: "all",
  },
  "nav.search": {
    id: "nav.search",
    label: "検索",
    category: "nav",
    defaultBinding: { modifiers: ["CmdOrCtrl"], key: "f" },
    scope: "all",
  },

  // -- Panel toggles ---------------------------------------------------------
  "panel.explorer": {
    id: "panel.explorer",
    label: "エクスプローラーを切替",
    category: "panel",
    defaultBinding: { modifiers: ["Ctrl", "Shift"], key: "e" },
    scope: "all",
  },
  "panel.search": {
    id: "panel.search",
    label: "検索パネルを切替",
    category: "panel",
    defaultBinding: { modifiers: ["Ctrl", "Shift"], key: "f" },
    scope: "all",
  },
  // TODO: Outline feature — planned for v1.3.0
  // "panel.outline": {
  //   id: "panel.outline",
  //   label: "アウトラインを切替",
  //   category: "panel",
  //   defaultBinding: { modifiers: ["Ctrl", "Shift"], key: "o" },
  //   scope: "all",
  // },

  // -- Format ----------------------------------------------------------------
  "format.ruby": {
    id: "format.ruby",
    label: "ルビを挿入",
    category: "format",
    defaultBinding: { modifiers: ["CmdOrCtrl", "Shift"], key: "r" },
    scope: "all",
  },
  "format.tcy": {
    id: "format.tcy",
    label: "縦中横を切替",
    category: "format",
    defaultBinding: { modifiers: ["CmdOrCtrl", "Shift"], key: "t" },
    scope: "all",
  },
};
