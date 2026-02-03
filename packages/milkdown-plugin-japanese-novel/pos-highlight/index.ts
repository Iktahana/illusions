/**
 * 品詞着色プラグイン - エントリーポイント
 * POS (Part-of-Speech) Highlighting Plugin
 */

import { $prose } from '@milkdown/utils';
import { createPosHighlightPlugin, posHighlightKey } from './decoration-plugin';
import { simpleTokenizer } from './tokenizer-simple';
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

let isInitialized = false;

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
  if (enabled && !isInitialized) {
    isInitialized = true;
    simpleTokenizer.init(dicPath).catch((err: Error) => {
      console.error('[PosHighlight] Failed to initialize tokenizer:', err);
      isInitialized = false;
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
