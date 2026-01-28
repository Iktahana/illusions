"use client";

import { useEffect, useRef, useState } from "react";
import { Editor, rootCtx, defaultValueCtx } from "@milkdown/core";
import { nord } from "@milkdown/theme-nord";
import { commonmark } from "@milkdown/preset-commonmark";
import { listener, listenerCtx } from "@milkdown/plugin-listener";
import { history } from "@milkdown/plugin-history";
import { clipboard } from "@milkdown/plugin-clipboard";
import { cursor } from "@milkdown/plugin-cursor";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { ProsemirrorAdapterProvider } from "@prosemirror-adapter/react";
import { japaneseNovel } from "@/packages/milkdown-plugin-japanese-novel";
import clsx from "clsx";
import { Type, AlignLeft } from "lucide-react";

interface EditorProps {
  initialContent?: string;
  onChange?: (content: string) => void;
  className?: string;
}

export default function NovelEditor({ initialContent = "", onChange, className }: EditorProps) {
  const [isVertical, setIsVertical] = useState(false);
  const [fontSize, setFontSize] = useState(16);
  const [lineHeight, setLineHeight] = useState(1.8);

  return (
    <div className={clsx("flex flex-col h-full", className)}>
      {/* Editor Toolbar */}
      <EditorToolbar
        isVertical={isVertical}
        onToggleVertical={() => setIsVertical(!isVertical)}
        fontSize={fontSize}
        onFontSizeChange={setFontSize}
        lineHeight={lineHeight}
        onLineHeightChange={setLineHeight}
      />

      {/* Editor Area */}
      <div className="flex-1 overflow-auto bg-slate-50">
        <MilkdownProvider>
          <ProsemirrorAdapterProvider>
            <MilkdownEditor
              initialContent={initialContent}
              onChange={onChange}
              isVertical={isVertical}
              fontSize={fontSize}
              lineHeight={lineHeight}
            />
          </ProsemirrorAdapterProvider>
        </MilkdownProvider>
      </div>
    </div>
  );
}

function EditorToolbar({
  isVertical,
  onToggleVertical,
  fontSize,
  onFontSizeChange,
}: {
  isVertical: boolean;
  onToggleVertical: () => void;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  lineHeight: number;
  onLineHeightChange: (height: number) => void;
}) {
  return (
    <div className="h-12 border-b border-slate-200 bg-white flex items-center justify-between px-4">
      <div className="flex items-center gap-4">
        {/* Vertical Writing Toggle */}
        <button
          onClick={onToggleVertical}
          className={clsx(
            "flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition-colors",
            isVertical
              ? "bg-indigo-100 text-indigo-700"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          )}
        >
          <Type className="w-4 h-4" />
          {isVertical ? "縦書き" : "横書き"}
        </button>

        {/* Font Size Control */}
        <div className="flex items-center gap-2">
          <AlignLeft className="w-4 h-4 text-slate-500" />
          <input
            type="range"
            min="14"
            max="24"
            value={fontSize}
            onChange={(e) => onFontSizeChange(Number(e.target.value))}
            className="w-24"
          />
          <span className="text-xs text-slate-600 w-12">{fontSize}px</span>
        </div>
      </div>

      <div className="text-xs text-slate-500">
        Illusionsはあなたの作品の無断保存およびAI学習への利用は行いません
      </div>
    </div>
  );
}

function MilkdownEditor({
  initialContent,
  onChange,
  isVertical,
  fontSize,
  lineHeight,
}: {
  initialContent: string;
  onChange?: (content: string) => void;
  isVertical: boolean;
  fontSize: number;
  lineHeight: number;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  // Store initial content at mount time - this should only change when component remounts (file switch)
  const initialContentRef = useRef<string>(initialContent);
  const onChangeRef = useRef(onChange);

  // Update onChange ref when it changes

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const { get } = useEditor((root) => {
    const value = initialContentRef.current;
    return Editor.make()
      .config(nord)
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, value);
      })
      // Load listener plugin BEFORE accessing listenerCtx
      .use(listener)
      .config((ctx) => {
        ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
          onChangeRef.current?.(markdown);
        });
      })
      .use(commonmark)
      .use(japaneseNovel({
        isVertical,
        showManuscriptLine: false,
        enableRuby: true,
        enableTcy: true,
      }))
      .use(history)
      .use(clipboard)
      .use(cursor);
  }, [isVertical]); // Only recreate editor when isVertical changes

  // Handle vertical mode change without recreating the entire editor
  useEffect(() => {
    // Use a small delay to ensure the editor is fully initialized
    const timer = setTimeout(() => {
      try {
        const editor = get();
        if (!editor) return;
        
        const editorDom = editorRef.current?.querySelector('.milkdown .ProseMirror');
        if (editorDom) {
          if (isVertical) {
            editorDom.classList.add('milkdown-japanese-vertical');
          } else {
            editorDom.classList.remove('milkdown-japanese-vertical');
          }
        }
      } catch {
        // Editor context not ready yet, ignore
      }
    }, 100);
    
    return () => clearTimeout(timer);
  }, [isVertical, get]);

  return (
    <div
      ref={editorRef}
      className="max-w-4xl mx-auto p-8"
      style={{
        fontSize: `${fontSize}px`,
        lineHeight: lineHeight,
        fontFamily: "inherit",
      }}
    >
      <Milkdown />
    </div>
  );
}
