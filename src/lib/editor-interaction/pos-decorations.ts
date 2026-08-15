import type { Ctx } from "@milkdown/ctx";
import { editorStateCtx, editorViewCtx } from "@milkdown/core";
import { Plugin, PluginKey } from "@milkdown/prose/state";
import { Decoration, DecorationSet } from "@milkdown/prose/view";
import { $prose } from "@milkdown/utils";

export interface PosDecorationSpec {
  from: number;
  to: number;
  category: string;
  color: string;
}

interface PosDecorationState {
  readonly decorations: DecorationSet;
}

const posDecorationKey = new PluginKey<PosDecorationState>("posHighlightDecorations");

export const posDecorations = $prose(
  () =>
    new Plugin<PosDecorationState>({
      key: posDecorationKey,
      state: {
        init: () => ({ decorations: DecorationSet.empty }),
        apply: (transaction, value) => {
          const replacement = transaction.getMeta(posDecorationKey) as
            PosDecorationState | undefined;
          if (replacement) return replacement;
          if (!transaction.docChanged) return value;
          return {
            decorations: value.decorations.map(transaction.mapping, transaction.doc),
          };
        },
      },
      props: {
        decorations: (state) => posDecorationKey.getState(state)?.decorations ?? null,
      },
    }),
);

export const setPosDecorations =
  (decorations: readonly PosDecorationSpec[]) =>
  (ctx: Ctx): void => {
    const view = ctx.get(editorViewCtx);
    const next: PosDecorationState = {
      decorations: DecorationSet.create(
        view.state.doc,
        decorations.map(({ from, to, category, color }) =>
          Decoration.inline(from, to, {
            class: "pos-highlight",
            style: `color: ${color};`,
            "data-pos-highlight-category": category,
          }),
        ),
      ),
    };
    view.dispatch(view.state.tr.setMeta(posDecorationKey, next));
  };

export const clearPosDecorations = (ctx: Ctx): void => {
  const current = posDecorationKey.getState(ctx.get(editorStateCtx));
  if (!current || current.decorations === DecorationSet.empty) return;
  const view = ctx.get(editorViewCtx);
  view.dispatch(
    view.state.tr.setMeta(posDecorationKey, {
      decorations: DecorationSet.empty,
    } satisfies PosDecorationState),
  );
};
