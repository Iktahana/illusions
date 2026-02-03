/**
 * ProseMirror Decoration Plugin for POS Highlighting
 * 構文ハイライトのためのデコレーションプラグイン
 * 
 * 段落ごとに非同期で処理し、効率的かつ安定した着色を実現
 */

import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import type { Node as ProseMirrorNode } from '@milkdown/prose/model';
import type { EditorView } from '@milkdown/prose/view';
import { electronTokenizer } from './tokenizer-electron';
import { cdnTokenizer } from './tokenizer-cdn';
import { isElectron } from './env-utils';
import { getPosColor, DEFAULT_POS_COLORS } from './pos-colors';
import type { Token, PosColorConfig } from './types';

export const posHighlightKey = new PluginKey('posHighlight');

// 環境に応じて tokenizer を選択
const getTokenizer = () => isElectron() ? electronTokenizer : cdnTokenizer;

interface PosHighlightState {
  decorations: DecorationSet;
  enabled: boolean;
  colors: PosColorConfig;
  // 処理済みの段落を追跡（position -> decorations）
  processedParagraphs: Map<number, Decoration[]>;
}

export interface PosHighlightPluginOptions {
  enabled: boolean;
  colors: PosColorConfig;
  debounceMs?: number;
}

/**
 * 段落情報
 */
interface ParagraphInfo {
  node: ProseMirrorNode;
  pos: number;  // 段落の開始位置
  text: string; // 段落内のテキスト
}

/**
 * ドキュメントから段落を収集
 */
function collectParagraphs(doc: ProseMirrorNode): ParagraphInfo[] {
  const paragraphs: ParagraphInfo[] = [];
  
  doc.descendants((node, pos) => {
    // paragraph ノードを収集
    if (node.type.name === 'paragraph' && node.textContent) {
      paragraphs.push({
        node,
        pos,
        text: node.textContent,
      });
      return false; // 子ノードは走査しない
    }
    return true;
  });
  
  return paragraphs;
}

/**
 * 単一の段落を解析してデコレーションを作成
 */
async function processParagraph(
  paragraph: ParagraphInfo,
  colors: PosColorConfig,
  debug: boolean = false
): Promise<Decoration[]> {
  const decorations: Decoration[] = [];
  const tokenizer = getTokenizer();
  
  try {
    const tokens = await tokenizer.tokenize(paragraph.text);
    
    // Debug log
    if (debug && tokens.length > 0) {
      console.log(`[PosHighlight] Paragraph at pos=${paragraph.pos}, text="${paragraph.text.slice(0, 30)}..."`);
      console.log(`[PosHighlight] Tokens:`, tokens.slice(0, 10).map(t => ({
        surface: t.surface,
        pos: t.pos,
        start: t.start,
        end: t.end,
        docFrom: paragraph.pos + 1 + t.start,
        docTo: paragraph.pos + 1 + t.end,
      })));
    }
    
    for (const token of tokens) {
      const color = getPosColor(
        token.pos,
        token.pos_detail_1,
        { ...DEFAULT_POS_COLORS, ...colors }
      );
      
      if (color) {
        // 段落内の位置 + 段落の開始位置 + 1（段落ノード自体のオフセット）
        const from = paragraph.pos + 1 + token.start;
        const to = paragraph.pos + 1 + token.end;
        
        decorations.push(
          Decoration.inline(from, to, {
            style: `color: ${color}`,
            class: `pos-${token.pos}`,
          })
        );
      }
    }
  } catch (err) {
    console.warn(`[PosHighlight] Error processing paragraph at ${paragraph.pos}:`, err);
  }
  
  return decorations;
}

/**
 * 構文ハイライトプラグインを作成
 */
export function createPosHighlightPlugin(
  options: PosHighlightPluginOptions
): Plugin<PosHighlightState> {
  const { enabled, colors, debounceMs = 300 } = options;
  
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let processingVersion = 0;

  return new Plugin<PosHighlightState>({
    key: posHighlightKey,
    
    state: {
      init(_, state): PosHighlightState {
        return {
          decorations: DecorationSet.empty,
          enabled,
          colors,
          processedParagraphs: new Map(),
        };
      },
      
      apply(tr, pluginState, oldState, newState): PosHighlightState {
        // メタデータで設定を更新
        const meta = tr.getMeta(posHighlightKey);
        if (meta) {
          // decorations が含まれている場合はそのまま適用
          if (meta.decorations) {
            return {
              ...pluginState,
              ...meta,
            };
          }
          // enabled/colors の変更
          return {
            ...pluginState,
            ...meta,
            // 設定変更時はキャッシュをクリア
            processedParagraphs: new Map(),
          };
        }
        
        // ドキュメントが変更されていない場合、デコレーションをマップ
        if (!tr.docChanged) {
          return {
            ...pluginState,
            decorations: pluginState.decorations.map(tr.mapping, tr.doc),
          };
        }
        
        // ドキュメントが変更された場合、キャッシュをクリア
        return {
          ...pluginState,
          processedParagraphs: new Map(),
        };
      },
    },
    
    view(editorView) {
      // 初期化時に実行
      if (enabled) {
        scheduleFullUpdate(editorView);
      }
      
      /**
       * 全段落を順次処理
       */
      async function scheduleFullUpdate(view: EditorView) {
        if (debounceTimer) clearTimeout(debounceTimer);
        
        const version = ++processingVersion;
        
        debounceTimer = setTimeout(async () => {
          const state = posHighlightKey.getState(view.state);
          if (!state?.enabled) return;
          
          const paragraphs = collectParagraphs(view.state.doc);
          const allDecorations: Decoration[] = [];
          
          console.log(`[PosHighlight] Processing ${paragraphs.length} paragraphs...`);
          
          // 段落を順次処理（並列ではなく順次で安定性を確保）
          for (let i = 0; i < paragraphs.length; i++) {
            // バージョンチェック（新しい更新があればキャンセル）
            if (version !== processingVersion) {
              console.log('[PosHighlight] Processing cancelled (new update)');
              return;
            }
            
            const paragraph = paragraphs[i];
            const decorations = await processParagraph(
              paragraph, 
              state.colors,
              i < 3  // 最初の3段落だけデバッグ出力
            );
            
            allDecorations.push(...decorations);
            
            // 各段落処理後に UI を更新（インクリメンタル更新）
            if (decorations.length > 0) {
              const currentDecorations = DecorationSet.create(
                view.state.doc,
                allDecorations
              );
              
              const tr = view.state.tr.setMeta(posHighlightKey, {
                decorations: currentDecorations,
              });
              view.dispatch(tr);
            }
          }
          
          console.log(`[PosHighlight] Completed: ${allDecorations.length} decorations`);
        }, debounceMs);
      }
      
      return {
        update(view, prevState) {
          const state = posHighlightKey.getState(view.state);
          if (!state?.enabled) return;
          
          // ドキュメントが変更された場合、再処理をスケジュール
          if (view.state.doc !== prevState.doc) {
            scheduleFullUpdate(view);
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
