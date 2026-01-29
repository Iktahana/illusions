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
import SelectionCounter from "./SelectionCounter";

interface EditorProps {
  initialContent?: string;
  onChange?: (content: string) => void;
  onInsertText?: (text: string) => void;
  className?: string;
  fontScale?: number;
  lineHeight?: number;
  paragraphSpacing?: number;
  textIndent?: number;
  fontFamily?: string;
  charsPerLine?: number;
  searchOpenTrigger?: number;
  showParagraphNumbers?: boolean;
}

export default function NovelEditor({ 
  initialContent = "", 
  onChange, 
  onInsertText, 
  className,
  fontScale = 100,
  lineHeight = 1.8,
  paragraphSpacing = 0,
  textIndent = 1,
  fontFamily = 'Noto Serif JP',
  charsPerLine = 40,
  searchOpenTrigger = 0,
  showParagraphNumbers = false,
}: EditorProps) {
  // Start with false to avoid hydration mismatch
  const [isVertical, setIsVertical] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [editorViewInstance, setEditorViewInstance] = useState<EditorView | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Load from localStorage after mounting (client-side only)
  useEffect(() => {
    setIsMounted(true);
    const saved = localStorage.getItem('illusions-writing-mode');
    if (saved === 'vertical') {
      setIsVertical(true);
    }
  }, []);

  // Save vertical state to localStorage when it changes
  useEffect(() => {
    if (!isMounted) return;
    localStorage.setItem('illusions-writing-mode', isVertical ? 'vertical' : 'horizontal');
  }, [isVertical, isMounted]);

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
    <div className={clsx("flex flex-col h-full min-h-0 relative", className)}>
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
        className="flex-1 bg-background-secondary relative min-h-0 pt-12"
        style={{
          overflowX: 'auto',
          overflowY: 'auto',
        }}
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
              paragraphSpacing={paragraphSpacing}
              textIndent={textIndent}
              fontFamily={fontFamily}
              charsPerLine={charsPerLine}
              scrollContainerRef={scrollContainerRef}
              onEditorViewReady={setEditorViewInstance}
              showParagraphNumbers={showParagraphNumbers}
            />
          </ProsemirrorAdapterProvider>
        </MilkdownProvider>

        {/* Selection Counter - positioned relative to editor */}
        {editorViewInstance && (
          <SelectionCounter editorView={editorViewInstance} isVertical={isVertical} />
        )}
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
    <div className="h-12 border-b border-border bg-background flex items-center justify-between px-4">
      <div className="flex items-center gap-4">
        {/* Vertical Writing Toggle */}
        <button
          onClick={onToggleVertical}
          className={clsx(
            "flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition-colors",
            isVertical
              ? "bg-active text-accent"
              : "bg-background-tertiary text-foreground-secondary hover:bg-hover"
          )}
        >
          <Type className="w-4 h-4" />
          {isVertical ? "縦書き" : "横書き"}
        </button>

        {/* Display current settings */}
        <div className="flex items-center gap-2 text-xs text-foreground-secondary">
          <AlignLeft className="w-4 h-4 text-foreground-tertiary" />
          <span>{fontScale}% / {lineHeight.toFixed(1)}</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="text-xs text-foreground-tertiary">
          Illusionsはあなたの作品の無断保存およびAI学習への利用は行いません
        </div>

        {/* Search Button */}
        <button
          onClick={onSearchClick}
          className="flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium bg-background-tertiary text-foreground-secondary hover:bg-hover transition-colors"
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
  paragraphSpacing,
  textIndent,
  fontFamily,
  charsPerLine,
  scrollContainerRef,
  onEditorViewReady,
  showParagraphNumbers,
}: {
  initialContent: string;
  onChange?: (content: string) => void;
  onInsertText?: (text: string) => void;
  isVertical: boolean;
  fontScale: number;
  lineHeight: number;
  paragraphSpacing: number;
  textIndent: number;
  fontFamily: string;
  charsPerLine: number;
  scrollContainerRef: RefObject<HTMLDivElement>;
  onEditorViewReady?: (view: EditorView) => void;
  showParagraphNumbers: boolean;
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
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    const maxAttempts = 10;
    
    const tryGetEditorView = () => {
      attempts++;
      try {
        const editor = get();
        if (editor && editor.ctx) {
          const view = editor.ctx.get(editorViewCtx);
          if (view) {
            setEditorViewInstance(view);
            onEditorViewReady?.(view);
            return;
          }
        }
      } catch {
        // Editor not ready yet
      }
      // Retry if not ready yet
      if (attempts < maxAttempts) {
        timer = setTimeout(tryGetEditorView, 100);
      }
    };
    
    timer = setTimeout(tryGetEditorView, 100);

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

  // Track previous style values to avoid unnecessary animations
  const prevStyleRef = useRef({ charsPerLine, isVertical, fontFamily, fontScale, lineHeight });
  const isFirstRenderRef = useRef(true);

  // Apply character per line limit using JavaScript measurement
  useEffect(() => {
    const editorContainer = editorRef.current;
    const editorDom = editorContainer?.querySelector('.milkdown .ProseMirror') as HTMLElement;
    if (!editorDom) return;

    const prev = prevStyleRef.current;
    const styleChanged =
      prev.charsPerLine !== charsPerLine ||
      prev.isVertical !== isVertical ||
      prev.fontFamily !== fontFamily ||
      prev.fontScale !== fontScale ||
      prev.lineHeight !== lineHeight;

    // Update prev ref
    prevStyleRef.current = { charsPerLine, isVertical, fontFamily, fontScale, lineHeight };

    // Skip animation if styles haven't changed (e.g., just editor rebuild from save)
    const shouldAnimate = styleChanged && !isFirstRenderRef.current;
    isFirstRenderRef.current = false;

    const applyStyles = () => {
      // Reset styles first
      editorDom.style.width = '';
      editorDom.style.maxWidth = '';
      editorDom.style.height = '';
      editorDom.style.maxHeight = '';
      editorDom.style.minHeight = '';
      editorDom.style.margin = '';

      // Remove any existing spacer
      const existingSpacer = editorContainer?.querySelector('.vertical-spacer');
      if (existingSpacer) {
        existingSpacer.remove();
      }

      if (charsPerLine > 0) {
        // Create a measurement element to get the actual character size
        const measureEl = document.createElement('span');
        measureEl.style.cssText = `
          position: absolute;
          visibility: hidden;
          white-space: nowrap;
          font-family: "${fontFamily}", serif;
          font-size: ${fontScale}%;
          line-height: ${lineHeight};
        `;
        measureEl.textContent = '国'; // Use a full-width character for Japanese
        document.body.appendChild(measureEl);
        
        // Japanese characters are typically square
        const charSize = measureEl.offsetWidth;
        document.body.removeChild(measureEl);

        // Apply the calculated size to the editor
        if (isVertical) {
          // In vertical mode, limit height (characters per column)
          const targetHeight = charSize * charsPerLine;
          editorDom.style.height = `${targetHeight}px`;
          editorDom.style.maxHeight = `${targetHeight}px`;
          editorDom.style.minHeight = `${targetHeight}px`;
        } else {
          // In horizontal mode, limit width (characters per line) and center horizontally
          const targetWidth = charSize * charsPerLine;
          editorDom.style.width = `${targetWidth}px`;
          editorDom.style.maxWidth = `${targetWidth}px`;
          editorDom.style.margin = '0 auto'; // Center horizontally
        }
      }

      // For vertical mode, ensure the editor fills the container width
      // This prevents content from appearing stuck on the right when there's little text
      if (isVertical && scrollContainerRef.current) {
        // Use requestAnimationFrame to ensure DOM has been updated
        requestAnimationFrame(() => {
          const container = scrollContainerRef.current;
          if (!container) return;
          
          const containerWidth = container.clientWidth;
          // Calculate the padding (px-16 = 64px on each side)
          const padding = 128; // 64px * 2
          const minWidth = containerWidth - padding;
          
          // Set minimum width on the ProseMirror element
          // In vertical-rl mode, content flows from right to left
          // By ensuring min-width fills the container, content will start from the right edge
          editorDom.style.minWidth = `${minWidth}px`;
        });
      } else {
        // Remove min-width for horizontal mode
        editorDom.style.minWidth = '';
      }
    };

    if (shouldAnimate) {
      // Fade out before making changes
      editorDom.style.transition = 'opacity 0.15s ease-out';
      editorDom.style.opacity = '0';

      // Delay to ensure editor DOM is ready and fade out completes
      const timer = setTimeout(() => {
        applyStyles();

        // Fade in after changes are applied
        requestAnimationFrame(() => {
          editorDom.style.transition = 'opacity 0.25s ease-in';
          editorDom.style.opacity = '1';
          
          // After fade in completes, scroll to right for vertical mode
          if (isVertical && scrollContainerRef.current) {
            setTimeout(() => {
              const container = scrollContainerRef.current;
              if (container) {
                container.scrollLeft = container.scrollWidth;
              }
            }, 250); // Wait for fade in to complete
          }
        });
      }, 150);

      return () => {
        clearTimeout(timer);
      };
    } else {
      // No animation, just apply styles immediately
      applyStyles();
      editorDom.style.opacity = '1';
      
      // Scroll to right for vertical mode on first render
      if (isVertical && scrollContainerRef.current) {
        const container = scrollContainerRef.current;
        if (container) {
          container.scrollLeft = container.scrollWidth;
        }
      }
    }
  }, [charsPerLine, isVertical, fontFamily, fontScale, lineHeight, scrollContainerRef, get]);

  // Convert vertical mouse wheel to horizontal scroll in vertical mode
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !isVertical) return;

    const handleWheel = (event: WheelEvent) => {
      // Detect if it's a touchpad by checking:
      // 1. Has both deltaX and deltaY (most touchpads support 2D scrolling)
      // 2. Has fine-grained values (not coarse like 100, -100)
      // 3. ctrlKey is not pressed (pinch zoom)
      const hasBothAxes = Math.abs(event.deltaX) > 0 && Math.abs(event.deltaY) > 0;
      const hasFineGrainedValues = 
        (Math.abs(event.deltaY) < 50 && Math.abs(event.deltaY) > 0) ||
        (Math.abs(event.deltaX) < 50 && Math.abs(event.deltaX) > 0);
      const isTouchpad = hasBothAxes || (hasFineGrainedValues && !event.ctrlKey);

      if (isTouchpad) {
        // Touchpad: Keep natural scroll direction
        // User swipes up/down -> content scrolls up/down
        // User swipes left/right -> content scrolls left/right
        container.scrollLeft += event.deltaX;
        container.scrollTop += event.deltaY;
        event.preventDefault();
      } else {
        // Mouse wheel:
        // - Vertical wheel (deltaY) -> horizontal scroll (for vertical text)
        // - Horizontal wheel (deltaX) -> vertical scroll
        if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
          // Vertical wheel scroll
          container.scrollLeft += event.deltaY;
          event.preventDefault();
        } else if (Math.abs(event.deltaX) > 0) {
          // Horizontal wheel scroll (rare, but some mice have it)
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
            // Use standard command - headingIdFixer plugin will add ID
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
          "editor-content-area",
          isVertical 
            ? "px-16 py-8 min-w-fit" 
            : "p-8 mx-auto"
        )}
        style={{
          fontSize: `${fontScale}%`,
          fontFamily: `"${fontFamily}", serif`,
          lineHeight: lineHeight,
          ...(isVertical && {
            minHeight: '100%',
            display: 'flex',
            alignItems: 'center',
          }),
        }}
      >
        <style jsx>{`
          div :global(.milkdown .ProseMirror) {
            line-height: ${lineHeight};
            ${showParagraphNumbers ? 'counter-reset: paragraph;' : ''}
          }
          div :global(.milkdown .ProseMirror.milkdown-japanese-horizontal p) {
            text-indent: ${textIndent}em;
            margin-bottom: ${paragraphSpacing}em;
            ${showParagraphNumbers ? 'counter-increment: paragraph;' : ''}
            ${showParagraphNumbers ? 'position: relative;' : ''}
          }
          div :global(.milkdown .ProseMirror.milkdown-japanese-vertical p) {
            text-indent: ${textIndent}em;
            margin-left: ${paragraphSpacing}em;
            ${showParagraphNumbers ? 'counter-increment: paragraph;' : ''}
            ${showParagraphNumbers ? 'position: relative;' : ''}
          }
          div :global(.milkdown .ProseMirror p::before) {
            ${showParagraphNumbers ? `
              content: counter(paragraph);
              position: absolute;
              left: -2em;
              font-size: 0.7em;
              opacity: 0.5;
              color: currentColor;
              user-select: none;
            ` : 'content: none;'}
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
        `}</style>
        <style jsx global>{`
          /* Start editor content transparent, JS will fade it in after layout */
          .editor-content-area .milkdown .ProseMirror {
            opacity: 0;
          }
        `}</style>
        <Milkdown />
      </div>
      {editorViewInstance && (
        <BubbleMenu editorView={editorViewInstance} onFormat={handleFormat} isVertical={isVertical} />
      )}
    </>
  );
}
