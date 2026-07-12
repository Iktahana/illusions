"use client";

import { useEffect } from "react";
import { shouldEnablePosHighlight } from "./power-policy";
import { getWindowActivitySnapshot, subscribeWindowActivity } from "./window-activity";
import type { WindowActivityState } from "./window-activity";
import type { EditorView } from "@milkdown/prose/view";
import { isEditorViewAlive } from "./use-search-highlight";

// ---------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------

export interface UsePosHighlightActivationParams {
  /** The ProseMirror view of the active editor, or null while mounting. */
  view: EditorView | null;
  /** The user's POS-highlight setting. Never mutated by this hook. */
  posHighlightEnabled: boolean;
  /** Power-save mode (user setting / battery auto-enable). */
  powerSaveMode: boolean;
  /** POS color map (passed through to the plugin). */
  posHighlightColors: Record<string, string>;
  /** POS types the user disabled (passed through to the plugin). */
  posHighlightDisabledTypes: string[];
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Applies the POS-highlight settings to the editor, with the `enabled` flag
 * derived from the power policy (`shouldEnablePosHighlight`, #1466): the
 * expensive morphological highlighting is suspended while the window is
 * backgrounded (or power-save mode is on) and restored to exactly the
 * user's setting on focus.
 *
 * #1445 safety:
 * - Subscribes directly to the framework-free window-activity service —
 *   focus switches never go through React state, so nothing re-renders.
 * - `updatePosHighlightSettings` dispatches a META-ONLY transaction; only
 *   decorations toggle. The document, selection, and scroll position are
 *   never touched, so a focus round-trip cannot move the cursor or reload
 *   content.
 *
 * 品詞ハイライト設定の適用フック（#1466）。enabled は power policy 由来の
 * 実効値（effectivePosHighlightEnabled）で、バックグラウンド中は重い
 * ハイライトを停止し、フォーカス復帰でユーザー設定どおりに戻す。
 * 適用は meta 専用 transaction による装飾の付け外しのみで、本文・選択・
 * スクロールには一切触れない（#1445 ガード）。ユーザー設定は変更しない。
 */
export function usePosHighlightActivation(params: UsePosHighlightActivationParams): void {
  const {
    view,
    posHighlightEnabled,
    powerSaveMode,
    posHighlightColors,
    posHighlightDisabledTypes,
  } = params;

  useEffect(() => {
    if (!view) return;

    let disposed = false;

    const apply = (activity: WindowActivityState): void => {
      // 動的 import で plugin 本体（kuromoji 含む）を初期バンドルから外す
      import("@/packages/milkdown-plugin-japanese-novel/pos-highlight")
        .then(({ updatePosHighlightSettings }) => {
          if (disposed || !isEditorViewAlive(view)) return;
          updatePosHighlightSettings(view, {
            enabled: shouldEnablePosHighlight(activity, { posHighlightEnabled, powerSaveMode }),
            colors: posHighlightColors,
            disabledTypes: posHighlightDisabledTypes,
          });
        })
        .catch((err) => {
          console.error("[Editor] Failed to update POS highlight settings:", err);
        });
    };

    apply(getWindowActivitySnapshot());
    const unsubscribe = subscribeWindowActivity(apply);

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [view, posHighlightEnabled, powerSaveMode, posHighlightColors, posHighlightDisabledTypes]);
}
