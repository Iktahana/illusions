/**
 * Menu definitions for Web menu bar
 * Mirrors Electron native menu structure
 */

export interface MenuItem {
  label?: string;
  type?: 'normal' | 'separator';
  accelerator?: string;
  action?: string;
  enabled?: boolean;
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
      { label: '開く...', accelerator: 'Ctrl+O', action: 'open-file' },
      { type: 'separator' },
      { label: '保存', accelerator: 'Ctrl+S', action: 'save-file' },
      { label: '別名で保存...', accelerator: 'Shift+Ctrl+S', action: 'save-as' },
      { type: 'separator' },
      { label: 'プロジェクトフォルダを開く', action: 'show-in-file-manager', enabled: false },
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
      { label: '再読み込み', accelerator: 'Ctrl+R', action: 'reload' },
      { type: 'separator' },
      { label: '実際のサイズ', accelerator: 'Ctrl+0', action: 'reset-zoom' },
      { label: '拡大', accelerator: 'Ctrl++', action: 'zoom-in' },
      { label: '縮小', accelerator: 'Ctrl+-', action: 'zoom-out' },
    ]
  },
  {
    label: 'ヘルプ',
    items: [
      { label: 'バージョン 0.0.0', enabled: false },
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
