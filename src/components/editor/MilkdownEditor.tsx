"use client";

import { useEffect, useMemo, useRef } from "react";
import { Editor, defaultValueCtx, editorViewCtx, rootCtx, serializerCtx } from "@milkdown/core";
import { clipboard } from "@milkdown/plugin-clipboard";
import { history } from "@milkdown/plugin-history";
import { listener, listenerCtx } from "@milkdown/plugin-listener";
import { commonmark } from "@milkdown/preset-commonmark";
import type { Node as ProseNode } from "@milkdown/prose/model";
import type { EditorView } from "@milkdown/prose/view";
import { Milkdown, useEditor } from "@milkdown/react";
import { nord } from "@milkdown/theme-nord";
import { replaceAll } from "@milkdown/utils";
import {
  changeLineLength,
  changeWritingMode,
  verticalWriting,
} from "@illusions-lab/milkdown-plugin-vertical-writing";

import { useTypographySettings } from "@/contexts/EditorSettingsContext";
import { getDocumentAdapter, type DocumentFormat } from "@/lib/document-format";
import { commitPendingComposition } from "@/lib/editor-page/commit-pending-composition";

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
}: MilkdownEditorProps): React.ReactElement {
  const { fontScale, lineHeight, paragraphSpacing, textIndent, fontFamily } =
    useTypographySettings();
  const adapter = useMemo(() => getDocumentAdapter(documentFormat), [documentFormat]);
  const contentRef = useRef(initialContent);
  const onChangeRef = useRef(onChange);
  const viewRef = useRef<EditorView | null>(null);
  const modeRef = useRef(isVertical);
  const lineLengthRef = useRef(lineLength);

  onChangeRef.current = onChange;
  modeRef.current = isVertical;
  lineLengthRef.current = lineLength;

  const { get } = useEditor(
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
          };

          if (documentFormat === "plain-text") {
            ctx.get(listenerCtx).updated((_ctx, document) => publish(document));
          } else {
            ctx
              .get(listenerCtx)
              .markdownUpdated((_ctx) => publish(_ctx.get(editorViewCtx).state.doc));
          }
        })
        .use(commonmark);

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
    [adapter, documentFormat],
  );

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;

    const resolveView = (): void => {
      if (cancelled) return;
      try {
        const view = get()?.ctx.get(editorViewCtx);
        if (view) {
          viewRef.current = view;
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
      if (timer) clearTimeout(timer);
    };
  }, [get, onEditorViewReady]);

  useEffect(() => {
    get()?.action(changeWritingMode(isVertical ? "vertical-rl" : "horizontal-tb"));
  }, [get, isVertical]);

  useEffect(() => {
    get()?.action(changeLineLength(lineLength));
  }, [get, lineLength]);

  useEffect(() => {
    if (externalContent == null) return;
    const editor = get();
    if (!editor) return;
    editor.action(replaceAll(externalContent));
    contentRef.current = externalContent;
    onExternalContentApplied?.();
  }, [externalContent, get, onExternalContentApplied]);

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
