/**
 * ProseMirror Decoration Plugin for POS Highlighting
 * 構文ハイライトのためのデコレーションプラグイン
 *
 * ビューポート内の段落のみを非同期で処理し、トークンキャッシュで効率化
 */

import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import type { Node as ProseMirrorNode } from '@milkdown/prose/model';
import type { EditorView } from '@milkdown/prose/view';
import { getNlpClient } from '@/lib/nlp-client/nlp-client';
import type { Token as NlpToken } from '@/lib/nlp-client/types';
import { getPosColor, DEFAULT_POS_COLORS } from './pos-colors';
import type { PosColorConfig } from './types';

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
  index: number; // 段落のインデックス（0から始まる）
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
  let index = 0;

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
        index: index++,
      });
      return false; // 子ノードは走査しない
    }
    return true;
  });

  return paragraphs;
}

/**
 * エディタの実際のスクロールコンテナを探す
 * ProseMirror の DOM から親を辿り、overflow: auto/scroll を持つ要素を返す
 */
function findScrollContainer(el: HTMLElement): HTMLElement {
  let parent = el.parentElement;
  while (parent) {
    const style = getComputedStyle(parent);
    if (style.overflowX === 'auto' || style.overflowX === 'scroll' ||
        style.overflowY === 'auto' || style.overflowY === 'scroll') {
      return parent;
    }
    parent = parent.parentElement;
  }
  return el;
}

/**
 * ビューポート内に表示されている段落を取得（前後2段落を含む）
 * coordsAtPos はビューポート座標を返すため、横書き・縦書きの両方で正しく動作する
 */
