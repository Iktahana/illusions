import type { Ctx } from "@milkdown/ctx";
import { editorStateCtx, editorViewCtx } from "@milkdown/core";
import { Plugin, PluginKey } from "@milkdown/prose/state";
import { Decoration, DecorationSet } from "@milkdown/prose/view";
import { $prose } from "@milkdown/utils";
import { getMdiTextBlocks } from "@illusions-lab/mdi";
import {
  createMdiEditorMapping,
  mapMdiSourceSpansToEditorRanges,
} from "@illusions-lab/milkdown-plugin-mdi";

interface MdiBlockNumberState {
  readonly decorations: DecorationSet;
  readonly enabled: boolean;
  readonly source: string | null;
}

const mdiBlockNumberKey = new PluginKey<MdiBlockNumberState>("mdiBlockNumbers");

const createNumberWidget = (index: number, kind: string): HTMLElement => {
  const widget = document.createElement("span");
  widget.className = "mdi-block-number";
  widget.dataset.mdiBlockIndex = String(index);
  widget.dataset.mdiBlockKind = kind;
  widget.textContent = String(index);
  widget.contentEditable = "false";
  widget.setAttribute("aria-hidden", "true");
  return widget;
};

export const mdiBlockNumbers = $prose(
  () =>
    new Plugin<MdiBlockNumberState>({
      key: mdiBlockNumberKey,
      state: {
        init: () => ({
          decorations: DecorationSet.empty,
          enabled: false,
          source: null,
        }),
        apply: (transaction, value) => {
          const replacement = transaction.getMeta(mdiBlockNumberKey) as
            MdiBlockNumberState | undefined;
          if (replacement) return replacement;
          if (!transaction.docChanged) return value;
          return {
            ...value,
            decorations: value.decorations.map(transaction.mapping, transaction.doc),
          };
        },
      },
      props: {
        decorations: (state) => mdiBlockNumberKey.getState(state)?.decorations ?? null,
      },
    }),
);

/**
 * Render application-owned gutter labels from Rust block indices joined to
 * exact ProseMirror positions by the package-owned provenance bridge.
 */
export const setMdiBlockNumbers =
  (enabled: boolean) =>
  (ctx: Ctx): void => {
    const current = mdiBlockNumberKey.getState(ctx.get(editorStateCtx));

    if (!enabled) {
      if (!current?.enabled) return;
      const next: MdiBlockNumberState = {
        decorations: DecorationSet.empty,
        enabled: false,
        source: null,
      };
      const view = ctx.get(editorViewCtx);
      view.dispatch(view.state.tr.setMeta(mdiBlockNumberKey, next));
      return;
    }

    const snapshot = createMdiEditorMapping()(ctx);
    if (current?.enabled && current.source === snapshot.source) return;

    const projection = getMdiTextBlocks(snapshot.source);
    const sourceBackedBlocks = projection.blocks.filter(
      (block): block is typeof block & { span: NonNullable<typeof block.span> } =>
        block.span !== undefined,
    );
    const resolutions = mapMdiSourceSpansToEditorRanges(
      snapshot,
      sourceBackedBlocks.map((block) => block.span),
    );
    const decorations = sourceBackedBlocks.flatMap((block, index) => {
      const match = resolutions[index]?.matches.find(
        (candidate) => candidate.channel === "blockText" && candidate.blockIndex === block.index,
      );
      if (!match) return [];
      return [
        Decoration.widget(match.from, () => createNumberWidget(block.index, block.kind), {
          key: `mdi-block-number-${block.index}`,
          side: -1,
        }),
      ];
    });
    const view = ctx.get(editorViewCtx);
    const next: MdiBlockNumberState = {
      decorations: DecorationSet.create(view.state.doc, decorations),
      enabled: true,
      source: snapshot.source,
    };
    view.dispatch(view.state.tr.setMeta(mdiBlockNumberKey, next));
  };
