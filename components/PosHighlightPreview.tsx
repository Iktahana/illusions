"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from "@milkdown/core";
import { nord } from "@milkdown/theme-nord";
import { commonmark } from "@milkdown/preset-commonmark";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { ProsemirrorAdapterProvider } from "@prosemirror-adapter/react";
import { $prose } from "@milkdown/utils";
import { Plugin, PluginKey } from "@milkdown/prose/state";
import { Loader2 } from "lucide-react";

import { japaneseNovel } from "@/packages/milkdown-plugin-japanese-novel";
import { posHighlight, updatePosHighlightSettings } from "@/packages/milkdown-plugin-japanese-novel/pos-highlight";

import type { EditorView } from "@milkdown/prose/view";

interface PosHighlightPreviewProps {
  posHighlightColors: Record<string, string>;
  posHighlightEnabled: boolean;
}

/** Read-only Milkdown editor for previewing POS highlight colors */
function PreviewEditor({
  content,
  posHighlightColors,
  posHighlightEnabled,
}: {
  content: string;
  posHighlightColors: Record<string, string>;
  posHighlightEnabled: boolean;
}) {
  const [editorView, setEditorView] = useState<EditorView | null>(null);
  const contentRef = useRef(content);

  const readOnlyPlugin = useMemo(() => $prose(() => new Plugin({
    key: new PluginKey("previewReadOnly"),
    props: {
      editable: () => false,
    },
  })), []);

  const { get } = useEditor((root) => {
    return Editor.make()
      .config(nord)
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, contentRef.current);
      })
      .use(commonmark)
      .use(japaneseNovel({
        isVertical: false,
        showManuscriptLine: false,
        enableRuby: true,
        enableTcy: true,
      }))
      .use(readOnlyPlugin)
      .use(posHighlight({
        enabled: false,
        colors: {},
        dicPath: "/dict",
        debounceMs: 300,
      }));
  }, [readOnlyPlugin]);

  // Get EditorView instance after mount
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    const maxAttempts = 10;

    const tryGetEditorView = (): void => {
      attempts++;
      try {
        const editor = get();
        if (editor?.ctx) {
          const view = editor.ctx.get(editorViewCtx);
          if (view) {
            setEditorView(view);
            return;
          }
        }
      } catch {
        // Editor not ready yet
      }
      if (attempts < maxAttempts) {
        timer = setTimeout(tryGetEditorView, 100);
      }
    };

    timer = setTimeout(tryGetEditorView, 100);
    return () => clearTimeout(timer);
  }, [get]);

  // Update POS highlight settings when colors or enabled state changes
  useEffect(() => {
    if (!editorView) return;
    updatePosHighlightSettings(editorView, {
      enabled: posHighlightEnabled,
      colors: posHighlightColors,
    });
  }, [editorView, posHighlightEnabled, posHighlightColors]);

  return (
    <div className="pos-preview-editor">
      <Milkdown />
    </div>
  );
}

/** Live preview panel for POS (part-of-speech) highlight settings */
export default function PosHighlightPreview({
  posHighlightColors,
  posHighlightEnabled,
}: PosHighlightPreviewProps): React.ReactElement {
  const [content, setContent] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/demo/鏡地獄.mdi", { signal: controller.signal })
      .then((res) => res.text())
      .then(setContent)
      .catch(() => {
        if (!controller.signal.aborted) setContent("");
      });
    return () => controller.abort();
  }, []);

  if (content === null) {
    return (
      <div className="flex items-center justify-center h-full rounded-lg border border-border bg-background-secondary">
        <Loader2 className="w-6 h-6 animate-spin text-foreground-tertiary" />
      </div>
    );
  }

  return (
    <div className="h-full rounded-lg border border-border bg-background-secondary overflow-hidden">
      <MilkdownProvider>
        <ProsemirrorAdapterProvider>
          <PreviewEditor
            content={content}
            posHighlightColors={posHighlightColors}
            posHighlightEnabled={posHighlightEnabled}
          />
        </ProsemirrorAdapterProvider>
      </MilkdownProvider>
    </div>
  );
}
