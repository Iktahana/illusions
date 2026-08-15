"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Editor, defaultValueCtx, editorViewCtx, rootCtx, serializerCtx } from "@milkdown/core";
import { clipboard } from "@milkdown/plugin-clipboard";
import { history } from "@milkdown/plugin-history";
import { listener, listenerCtx } from "@milkdown/plugin-listener";
import { commonmark } from "@milkdown/preset-commonmark";
import type { Node as ProseNode } from "@milkdown/prose/model";
import { Selection, type Plugin } from "@milkdown/prose/state";
import type { EditorView } from "@milkdown/prose/view";
import { Milkdown, useEditor } from "@milkdown/react";
import { nord } from "@milkdown/theme-nord";
import { $prose, replaceAll } from "@milkdown/utils";
import {
  changeLineLength,
  changeWritingMode,
  verticalWriting,
} from "@illusions-lab/milkdown-plugin-vertical-writing";
import { createMdiEditorMapping } from "@illusions-lab/milkdown-plugin-mdi";

import { useTypographySettings } from "@/contexts/EditorSettingsContext";
import { getDocumentAdapter, type DocumentFormat } from "@/lib/document-format";
import { posDecorations, setPosDecorations } from "@/lib/editor-interaction/pos-decorations";
import { commitPendingComposition } from "@/lib/editor-page/commit-pending-composition";
import { mdiBlockNumbers, setMdiBlockNumbers } from "@/lib/editor-page/mdi-block-numbers";
import { createSelectionBridgePlugin, EditorInteractionStore } from "@/lib/editor-interaction";

interface MilkdownEditorProps {
  initialContent: string;
  onChange?: (content: string) => void;
  onEditorViewReady?: (view: EditorView) => void;
  documentFormat: DocumentFormat;
  isVertical: boolean;
  lineLength: number | null;
  externalContent?: string | null;
  onExternalContentApplied?: () => void;
  registerFlush?: (flush: (() => string | null) | null) => void;
  interaction?: EditorInteractionStore;
  applicationPlugins?: readonly Plugin[];
}

function encodeDocument(
  format: DocumentFormat,
  adapter: ReturnType<typeof getDocumentAdapter>,
  ctx: Parameters<Parameters<Editor["action"]>[0]>[0],
  document: ProseNode,
): string {
  if (format === "markdown") return ctx.get(serializerCtx)(document);
  return adapter.encodeEditor(ctx, document);
}

/**
 * Package-first editor core. No application lint, POS, speech, search,
 * context-menu or novel-behaviour plugins belong in this lifecycle.
 */
