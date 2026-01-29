"use client";

import { RefObject, useEffect, useRef, useState } from "react";
import { commandsCtx, Editor, rootCtx, defaultValueCtx, editorViewCtx } from "@milkdown/core";
import { nord } from "@milkdown/theme-nord";
import { commonmark, toggleEmphasisCommand, toggleStrongCommand, toggleInlineCodeCommand, wrapInHeadingCommand, wrapInBlockquoteCommand, wrapInBulletListCommand, wrapInOrderedListCommand } from "@milkdown/preset-commonmark";
import { gfm, toggleStrikethroughCommand } from "@milkdown/preset-gfm";
import { listener, listenerCtx } from "@milkdown/plugin-listener";
import { history } from "@milkdown/plugin-history";
import { clipboard } from "@milkdown/plugin-clipboard";
import { cursor } from "@milkdown/plugin-cursor";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { ProsemirrorAdapterProvider } from "@prosemirror-adapter/react";
import { japaneseNovel } from "@/packages/milkdown-plugin-japanese-novel";
import clsx from "clsx";
import { Type, AlignLeft, Search } from "lucide-react";
import { EditorView } from "@milkdown/prose/view";
import BubbleMenu, { type FormatType } from "./BubbleMenu";
import SearchDialog from "./SearchDialog";

interface EditorProps {
  initialContent?: string;
  onChange?: (content: string) => void;
  onInsertText?: (text: string) => void;
  className?: string;
  fontScale?: number;
  lineHeight?: number;
  textIndent?: number;
  fontFamily?: string;
  charsPerLine?: number;
  searchOpenTrigger?: number;
}

export default function NovelEditor({ 
  initialContent = "", 
  onChange, 
  onInsertText, 
  className,
  fontScale = 100,
  lineHeight = 1.8,
  textIndent = 1,
  fontFamily = 'Noto Serif JP',
  charsPerLine = 40,
  searchOpenTrigger = 0,
}: EditorProps) {
  const [isVertical, setIsVertical] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [editorViewInstance, setEditorViewInstance] = useState<EditorView | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleSearchOpen = () => {
    setIsSearchOpen(true);
  };

  // Listen for search open trigger from parent (keyboard shortcut)
  useEffect(() => {
    if (searchOpenTrigger > 0) {
      handleSearchOpen();
    }
  }, [searchOpenTrigger]);

  return (
    <div className={clsx("flex flex-col h-full min-h-0", className)}>
      {/* Editor Toolbar */}
      <EditorToolbar
        isVertical={isVertical}
        onToggleVertical={() => setIsVertical(!isVertical)}
        fontScale={fontScale}
        lineHeight={lineHeight}
        onSearchClick={handleSearchOpen}
      />

      {/* Editor Area */}
      <div
        ref={scrollContainerRef}
        className={clsx(
          "flex-1 bg-slate-50 relative min-h-0 pt-12",
          isVertical ? "overflow-x-auto overflow-y-auto" : "overflow-auto"
        )}
      >
        <MilkdownProvider>
          <ProsemirrorAdapterProvider>
            <MilkdownEditor
              initialContent={initialContent}
              onChange={onChange}
              onInsertText={onInsertText}
              isVertical={isVertical}
              fontScale={fontScale}
              lineHeight={lineHeight}
              textIndent={textIndent}
              fontFamily={fontFamily}
              charsPerLine={charsPerLine}
              scrollContainerRef={scrollContainerRef}
              onEditorViewReady={setEditorViewInstance}
            />
          </ProsemirrorAdapterProvider>
        </MilkdownProvider>
      </div>

      {/* Search Dialog */}
      <SearchDialog
        editorView={editorViewInstance}
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
      />
    </div>
  );
}