function getVisibleParagraphs(
  view: EditorView,
  allParagraphs: ParagraphInfo[],
  buffer: number = 2
): ParagraphInfo[] {
  if (allParagraphs.length === 0) return [];

  const scrollContainer = findScrollContainer(view.dom);
  const containerRect = scrollContainer.getBoundingClientRect();
  const visibleIndices = new Set<number>();

  for (const paragraph of allParagraphs) {
    try {
      // +1 で段落ノードの内側の座標を取得
      const coords = view.coordsAtPos(paragraph.pos + 1);
      if (coords) {
        // coordsAtPos はビューポート座標を返す
        // コンテナの可視領域と交差しているかチェック
        if (coords.top < containerRect.bottom && coords.bottom > containerRect.top &&
            coords.left < containerRect.right && coords.right > containerRect.left) {
          visibleIndices.add(paragraph.index);
        }
      }
    } catch {
      // coordsAtPos がエラーになる場合はスキップ
    }
  }

  // カーソル位置の段落も含める
  const { from } = view.state.selection;
  for (const paragraph of allParagraphs) {
    if (from >= paragraph.pos && from <= paragraph.pos + paragraph.node.nodeSize) {
      visibleIndices.add(paragraph.index);
      break;
    }
  }

  // 可視範囲が空の場合、先頭5段落をフォールバックとして使用
  if (visibleIndices.size === 0) {
    for (let i = 0; i < Math.min(5, allParagraphs.length); i++) {
      visibleIndices.add(i);
    }
  }

  // 前後のバッファを追加
  const expandedIndices = new Set<number>();
  for (const index of visibleIndices) {
    for (let i = Math.max(0, index - buffer); i <= Math.min(allParagraphs.length - 1, index + buffer); i++) {
      expandedIndices.add(i);
    }
  }

  return allParagraphs.filter(p => expandedIndices.has(p.index));
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

  // トークンキャッシュ: 段落テキスト → トークン配列
  // NLP の呼び出しを最小限にし、スクロール時のちらつきを防ぐ
  const tokenCache = new Map<string, NlpToken[]>();

  return new Plugin<PosHighlightState>({
    key: posHighlightKey,

    state: {
      init(): PosHighlightState {
        return {
          decorations: DecorationSet.empty,
          enabled,
          colors,
        };
      },

      apply(tr, pluginState): PosHighlightState {
        // メタデータで設定を更新
        const meta = tr.getMeta(posHighlightKey);
        if (meta) {
          // decorations が含まれている場合はそのまま適用
          if (meta.decorations !== undefined) {
            return { ...pluginState, ...meta };
          }
          // enabled/colors の変更 → キャッシュクリア
          if (meta.enabled !== undefined || meta.colors !== undefined) {
            tokenCache.clear();
          }
          const updated = { ...pluginState, ...meta };
          // enabled が false になった場合は decorations をクリア
          if (meta.enabled === false) {
            updated.decorations = DecorationSet.empty;
          }
          return updated;
        }

        // ドキュメントが変更されていない場合、デコレーションをマップ
        if (!tr.docChanged) {
          return {
            ...pluginState,
            decorations: pluginState.decorations.map(tr.mapping, tr.doc),
          };
        }

        // ドキュメントが変更された場合、キャッシュをクリア
        // （位置がずれるため。テキストベースのキャッシュは tokenCache で保持）
        return pluginState;
      },
    },

    view(editorView) {
      let scrollTimer: ReturnType<typeof setTimeout> | null = null;

      // スクロールコンテナを特定
      const scrollContainer = findScrollContainer(editorView.dom);

      // スクロールイベントハンドラ
      const handleScroll = () => {
        const state = posHighlightKey.getState(editorView.state);
        if (!state?.enabled) return;

        if (scrollTimer) clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => {
          scheduleViewportUpdate(editorView);
        }, 150);
      };

      // スクロールコンテナにリスナーを追加
      scrollContainer.addEventListener('scroll', handleScroll, { passive: true });

      // 初期化時に実行
      if (enabled) {
        scheduleViewportUpdate(editorView);
      }

      /**
       * ビューポート内の段落のみを処理
       * キャッシュ済みの段落はNLP呼び出しをスキップし、デコレーションのみ再構築
       */
      async function scheduleViewportUpdate(view: EditorView) {
        if (debounceTimer) clearTimeout(debounceTimer);

        const version = ++processingVersion;

        debounceTimer = setTimeout(async () => {
          const state = posHighlightKey.getState(view.state);
          if (!state?.enabled) return;

          const nlpClient = getNlpClient();
          const allParagraphs = collectParagraphs(view.state.doc);
          const visibleParagraphs = getVisibleParagraphs(view, allParagraphs, 2);

          // キャッシュにない段落のみをNLPで処理
          const uncachedParagraphs = visibleParagraphs.filter(p => !tokenCache.has(p.text));

          if (uncachedParagraphs.length > 0) {

            try {
              const paragraphData = uncachedParagraphs.map(p => ({ pos: p.pos, text: p.text }));
              const results = await nlpClient.tokenizeDocument(paragraphData);

              if (version !== processingVersion) return;

              // 結果をキャッシュに保存
              for (const result of results) {
                const paragraph = uncachedParagraphs.find(p => p.pos === result.pos);
                if (paragraph) {
                  tokenCache.set(paragraph.text, result.tokens);
                }
              }
            } catch (err) {
              console.error('[PosHighlight] Tokenization failed:', err);
              return;
            }
          }

          if (version !== processingVersion) return;

          // キャッシュ済みトークンからすべての段落のデコレーションを構築
          // （ビューポート外でもキャッシュがあれば着色を維持）
          const allDecorations: Decoration[] = [];
          let decoratedCount = 0;

          for (const paragraph of allParagraphs) {
            const tokens = tokenCache.get(paragraph.text);
            if (!tokens) continue;
            decoratedCount++;

            for (const token of tokens) {
              const color = getPosColor(
                token.pos,
                token.pos_detail_1,
                { ...DEFAULT_POS_COLORS, ...state.colors }
              );

              if (color) {
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

          // デコレーションを適用
          const decorations = allDecorations.length > 0
            ? DecorationSet.create(view.state.doc, allDecorations)
            : DecorationSet.empty;
          const tr = view.state.tr.setMeta(posHighlightKey, { decorations });
          view.dispatch(tr);

        }, debounceMs);
      }

      return {
        update(view, prevState) {
          const state = posHighlightKey.getState(view.state);
          const prevPluginState = posHighlightKey.getState(prevState);

          // enabled が変更された場合
          if (state?.enabled !== prevPluginState?.enabled) {
            if (state?.enabled) {
              tokenCache.clear();
              scheduleViewportUpdate(view);
            }
            return;
          }

          // colors が変更された場合
          if (state?.enabled && JSON.stringify(state.colors) !== JSON.stringify(prevPluginState?.colors)) {
            tokenCache.clear();
            scheduleViewportUpdate(view);
            return;
          }

          if (!state?.enabled) return;

          // ドキュメントが変更された場合、再処理をスケジュール
          if (view.state.doc !== prevState.doc) {
            scheduleViewportUpdate(view);
          }
        },
        destroy() {
          if (debounceTimer) clearTimeout(debounceTimer);
          if (scrollTimer) clearTimeout(scrollTimer);
          scrollContainer.removeEventListener('scroll', handleScroll);
          tokenCache.clear();
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
