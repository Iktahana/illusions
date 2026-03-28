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

/**
 * Default accelerator for each menu action.
 * This is the single source of truth for keyboard shortcuts displayed in the
 * Web menu bar.  Pass overrides via the `acceleratorOverrides` prop on
 * `<WebMenuBar>` to reflect user-customised keymaps at runtime.
 */
export const DEFAULT_ACTION_ACCELERATORS: Record<string, string> = {
  'new-window':       'Ctrl+N',
  'open-file':        'Ctrl+O',
  'save-file':        'Ctrl+S',
  'save-as':          'Shift+Ctrl+S',
  'close-window':     'Ctrl+W',
  'undo':             'Ctrl+Z',
  'redo':             'Ctrl+Y',
  'cut':              'Ctrl+X',
  'copy':             'Ctrl+C',
  'paste':            'Ctrl+V',
  'paste-plaintext':  'Shift+Ctrl+V',
  'select-all':       'Ctrl+A',
  'reset-zoom':       'Ctrl+0',
  'zoom-in':          'Ctrl++',
  'zoom-out':         'Ctrl+-',
};

export const WEB_MENU_STRUCTURE: MenuSection[] = [
  {
    label: 'ファイル',
    items: [
      { label: '新規ウィンドウ', action: 'new-window' },
      { label: '最近のプロジェクトを開く', action: 'open-recent-project', submenu: [] },
      { label: 'プロジェクトを開く', action: 'open-project' },
      { type: 'separator' },
      { label: 'ファイルを開く...', action: 'open-file' },
      { label: '保存', action: 'save-file' },
      { label: '別名で保存...', action: 'save-as' },
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
      { label: '閉じる', action: 'close-window' },
    ]
  },
  {
    label: '編集',
    items: [
      { label: '元に戻す', action: 'undo' },
      { label: 'やり直す', action: 'redo' },
      { type: 'separator' },
      { label: '切り取り', action: 'cut' },
      { label: 'コピー', action: 'copy' },
      { label: '貼り付け', action: 'paste' },
      { label: 'プレーンテキストとして貼り付け', action: 'paste-plaintext' },
      { type: 'separator' },
      { label: 'すべて選択', action: 'select-all' },
    ]
  },
  {
    label: '表示',
    items: [
      { label: '実際のサイズ', action: 'reset-zoom' },
      { label: '拡大', action: 'zoom-in' },
      { label: '縮小', action: 'zoom-out' },
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
