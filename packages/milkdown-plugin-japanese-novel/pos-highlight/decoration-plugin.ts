/**
 * ProseMirror Decoration Plugin for POS Highlighting
 * 品詞着色のためのデコレーションプラグイン
 */

import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import type { Node as ProseMirrorNode } from '@milkdown/prose/model';
import { tokenizerClient } from './tokenizer-client';
import { getPosColor, DEFAULT_POS_COLORS } from './pos-colors';
import type { Token, PosColorConfig } from './types';

export const posHighlightKey = new PluginKey('posHighlight');

interface PosHighlightState {
  decorations: DecorationSet;
  enabled: boolean;
  colors: PosColorConfig;
}

export interface PosHighlightPluginOptions {
  enabled: boolean;
  colors: PosColorConfig;
  debounceMs?: number;
}

/**
 * 品詞着色プラグインを作成
 */
export function createPosHighlightPlugin(
  options: PosHighlightPluginOptions
): Plugin<PosHighlightState> {
  const { enabled, colors, debounceMs = 300 } = options;
  
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let currentVersion = 0;

  return new Plugin<PosHighlightState>({
    key: posHighlightKey,
    
    state: {
      init(_, state): PosHighlightState {
        return {
          decorations: DecorationSet.empty,
          enabled,
          colors,
        };
      },
      
      apply(tr, pluginState, oldState, newState): PosHighlightState {
        // メタデータで設定を更新
        const meta = tr.getMeta(posHighlightKey);
        if (meta) {
          return {
            ...pluginState,
            ...meta,
          };
        }
        
        // ドキュメントが変更されていない場合、デコレーションをマップ
        if (!tr.docChanged) {
          return {
            ...pluginState,
            decorations: pluginState.decorations.map(tr.mapping, tr.doc),
          };
        }
        
        // ドキュメントが変更された場合、そのまま返す（非同期更新は view で処理）
        return pluginState;
      },
    },
    
    view(editorView) {
      // 初期化時に一度実行
      if (enabled) {
        scheduleUpdate();
      }
      
      function scheduleUpdate() {
        if (debounceTimer) clearTimeout(debounceTimer);
        
        const version = ++currentVersion;
        
        debounceTimer = setTimeout(async () => {
          const state = posHighlightKey.getState(editorView.state);
          if (!state?.enabled) return;
          
          try {
            const decorations = await buildDecorations(
              editorView.state.doc,
              state.colors
            );
            
            // バージョンチェック（古い更新をスキップ）
            if (version !== currentVersion) return;
            
            // トランザクションでデコレーションを更新
            const tr = editorView.state.tr.setMeta(posHighlightKey, {
              decorations,
            });
            editorView.dispatch(tr);
          } catch (err) {
            console.error('[PosHighlight] Error building decorations:', err);
          }
        }, debounceMs);
      }
      
      return {
        update(view, prevState) {
          const state = posHighlightKey.getState(view.state);
          if (!state?.enabled) return;
          
          // ドキュメントが変更された場合、再解析をスケジュール
          if (view.state.doc !== prevState.doc) {
            scheduleUpdate();
          }
        },
        destroy() {
          if (debounceTimer) clearTimeout(debounceTimer);
        },
      };
    },
    
    props: {
      decorations(state) {
        const pluginState = posHighlightKey.getState(state);
        return pluginState?.decorations ?? DecorationSet.empty;
      },
    },
  });
}

/**
 * ドキュメント全体からデコレーションを構築
 */
async function buildDecorations(
  doc: ProseMirrorNode,
  colors: PosColorConfig
): Promise<DecorationSet> {
  const decorations: Decoration[] = [];
  
  // すべてのテキストノードを収集
  const textNodes: Array<{ text: string; pos: number }> = [];
  doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      textNodes.push({ text: node.text, pos });
    }
  });
  
  // 各テキストノードを解析してデコレーションを作成
  for (const { text, pos } of textNodes) {
    try {
      const tokens = await tokenizerClient.tokenize(text);
      
      for (const token of tokens) {
        const color = getPosColor(
          token.pos,
          token.pos_detail_1,
          { ...DEFAULT_POS_COLORS, ...colors }
        );
        
        if (color) {
          const from = pos + token.start;
          const to = pos + token.end;
          
          decorations.push(
            Decoration.inline(from, to, {
              style: `color: ${color}`,
              class: `pos-${token.pos}`,
            })
          );
        }
      }
    } catch (err) {
      console.warn('[PosHighlight] Tokenize error for node:', err);
      // エラーが発生しても継続（部分的な着色でも表示）
    }
  }
  
  return DecorationSet.create(doc, decorations);
}
