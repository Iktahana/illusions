/**
 * ProseMirror Decoration Plugin for POS Highlighting
 * 構文ハイライトのためのデコレーションプラグイン
 *
 * ビューポート内の段落のみを非同期で処理し、トークンキャッシュで効率化
 */

import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import type { EditorView } from '@milkdown/prose/view';
import { getNlpClient } from '@/lib/nlp-client/nlp-client';
import type { Token as NlpToken } from '@/lib/nlp-client/types';
import { LRUCache } from '@/lib/utils/lru-cache';
import { getAtomOffset, collectParagraphs, findScrollContainer, getVisibleParagraphs } from '../shared/paragraph-helpers';
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
  // LRU-bounded to prevent unbounded memory growth in long editing sessions
  const tokenCache = new LRUCache<string, NlpToken[]>(200);

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
