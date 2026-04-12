/**
 * Menu definitions for Web menu bar
 * Mirrors Electron native menu structure
 */
import type { CommandId } from "@/lib/keymap/command-ids";
import { isMacOS } from "@/lib/utils/runtime-env";

const APP_VERSION = (() => {
  const v = process.env.NEXT_PUBLIC_APP_VERSION || "0.0.0";
  const parts = v.split(".");
  if (parts.length >= 3 && parts[2] !== "0") return v;
  return parts.slice(0, 2).join(".");
})();

export interface MenuItem {
  label?: string;
  type?: "normal" | "separator" | "checkbox";
  accelerator?: string;
  action?: string;
  enabled?: boolean;
  checked?: boolean;
  submenu?: MenuItem[];
}

export interface MenuSection {
  label: string;
  items: MenuItem[];
}

export const WEB_MENU_STRUCTURE: MenuSection[] = [
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
          { type: "separator" },
          { label: "PDF としてエクスポート...", action: "export-pdf" },
          { label: "EPUB としてエクスポート...", action: "export-epub" },
          { label: "DOCX としてエクスポート...", action: "export-docx" },
        ],
      },
      { type: "separator" },
      { label: "新しいタブ", accelerator: "Ctrl+T", action: "new-tab" },
      { label: "タブを閉じる", accelerator: "Ctrl+W", action: "close-tab" },
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
      { label: "AI回答の不適切を報告", action: "report-ai-inappropriate" },
    ],
  },
];

/**
 * Maps menu action strings to their corresponding CommandIds in the keymap registry.
 * Used by WebMenuBar to inject dynamic accelerator strings from user overrides.
 */
export const ACTION_TO_COMMAND_ID: Partial<Record<string, CommandId>> = {
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
  "toggle-compact-mode": "view.compactMode",
};

/**
 * Format accelerator for display
 * Mac: Shows ⌘, ⇧, ⌥
 * Other: Shows Ctrl, Shift, Alt
 */
export function formatAccelerator(accelerator: string): string {
  if (typeof navigator === "undefined") {
    return accelerator;
  }

  const isMac = isMacOS();

  if (isMac) {
    return accelerator
      .replace(/Ctrl\+/g, "⌘")
      .replace(/Shift\+/g, "⇧")
      .replace(/Alt\+/g, "⌥");
  }

  return accelerator;
}