export default function MilkdownEditor({
  initialContent,
  onChange,
  onEditorViewReady,
  documentFormat,
  isVertical,
  lineLength,
  externalContent,
  onExternalContentApplied,
  registerFlush,
  interaction: providedInteraction,
  applicationPlugins = [],
}: MilkdownEditorProps): React.ReactElement {
  const { fontScale, lineHeight, paragraphSpacing, showParagraphNumbers, textIndent, fontFamily } =
    useTypographySettings();
  const adapter = useMemo(() => getDocumentAdapter(documentFormat), [documentFormat]);
  const fallbackEditorId = useId();
  const fallbackInteraction = useMemo(
    () => new EditorInteractionStore(fallbackEditorId, documentFormat, adapter),
    [adapter, documentFormat, fallbackEditorId],
  );
  const interaction = providedInteraction ?? fallbackInteraction;
  const contentRef = useRef(initialContent);
  const onChangeRef = useRef(onChange);
  const viewRef = useRef<EditorView | null>(null);
  const [readyGeneration, setReadyGeneration] = useState<number | null>(null);
  const modeRef = useRef(isVertical);
  const lineLengthRef = useRef(lineLength);
  const showParagraphNumbersRef = useRef(showParagraphNumbers);
  const editorGenerationRef = useRef({ adapter, documentFormat, value: 0 });

  if (
    editorGenerationRef.current.adapter !== adapter ||
    editorGenerationRef.current.documentFormat !== documentFormat
  ) {
    editorGenerationRef.current = {
      adapter,
      documentFormat,
      value: editorGenerationRef.current.value + 1,
    };
  }
  const editorGeneration = editorGenerationRef.current.value;
  const interactionBridge = useMemo(
    () => $prose(() => createSelectionBridgePlugin(interaction)),
    [interaction],
  );
  const applicationExtensions = useMemo(
    () => applicationPlugins.map((plugin) => $prose(() => plugin)),
    [applicationPlugins],
  );

  onChangeRef.current = onChange;
  modeRef.current = isVertical;
  lineLengthRef.current = lineLength;
  showParagraphNumbersRef.current = showParagraphNumbers;

  const editorHandle = useEditor(
    (root) => {
      let editor = Editor.make()
        .config(nord)
        .config((ctx) => {
          ctx.set(rootCtx, root);
          ctx.set(defaultValueCtx, contentRef.current);
        })
        .use(listener)
        .config((ctx) => {
          const publish = (document: ProseNode): void => {
            const content = encodeDocument(documentFormat, adapter, ctx, document);
            contentRef.current = content;
            onChangeRef.current?.(content);
            if (documentFormat === "mdi") {
              queueMicrotask(() => {
                if (viewRef.current?.isDestroyed !== false) return;
                setMdiBlockNumbers(showParagraphNumbersRef.current)(ctx);
              });
            }
          };

          // `publish` owns format-specific serialization through the adapter.
          // Listen to the document tree directly so semantic MDI edits such as
          // plain text -> Ruby are not lost when their textContent is unchanged.
          ctx.get(listenerCtx).updated((_ctx, document) => publish(document));
        })
        .use(commonmark)
        .use(mdiBlockNumbers)
        .use(posDecorations)
        .use(interactionBridge);

      for (const extension of applicationExtensions) editor = editor.use(extension);
      editor = adapter.configureEditor(editor);
      return editor
        .use(
          verticalWriting({
            mode: modeRef.current ? "vertical-rl" : "horizontal-tb",
            lineLength: lineLengthRef.current ?? undefined,
          }),
        )
        .use(history)
        .use(clipboard);
    },
    [adapter, applicationExtensions, documentFormat, interactionBridge],
  );
  const isEditorReady = readyGeneration === editorGeneration && !editorHandle.loading;
  const getRef = useRef(editorHandle.get);
  getRef.current = editorHandle.get;
  const get = useCallback(() => getRef.current(), []);

  useEffect(() => {
    if (editorHandle.loading) {
      setReadyGeneration(null);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;

    const resolveView = (): void => {
      if (cancelled) return;
      try {
        const view = get()?.ctx.get(editorViewCtx);
        if (view) {
          viewRef.current = view;
          interaction.attach(view, editorGeneration, documentFormat, adapter);
          setReadyGeneration(editorGeneration);
          onEditorViewReady?.(view);
          return;
        }
      } catch {
        // Milkdown has not completed its async create lifecycle yet.
      }
      if (++attempts < 20) timer = setTimeout(resolveView, 50);
    };

    timer = setTimeout(resolveView, 0);
    return () => {
      cancelled = true;
      viewRef.current = null;
      interaction.detach();
      setReadyGeneration(null);
      if (timer) clearTimeout(timer);
    };
  }, [
    adapter,
    documentFormat,
    editorGeneration,
    editorHandle.loading,
    get,
    interaction,
    onEditorViewReady,
  ]);

  useEffect(() => {
    if (!isEditorReady) return;
    get()?.action(changeWritingMode(isVertical ? "vertical-rl" : "horizontal-tb"));
  }, [get, isEditorReady, isVertical]);

  useEffect(() => {
    if (!isEditorReady) return;
    get()?.action(changeLineLength(lineLength));
  }, [get, isEditorReady, lineLength]);

  useEffect(() => {
    if (!isEditorReady) return;
    get()?.action(setMdiBlockNumbers(documentFormat === "mdi" && showParagraphNumbers));
  }, [documentFormat, get, isEditorReady, showParagraphNumbers]);

  useEffect(() => {
    if (!isEditorReady || externalContent == null) return;
    const editor = get();
    if (!editor) return;
    editor.action(replaceAll(externalContent));
    const view = editor.ctx.get(editorViewCtx);
    if (view.state?.tr && view.state.doc) {
      view.dispatch(view.state.tr.setSelection(Selection.atStart(view.state.doc)));
    }
    interaction.detach();
    interaction.attach(
      editor.ctx.get(editorViewCtx),
      editorGeneration + 1,
      documentFormat,
      adapter,
    );
    contentRef.current = externalContent;
    onExternalContentApplied?.();
  }, [
    adapter,
    documentFormat,
    editorGeneration,
    externalContent,
    get,
    interaction,
    isEditorReady,
    onExternalContentApplied,
  ]);

  useEffect(() => {
    if (!registerFlush) return;
    const flush = (): string | null => {
      const editor = get();
      if (!editor) return null;
      try {
        let content: string | null = null;
        editor.action((ctx) => {
          const view = ctx.get(editorViewCtx);
          commitPendingComposition(view);
          content = encodeDocument(documentFormat, adapter, ctx, view.state.doc);
        });
        if (content !== null) contentRef.current = content;
        return content;
      } catch {
        return null;
      }
    };
    registerFlush(flush);
    return () => registerFlush(null);
  }, [adapter, documentFormat, get, registerFlush]);

  useEffect(() => {
    interaction.setMdiMappingGetter(() => {
      const editor = get();
      if (!editor || documentFormat !== "mdi") return null;
      try {
        let snapshot = null;
        editor.action((ctx) => {
          snapshot = createMdiEditorMapping()(ctx);
        });
        return snapshot;
      } catch {
        return null;
      }
    });
    interaction.setPosHighlightDispatcher((decorations) => {
      const editor = get();
      if (!editor) return;
      try {
        editor.action(setPosDecorations(decorations));
      } catch {
        /* detached editor */
      }
    });
    return () => {
      interaction.setMdiMappingGetter(null);
      interaction.setPosHighlightDispatcher(null);
    };
  }, [documentFormat, get, interaction]);

  return (
    <div
      className="editor-core h-full min-h-0"
      style={
        {
          "--editor-font-scale": `${fontScale}%`,
          "--editor-line-height": String(lineHeight),
          "--editor-paragraph-spacing": `${paragraphSpacing}em`,
          "--editor-text-indent": `${textIndent}em`,
          "--editor-font-family": `"${fontFamily}", serif`,
        } as React.CSSProperties
      }
    >
      <Milkdown />
    </div>
  );
}
