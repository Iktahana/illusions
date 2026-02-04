/**
 * 品詞着色プラグイン - エントリーポイント
 * POS (Part-of-Speech) Highlighting Plugin
 */

import { $prose } from '@milkdown/utils';
import { createPosHighlightPlugin, posHighlightKey } from './decoration-plugin';
import { electronTokenizer } from './tokenizer-electron';
import { cdnTokenizer } from './tokenizer-cdn';
import { isElectron } from './env-utils';
import { DEFAULT_POS_COLORS } from './pos-colors';
import type { EditorView } from '@milkdown/prose/view';
import type { PosColorConfig, PosHighlightSettings } from './types';

// 型定義と定数をエクスポート
export type { PosColorConfig, PosHighlightSettings, Token } from './types';
export { DEFAULT_POS_COLORS, POS_CSS_VAR_MAP } from './pos-colors';
export { posHighlightKey } from './decoration-plugin';

export interface PosHighlightOptions {
  /** 有効/無効 */
  enabled?: boolean;
  /** 品詞ごとの色設定 */
  colors?: PosColorConfig;
  /** 辞書パス */
  dicPath?: string;
  /** デバウンス時間（ミリ秒） */
  debounceMs?: number;
}

/**
 * 品詞着色プラグイン
 * 
 * @param options プラグインオプション
 * @returns Milkdown プラグイン
 */
export function posHighlight(options: PosHighlightOptions = {}) {
  const {
    enabled = false,
    colors = DEFAULT_POS_COLORS,
    dicPath = '/dict',
    debounceMs = 300,
  } = options;
  
  // トークナイザーを事前初期化（有効な場合のみ）
  // 環境に応じて適切な tokenizer を選択
  // 注意: 初期化は tokenizer 内部で管理され、重複初期化は防がれる
  if (enabled) {
    const tokenizer = isElectron() ? electronTokenizer : cdnTokenizer;
    
    console.log(`[PosHighlight] Pre-initializing ${isElectron() ? 'Electron' : 'CDN'} tokenizer`);
    
    // 非同期で初期化（バックグラウンドで実行）
    tokenizer.init(dicPath).catch((err: Error) => {
      console.error('[PosHighlight] Failed to initialize tokenizer:', err);
    });
  }
  
  return $prose(() => createPosHighlightPlugin({
    enabled,
    colors,
    debounceMs,
  }));
}

/**
 * 品詞着色設定を動的に更新
 * 
 * @param view EditorView インスタンス
 * @param settings 更新する設定
 */
export function updatePosHighlightSettings(
  view: EditorView,
  settings: Partial<PosHighlightSettings>
) {
  const tr = view.state.tr.setMeta(posHighlightKey, settings);
  view.dispatch(tr);
}