function EditorToolbar({
  isVertical,
  onToggleVertical,
  fontScale,
  lineHeight,
  onSearchClick,
}: {
  isVertical: boolean;
  onToggleVertical: () => void;
  fontScale: number;
  lineHeight: number;
  onSearchClick: () => void;
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

        {/* Display current settings */}
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <AlignLeft className="w-4 h-4 text-slate-500" />
          <span>{fontScale}% / {lineHeight.toFixed(1)}</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="text-xs text-slate-500">
          Illusionsはあなたの作品の無断保存およびAI学習への利用は行いません
        </div>

        {/* Search Button */}
        <button
          onClick={onSearchClick}
          className="flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
          title="検索 (⌘F)"
        >
          <Search className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function MilkdownEditor({
  initialContent,
  onChange,
  onInsertText,
  isVertical,
  fontScale,
  lineHeight,
  textIndent,
  fontFamily,
  charsPerLine,
  scrollContainerRef,
  onEditorViewReady,
}: {
  initialContent: string;
  onChange?: (content: string) => void;
  onInsertText?: (text: string) => void;
  isVertical: boolean;
  fontScale: number;
  lineHeight: number;
  textIndent: number;
  fontFamily: string;
  charsPerLine: number;
  scrollContainerRef: RefObject<HTMLDivElement>;
  onEditorViewReady?: (view: EditorView) => void;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [editorViewInstance, setEditorViewInstance] = useState<EditorView | null>(null);
  // Store initial content at mount time - this should only change when component remounts (file switch)
  const initialContentRef = useRef<string>(initialContent);
  const onChangeRef = useRef(onChange);
  const onInsertTextRef = useRef(onInsertText);

  // Update onChange ref when it changes

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onInsertTextRef.current = onInsertText;
  }, [onInsertText]);

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
      .use(gfm)
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

  // Get editor view instance
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const editor = get();
        if (editor) {
          const view = editor.ctx.get(editorViewCtx);
          setEditorViewInstance(view);
          onEditorViewReady?.(view);
        }
      } catch {
        // Editor not ready yet
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [get, onEditorViewReady]);

  // Handle vertical mode change without recreating the entire editor
  useEffect(() => {
    // Use a small delay to ensure the editor is fully initialized
    const timer = setTimeout(() => {
      try {
        const editor = get();
        if (!editor) return;
        
        const editorDom = editorRef.current?.querySelector('.milkdown .ProseMirror');
        if (editorDom) {
          // Remove both classes first to ensure clean state
          editorDom.classList.remove('milkdown-japanese-vertical', 'milkdown-japanese-horizontal');
          
          // Add appropriate class based on mode
          if (isVertical) {
            editorDom.classList.add('milkdown-japanese-vertical');
          } else {
            editorDom.classList.add('milkdown-japanese-horizontal');
          }
        }
      } catch {
        // Editor context not ready yet, ignore
      }
    }, 100);
    
    return () => clearTimeout(timer);
  }, [isVertical, get]);

  // Convert vertical mouse wheel to horizontal scroll in vertical mode
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !isVertical) return;

    const handleWheel = (event: WheelEvent) => {
      // Detect if it's a touchpad (has deltaX and deltaY with fine precision)
      // or a mouse wheel (usually only deltaY or coarse values)
      const isTouchpad = Math.abs(event.deltaX) > 0 || 
                         (Math.abs(event.deltaY) % 1 !== 0);

      if (isTouchpad) {
        // Touchpad: swap X and Y axes
        // horizontal gesture -> vertical scroll
        // vertical gesture -> horizontal scroll
        container.scrollLeft += event.deltaY;
        container.scrollTop += event.deltaX;
        event.preventDefault();
      } else {
        // Mouse wheel: 
        // vertical wheel -> horizontal scroll
        // horizontal wheel -> vertical scroll
        if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
          container.scrollLeft += event.deltaY;
          event.preventDefault();
        } else if (Math.abs(event.deltaX) > 0) {
          container.scrollTop += event.deltaX;
          event.preventDefault();
        }
      }
    };

    container.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      container.removeEventListener("wheel", handleWheel);
    };
  }, [isVertical, scrollContainerRef]);

  // Handle format commands from BubbleMenu
  const handleFormat = (format: FormatType, level?: number) => {
    try {
      const editor = get();
      if (!editor) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const execute = (commandKey: any, payload?: unknown) => {
        editor.action((ctx) => {
          const commands = ctx.get(commandsCtx);
          commands.call(commandKey, payload);
        });
      };

      switch (format) {
        case "bold":
          execute(toggleStrongCommand.key);
          break;
        case "italic":
          execute(toggleEmphasisCommand.key);
          break;
        case "strikethrough":
          execute(toggleStrikethroughCommand.key);
          break;
        case "heading":
          if (level) {
            execute(wrapInHeadingCommand.key, level);
          }
          break;
        case "blockquote":
          execute(wrapInBlockquoteCommand.key);
          break;
        case "bulletList":
          execute(wrapInBulletListCommand.key);
          break;
        case "orderedList":
          execute(wrapInOrderedListCommand.key);
          break;
        case "code":
          execute(toggleInlineCodeCommand.key);
          break;
        case "link":
          execute(toggleStrongCommand.key);
          break;
        default:
          break;
      }
    } catch (error) {
      console.error("Format command failed:", error);
    }
  };

  return (
    <>
      <div
        ref={editorRef}
        className={clsx(
          "mx-auto",
          isVertical ? "px-16 py-16 min-w-fit h-full" : "p-8 max-w-4xl"
        )}
        style={{
          fontSize: `${fontScale}%`,
          lineHeight: lineHeight,
          fontFamily: `"${fontFamily}", serif`,
          // Apply text-indent to paragraphs only (not headings)
          // This is done via CSS and doesn't add actual spaces to the content
          ['--chars-per-line' as string]: charsPerLine,
        }}
      >
        <style jsx>{`
          div :global(.milkdown .ProseMirror p) {
            text-indent: ${textIndent}em;
          }
          /* Don't apply indent to headings, lists, blockquotes, etc. */
          div :global(.milkdown .ProseMirror h1),
          div :global(.milkdown .ProseMirror h2),
          div :global(.milkdown .ProseMirror h3),
          div :global(.milkdown .ProseMirror h4),
          div :global(.milkdown .ProseMirror h5),
          div :global(.milkdown .ProseMirror h6),
          div :global(.milkdown .ProseMirror li),
          div :global(.milkdown .ProseMirror blockquote) {
            text-indent: 0;
          }
          
          /* Character per line limit for horizontal mode */
          ${charsPerLine > 0 ? `
          div :global(.milkdown .ProseMirror.milkdown-japanese-horizontal p),
          div :global(.milkdown .ProseMirror.milkdown-japanese-horizontal blockquote),
          div :global(.milkdown .ProseMirror.milkdown-japanese-horizontal li) {
            max-width: ${charsPerLine}em;
            word-wrap: break-word;
            overflow-wrap: break-word;
          }
          ` : ''}
          
          /* Character per line limit for vertical mode */
          ${charsPerLine > 0 ? `
          div :global(.milkdown .ProseMirror.milkdown-japanese-vertical p),
          div :global(.milkdown .ProseMirror.milkdown-japanese-vertical blockquote),
          div :global(.milkdown .ProseMirror.milkdown-japanese-vertical li) {
            max-height: ${charsPerLine}em;
            word-wrap: break-word;
            overflow-wrap: break-word;
          }
          ` : ''}
        `}</style>
        <Milkdown />
      </div>
      {editorViewInstance && (
        <BubbleMenu editorView={editorViewInstance} onFormat={handleFormat} isVertical={isVertical} />
      )}
    </>
  );
}
