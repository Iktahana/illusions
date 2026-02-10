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
import { getNlpClient } from '@/lib/nlp-client/nlp-client';
import type { TokenizeProgress } from '@/lib/nlp-client/types';
import { getPosColor, DEFAULT_POS_COLORS } from './pos-colors';
import type { Token, PosColorConfig } from './types';

export const posHighlightKey = new PluginKey('posHighlight');

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
 * atom ノード（ruby等）による位置補正情報
 * textContent ではスキップされるが ProseMirror 上では1位置を占める
 */
interface AtomAdjustment {
  textPos: number;       // textContent 内での位置（atom の直前）
  cumulativeOffset: number; // 累積の追加オフセット
}

/**
 * 段落情報
 */
interface ParagraphInfo {
  node: ProseMirrorNode;
  pos: number;  // 段落の開始位置
  text: string; // 段落内のテキスト
  atomAdjustments: AtomAdjustment[]; // atom ノードによる位置補正
}

/**
 * textContent 上の位置を ProseMirror 段落内オフセットに変換する際の追加オフセットを取得
 */
function getAtomOffset(adjustments: AtomAdjustment[], textPos: number): number {
  let offset = 0;
  for (const adj of adjustments) {
    if (adj.textPos <= textPos) {
      offset = adj.cumulativeOffset;
    } else {
      break;
    }
  }
  return offset;
}

/**
 * ドキュメントから段落を収集
 * atom ノード（ruby等）の位置補正情報も同時に計算する
 */
function collectParagraphs(doc: ProseMirrorNode): ParagraphInfo[] {
  const paragraphs: ParagraphInfo[] = [];

  doc.descendants((node, pos) => {
    // paragraph ノードを収集
    if (node.type.name === 'paragraph' && node.textContent) {
      // 段落の子ノードを走査し、atom ノードの位置補正を計算
      const atomAdjustments: AtomAdjustment[] = [];
      let textPos = 0;
      let cumulativeOffset = 0;

      node.forEach((child) => {
        if (child.isText) {
          textPos += child.text!.length;
        } else {
          // atom またはその他の非テキストインラインノード
          // ProseMirror では nodeSize 分の位置を占めるが、textContent には含まれない
          cumulativeOffset += child.nodeSize;
          atomAdjustments.push({ textPos, cumulativeOffset });
        }
      });

      paragraphs.push({
        node,
        pos,
        text: node.textContent,
        atomAdjustments,
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
  const nlpClient = getNlpClient();
  
  try {
    const tokens = await nlpClient.tokenizeParagraph(paragraph.text);
    
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
        // atom ノード（ruby等）による追加オフセットを加算
        const extraFrom = getAtomOffset(paragraph.atomAdjustments, token.start);
        const extraTo = getAtomOffset(paragraph.atomAdjustments, token.end);
        const from = paragraph.pos + 1 + token.start + extraFrom;
        const to = paragraph.pos + 1 + token.end + extraTo;

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
          if (meta.decorations !== undefined) {
            return {
              ...pluginState,
              ...meta,
            };
          }
          // enabled/colors の変更
          const newState = {
            ...pluginState,
            ...meta,
            // 設定変更時はキャッシュをクリア
            processedParagraphs: new Map(),
          };
          
          // enabled が false になった場合は decorations をクリア
          if (meta.enabled === false) {
            newState.decorations = DecorationSet.empty;
          }
          
          return newState;
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
          
          const nlpClient = getNlpClient();
          const paragraphs = collectParagraphs(view.state.doc);
          
          console.log(`[PosHighlight] Processing ${paragraphs.length} paragraphs...`);
          
          // Use batch API for better performance
          try {
            const paragraphData = paragraphs.map(p => ({ pos: p.pos, text: p.text }));
            
            const results = await nlpClient.tokenizeDocument(paragraphData, (progress: TokenizeProgress) => {
              if (paragraphs.length > 20) {
                console.log(`[PosHighlight] Progress: ${progress.percentage}% (${progress.completed}/${progress.total})`);
              }
            });
            
            // Version check (cancel if new update)
            if (version !== processingVersion) {
              console.log('[PosHighlight] Processing cancelled (new update)');
              return;
            }
            
            // Convert results to decorations
            const allDecorations: Decoration[] = [];
            
            for (const result of results) {
              const paragraph = paragraphs.find(p => p.pos === result.pos);
              if (!paragraph) continue;
              
              for (const token of result.tokens) {
                const color = getPosColor(
                  token.pos,
                  token.pos_detail_1,
                  { ...DEFAULT_POS_COLORS, ...state.colors }
                );

                if (color) {
                  // atom ノード（ruby等）による追加オフセットを加算
                  const extraFrom = getAtomOffset(paragraph.atomAdjustments, token.start);
                  const extraTo = getAtomOffset(paragraph.atomAdjustments, token.end);
                  const from = paragraph.pos + 1 + token.start + extraFrom;
                  const to = paragraph.pos + 1 + token.end + extraTo;

                  allDecorations.push(
                    Decoration.inline(from, to, {
                      style: `color: ${color}`,
                      class: `pos-${token.pos}`,
                    })
                  );
                }
              }
            }
            
            // Update UI with all decorations
            if (allDecorations.length > 0) {
              const decorations = DecorationSet.create(view.state.doc, allDecorations);
              const tr = view.state.tr.setMeta(posHighlightKey, { decorations });
              view.dispatch(tr);
            }
            
            console.log(`[PosHighlight] Completed: ${allDecorations.length} decorations`);
            
          } catch (err) {
            console.error('[PosHighlight] Tokenization failed:', err);
          }
        }, debounceMs);
      }
      
      return {
        update(view, prevState) {
          const state = posHighlightKey.getState(view.state);
          const prevPluginState = posHighlightKey.getState(prevState);
          
          // enabled が変更された場合
          if (state?.enabled !== prevPluginState?.enabled) {
            if (state?.enabled) {
              // 有効化された場合、完全に再処理
              console.log('[PosHighlight] Enabled, scheduling full update');
              scheduleFullUpdate(view);
            }
            // 無効化された場合は apply() で既に decorations がクリアされている
            return;
          }
          
          // colors が変更された場合
          if (state?.enabled && JSON.stringify(state.colors) !== JSON.stringify(prevPluginState?.colors)) {
            console.log('[PosHighlight] Colors changed, scheduling full update');
            scheduleFullUpdate(view);
            return;
          }
          
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
