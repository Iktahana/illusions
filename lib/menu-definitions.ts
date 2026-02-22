/**
 * Menu definitions for Web menu bar
 * Mirrors Electron native menu structure
 */

const APP_VERSION = (() => {
  const v = process.env.NEXT_PUBLIC_APP_VERSION || "0.0.0";
  const parts = v.split(".");
  if (parts.length >= 3 && parts[2] !== "0") return v;
  return parts.slice(0, 2).join(".");
})();

export interface MenuItem {
  label?: string;
  type?: 'normal' | 'separator' | 'checkbox';
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
    label: 'ファイル',
    items: [
      { label: '新規ウィンドウ', accelerator: 'Ctrl+N', action: 'new-window' },
      { label: '最近のプロジェクトを開く', action: 'open-recent-project', submenu: [] },
      { label: 'プロジェクトを開く', action: 'open-project' },
      { type: 'separator' },
      { label: 'ファイルを開く...', accelerator: 'Ctrl+O', action: 'open-file' },
      { label: '保存', accelerator: 'Ctrl+S', action: 'save-file' },
      { label: '別名で保存...', accelerator: 'Shift+Ctrl+S', action: 'save-as' },
      { type: 'separator' },
      {
        label: 'エクスポート',
        submenu: [
          { label: 'テキスト（プレーン）としてエクスポート...', action: 'export-txt' },
          { label: 'テキスト（ルビ付き）としてエクスポート...', action: 'export-txt-ruby' },
          { type: 'separator' },
          { label: 'PDF としてエクスポート...', action: 'export-pdf' },
          { label: 'EPUB としてエクスポート...', action: 'export-epub' },
          { label: 'DOCX としてエクスポート...', action: 'export-docx' },
        ],
      },
      { type: 'separator' },
      { label: '閉じる', accelerator: 'Ctrl+W', action: 'close-window' },
    ]
  },
  {
    label: '編集',
    items: [
      { label: '元に戻す', accelerator: 'Ctrl+Z', action: 'undo' },
      { label: 'やり直す', accelerator: 'Ctrl+Y', action: 'redo' },
      { type: 'separator' },
      { label: '切り取り', accelerator: 'Ctrl+X', action: 'cut' },
      { label: 'コピー', accelerator: 'Ctrl+C', action: 'copy' },
      { label: '貼り付け', accelerator: 'Ctrl+V', action: 'paste' },
      { label: 'プレーンテキストとして貼り付け', accelerator: 'Shift+Ctrl+V', action: 'paste-plaintext' },
      { type: 'separator' },
      { label: 'すべて選択', accelerator: 'Ctrl+A', action: 'select-all' },
    ]
  },
  {
    label: '表示',
    items: [
      { label: '実際のサイズ', accelerator: 'Ctrl+0', action: 'reset-zoom' },
      { label: '拡大', accelerator: 'Ctrl++', action: 'zoom-in' },
      { label: '縮小', accelerator: 'Ctrl+-', action: 'zoom-out' },
    ]
  },
  {
    label: 'ウィンドウ',
    items: [
      { label: 'コンパクトモード', type: 'checkbox', action: 'toggle-compact-mode' },
    ]
  },
  {
    label: 'ヘルプ',
    items: [
      { label: `バージョン ${APP_VERSION}`, enabled: false },
    ]
  }
];

/**
 * Format accelerator for display
 * Mac: Shows ⌘, ⇧, ⌥
 * Other: Shows Ctrl, Shift, Alt
 */
export function formatAccelerator(accelerator: string): string {
  if (typeof navigator === 'undefined') {
    return accelerator;
  }
  
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  
  if (isMac) {
    return accelerator
      .replace(/Ctrl\+/g, '⌘')
      .replace(/Shift\+/g, '⇧')
      .replace(/Alt\+/g, '⌥');
  }
  
  return accelerator;
}
