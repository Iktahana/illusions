/**
 * ProseMirror Decoration Plugin for POS Highlighting
 * 構文ハイライトのためのデコレーションプラグイン
 *
 * ビューポート内の段落のみを非同期で処理し、トークンキャッシュで効率化
 */

import { Plugin, PluginKey } from "@milkdown/prose/state";
import { Decoration, DecorationSet } from "@milkdown/prose/view";
import type { EditorView } from "@milkdown/prose/view";
import { getNlpClient } from "@/lib/nlp-client/nlp-client";
import type { Token as NlpToken } from "@/lib/nlp-client/types";
import { LRUCache } from "@/lib/utils/lru-cache";
import { getAtomOffset, collectParagraphs } from "../shared/paragraph-helpers";
import { getPosColor, DEFAULT_POS_COLORS } from "./pos-colors";
import type { PosColorConfig } from "./types";

export const posHighlightKey = new PluginKey("posHighlight");

/** Compare two Sets for equality */
function setsEqual(a?: Set<string>, b?: Set<string>): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

interface PosHighlightState {
  decorations: DecorationSet;
  enabled: boolean;
  colors: PosColorConfig;
  disabledTypes: Set<string>;
}

export interface PosHighlightPluginOptions {
  enabled: boolean;
  colors: PosColorConfig;
  disabledTypes?: string[];
  debounceMs?: number;
}

/**
 * 構文ハイライトプラグインを作成
 */
export function createPosHighlightPlugin(
  options: PosHighlightPluginOptions,
): Plugin<PosHighlightState> {
  const { enabled, colors, disabledTypes = [], debounceMs = 300 } = options;

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
          disabledTypes: new Set(disabledTypes),
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
          // disabledTypes が配列で渡された場合は Set に変換
          if (Array.isArray(meta.disabledTypes)) {
            updated.disabledTypes = new Set(meta.disabledTypes);
          }
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
      // 初期化時に実行
      if (enabled) {
        scheduleViewportUpdate(editorView);
      }

      /**
       * ドキュメント全体を処理する。
       * スクロール位置依存の更新を避け、レイアウト揺れを抑える。
       */
      async function scheduleViewportUpdate(view: EditorView) {
        if (debounceTimer) clearTimeout(debounceTimer);

        const version = ++processingVersion;

        debounceTimer = setTimeout(async () => {
          const state = posHighlightKey.getState(view.state);
          if (!state?.enabled) return;

          const nlpClient = getNlpClient();
          const allParagraphs = collectParagraphs(view.state.doc);

          // キャッシュにない段落のみをNLPで処理
          const uncachedParagraphs = allParagraphs.filter((p) => !tokenCache.has(p.text));

          if (uncachedParagraphs.length > 0) {
            try {
              const paragraphData = uncachedParagraphs.map((p) => ({ pos: p.pos, text: p.text }));
              const results = await nlpClient.tokenizeDocument(paragraphData);

              if (version !== processingVersion) return;

              // 結果をキャッシュに保存
              for (const result of results) {
                const paragraph = uncachedParagraphs.find((p) => p.pos === result.pos);
                if (paragraph) {
                  tokenCache.set(paragraph.text, result.tokens);
                }
              }
            } catch (err) {
              console.error("[PosHighlight] Tokenization failed:", err);
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
              // Skip disabled POS types
              if (state.disabledTypes.has(token.pos)) continue;

              const color = getPosColor(token.pos, token.pos_detail_1, {
                ...DEFAULT_POS_COLORS,
                ...state.colors,
              });

              if (color) {
                const extraFrom = getAtomOffset(paragraph.atomAdjustments, token.start);
                const extraTo = getAtomOffset(paragraph.atomAdjustments, token.end);
                const from = paragraph.pos + 1 + token.start + extraFrom;
                const to = paragraph.pos + 1 + token.end + extraTo;

                allDecorations.push(
                  Decoration.inline(from, to, {
                    style: `color: ${color}`,
                    class: `pos-${token.pos}`,
                  }),
                );
              }
            }
          }

          // デコレーションを適用
          const decorations =
            allDecorations.length > 0
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

          // colors or disabledTypes が変更された場合
          if (
            state?.enabled &&
            (JSON.stringify(state.colors) !== JSON.stringify(prevPluginState?.colors) ||
              !setsEqual(state.disabledTypes, prevPluginState?.disabledTypes))
          ) {
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
