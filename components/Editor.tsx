"use client";

import { MutableRefObject, RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  getScrollProgress,
  setScrollProgress,
} from "@/packages/milkdown-plugin-japanese-novel/scroll-progress";
import { posHighlight } from "@/packages/milkdown-plugin-japanese-novel/pos-highlight";
import clsx from "clsx";
import { Type, AlignLeft, Search } from "lucide-react";
import { EditorView } from "@milkdown/prose/view";
import { AllSelection, Plugin, PluginKey } from "@milkdown/prose/state";
import { $prose } from "@milkdown/utils";
import BubbleMenu, { type FormatType } from "./BubbleMenu";
import SearchDialog from "./SearchDialog";
import SelectionCounter from "./SelectionCounter";
import { searchHighlightPlugin } from "@/lib/search-highlight-plugin";
import EditorContextMenu, { type ContextMenuAction } from "./EditorContextMenu";
import { isElectronRenderer } from "@/lib/runtime-env";

interface EditorProps {
  initialContent?: string;
  onChange?: (content: string) => void;
  onInsertText?: (text: string) => void;
  onSelectionChange?: (charCount: number) => void;
  className?: string;
  fontScale?: number;
  lineHeight?: number;
  paragraphSpacing?: number;
  textIndent?: number;
  fontFamily?: string;
  charsPerLine?: number;
  onCharsPerLineChange?: (chars: number) => void;
  searchOpenTrigger?: number;
  searchInitialTerm?: string;
  showParagraphNumbers?: boolean;
  onEditorViewReady?: (view: EditorView) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onShowAllSearchResults?: (matches: any[], searchTerm: string) => void;
  // 品詞着色設定
  posHighlightEnabled?: boolean;
  posHighlightColors?: Record<string, string>;
  // スクロール設定
  verticalScrollBehavior?: "auto" | "mouse" | "trackpad";
  scrollSensitivity?: number;
  // 書式コールバック
  onOpenRubyDialog?: () => void;
  onToggleTcy?: () => void;
  // 辞書
  onOpenDictionary?: (searchTerm?: string) => void;
  // ツールバーからの設定変更
  onFontScaleChange?: (v: number) => void;
  onLineHeightChange?: (v: number) => void;
  onParagraphSpacingChange?: (v: number) => void;
}

export default function NovelEditor({
  initialContent = "",
  onChange,
  onInsertText,
  onSelectionChange,
  className,
  fontScale = 100,
  lineHeight = 1.8,
  paragraphSpacing = 0.5,
  textIndent = 1,
  fontFamily = 'Noto Serif JP',
  charsPerLine = 40,
  onCharsPerLineChange,
  searchOpenTrigger = 0,
  searchInitialTerm,
  showParagraphNumbers = false,
  onEditorViewReady,
  onShowAllSearchResults,
  posHighlightEnabled = false,
  posHighlightColors = {},
  verticalScrollBehavior = "auto",
  scrollSensitivity = 1.0,
  onOpenRubyDialog,
  onToggleTcy,
  onOpenDictionary,
  onFontScaleChange,
  onLineHeightChange,
  onParagraphSpacingChange,
}: EditorProps) {
  // localStorage から同期的に初期値を読み込む（初回レンダリング前に反映、横→縦のフラッシュ防止）
  const [isVertical, setIsVertical] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("illusions-writing-mode") === "vertical";
  });
  const [isMounted, setIsMounted] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [editorViewInstance, setEditorViewInstance] = useState<EditorView | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  // Ref to indicate a mode switch is in progress (for scroll restoration)
  const isModeSwitchingRef = useRef(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // 変更時に縦書き状態を localStorage に保存する
  useEffect(() => {
    if (!isMounted) return;
    localStorage.setItem('illusions-writing-mode', isVertical ? 'vertical' : 'horizontal');
  }, [isVertical, isMounted]);

   // 注意：このエフェクトはもう不要。理由：
   // 1. 新規ファイル打開時、親コンポーネント は key 属性経由で NovelEditor 全体を再マウント
   // 2. 編集内容時、initialContent は変わるが、スクロール位置をリセットするべきではない
   // 3. モード切替時、handleToggleVertical がスクロール位置の保存と復元を担当
   // 
   // 将来、再マウント無しでファイル切替が必要なら、明確な fileId prop を追加して追跡可能

  const handleSearchToggle = () => {
    setIsSearchOpen(prev => !prev);
  };

  // 親からのトリガーで検索ダイアログを開く（ショートカット）
  useEffect(() => {
    if (searchOpenTrigger > 0) {
      handleSearchToggle();
    }
  }, [searchOpenTrigger]);

  // 儲存切換前的滾動進度（0-1）
  const savedScrollProgressRef = useRef<number>(0);
  
  // 模式切換時保存當前滾動進度
  const handleToggleVertical = useCallback(() => {
    const container = scrollContainerRef.current;
    if (container) {
      // 使用抽象層獲取當前進度
      const progress = getScrollProgress({ container, isVertical });

      // 保存進度
      savedScrollProgressRef.current = progress;

      console.log('[DEBUG] Toggle - Save progress:', {
        mode: isVertical ? '豎→橫' : '橫→豎',
        progress
      });

      // Mark that scroll position needs restoration after mode switch
      isModeSwitchingRef.current = true;
    }

    setIsVertical(!isVertical);
  }, [isVertical, scrollContainerRef]);

  // Calculate optimal chars per line based on editor width and font size
  const calculateOptimalCharsPerLine = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // Measure character width
    const measureEl = document.createElement('span');
    measureEl.style.cssText = `
      position: absolute;
      visibility: hidden;
      white-space: nowrap;
      font-family: "${fontFamily}", serif;
      font-size: ${fontScale}%;
      line-height: ${lineHeight};
    `;
    measureEl.textContent = '国'; // Measure with full-width character
    document.body.appendChild(measureEl);
    const charSize = measureEl.offsetWidth;
    document.body.removeChild(measureEl);

    if (charSize <= 0) return;

    // Get available space (subtract padding)
    const padding = 128; // px-16 = 64px * 2 for left and right
    const availableWidth = container.clientWidth - padding;

    if (isVertical) {
      // For vertical writing: calculate based on available height
      // Get visible height (subtract toolbar height)
      const toolbarHeight = 48; // h-12 = 48px
      const topPadding = 48; // pt-12 = 48px
      const availableHeight = container.clientHeight - toolbarHeight - topPadding;

      const optimalChars = Math.max(10, Math.floor(availableHeight / charSize));
      // Clamp: max 40 characters
      const clamped = Math.min(40, optimalChars);

      if (clamped !== charsPerLine) {
        onCharsPerLineChange?.(clamped);
      }
    } else {
      // For horizontal writing: calculate based on available width
      const optimalChars = Math.max(10, Math.floor(availableWidth / charSize));
      // Clamp: max 40 characters
      const clamped = Math.min(40, optimalChars);

      if (clamped !== charsPerLine) {
        onCharsPerLineChange?.(clamped);
      }
    }
  }, [fontFamily, fontScale, lineHeight, isVertical, charsPerLine, onCharsPerLineChange, scrollContainerRef]);

  // Add window resize listener to auto-adjust chars per line
  useEffect(() => {
    if (!onCharsPerLineChange) return;

    // Calculate on mount
    const timer = setTimeout(calculateOptimalCharsPerLine, 100);

    // Calculate on window resize
    const handleResize = () => {
      calculateOptimalCharsPerLine();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
    };
  }, [calculateOptimalCharsPerLine, onCharsPerLineChange]);

  return (
    <div className={clsx("flex flex-col h-full min-h-0 relative", className)}>
      {/* ツールバー */}
      <EditorToolbar
        isVertical={isVertical}
        onToggleVertical={handleToggleVertical}
        fontScale={fontScale}
        lineHeight={lineHeight}
        paragraphSpacing={paragraphSpacing}
        onFontScaleChange={onFontScaleChange ?? (() => {})}
        onLineHeightChange={onLineHeightChange ?? (() => {})}
        onParagraphSpacingChange={onParagraphSpacingChange ?? (() => {})}
        onSearchClick={handleSearchToggle}
      />

      {/* エディタ領域 */}
      <div
        ref={scrollContainerRef}
        className="flex-1 bg-background-secondary relative min-h-0 pt-12"
        style={{
          overflowX: 'auto',
          overflowY: 'auto',
          // 禁用瀏覽器的滾動錨定行為，避免在豎排模式下 DOM 更新時自動調整滾動位置
          overflowAnchor: 'none',
        }}
      >
        <MilkdownProvider>
          <ProsemirrorAdapterProvider>
            <MilkdownEditor
              initialContent={initialContent}
              onChange={onChange}
              onInsertText={onInsertText}
              onSelectionChange={onSelectionChange}
              isVertical={isVertical}
              fontScale={fontScale}
              lineHeight={lineHeight}
              paragraphSpacing={paragraphSpacing}
              textIndent={textIndent}
              fontFamily={fontFamily}
              charsPerLine={charsPerLine}
              scrollContainerRef={scrollContainerRef}
              onEditorViewReady={(view) => {
                setEditorViewInstance(view);
                onEditorViewReady?.(view);
              }}
              showParagraphNumbers={showParagraphNumbers}
              isModeSwitchingRef={isModeSwitchingRef}
              savedScrollProgressRef={savedScrollProgressRef}
              posHighlightEnabled={posHighlightEnabled}
              posHighlightColors={posHighlightColors}
              verticalScrollBehavior={verticalScrollBehavior}
              scrollSensitivity={scrollSensitivity}
              onOpenRubyDialog={onOpenRubyDialog}
              onToggleTcy={onToggleTcy}
              onOpenDictionary={onOpenDictionary}
            />
          </ProsemirrorAdapterProvider>
        </MilkdownProvider>

        {/* 選択文字数（エディタ基準で配置） */}
        {editorViewInstance && (
          <SelectionCounter editorView={editorViewInstance} isVertical={isVertical} />
        )}
      </div>

      {/* 検索ダイアログ */}
      <SearchDialog
        editorView={editorViewInstance}
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onShowAllResults={onShowAllSearchResults}
        initialSearchTerm={searchInitialTerm}
      />
    </div>
  );
}

/** Dropdown for picking a numeric value from a list */
function ValuePicker({
  value,
  label,
  options,
  onChange,
  unit = "",
}: {
  value: number;
  label: string;
  options: number[];
  onChange: (v: number) => void;
  unit?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(prev => !prev)}
        className="hover:text-foreground transition-colors cursor-pointer"
        title={label}
      >
        {label}
      </button>
      {open && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-50 min-w-[56px] max-h-[200px] overflow-y-auto rounded-lg border border-border bg-background-secondary shadow-lg py-1 text-xs">
          {options.map(opt => (
            <button
              key={opt}
              onClick={() => { onChange(opt); setOpen(false); }}
              className={clsx(
                "block w-full px-3 py-1 text-center hover:bg-white/5 transition-colors",
                opt === value ? "text-accent font-semibold" : "text-foreground-secondary"
              )}
            >
              {(opt % 1 === 0 ? opt : opt.toFixed(1)) + unit}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function EditorToolbar({
  isVertical,
  onToggleVertical,
  fontScale,
  lineHeight,
  paragraphSpacing,
  onFontScaleChange,
  onLineHeightChange,
  onParagraphSpacingChange,
  onSearchClick,
}: {
  isVertical: boolean;
  onToggleVertical: () => void;
  fontScale: number;
  lineHeight: number;
  paragraphSpacing: number;
  onFontScaleChange: (v: number) => void;
  onLineHeightChange: (v: number) => void;
  onParagraphSpacingChange: (v: number) => void;
  onSearchClick: () => void;
}) {
  // Options matching the 書式 menu ranges/steps
  const fontScaleOptions = Array.from({ length: 13 }, (_, i) => 50 + i * 10); // 50–170
  const lineHeightOptions = Array.from({ length: 21 }, (_, i) => +(1.0 + i * 0.1).toFixed(1)); // 1.0–3.0
  const paragraphSpacingOptions = Array.from({ length: 31 }, (_, i) => +(i * 0.1).toFixed(1)); // 0–3.0

  return (
    <div className="h-12 border-b border-border bg-background flex items-center justify-between px-4">
      <div className="flex items-center gap-4">
        {/* 縦書き/横書き */}
         <button
           onClick={onToggleVertical}
           className="flex items-center gap-2 px-3 py-1.5 rounded font-medium bg-accent text-accent-foreground hover:bg-accent-hover transition-colors whitespace-nowrap"
           style={{ fontSize: 'clamp(0.75rem, 1.5vw, 0.875rem)' }}
         >
           <Type className="w-4 h-4 shrink-0" />
           <span className="overflow-hidden text-ellipsis">{isVertical ? "縦書き" : "横書き"}</span>
         </button>

        {/* 現在の設定 */}
        <div className="flex items-center gap-2 text-xs text-foreground-secondary">
          <AlignLeft className="w-4 h-4 text-foreground-tertiary" />
          <ValuePicker value={fontScale} label={`${fontScale}%`} options={fontScaleOptions} onChange={onFontScaleChange} unit="%" />
          <span className="text-foreground-tertiary">/</span>
          <ValuePicker value={lineHeight} label={lineHeight.toFixed(1)} options={lineHeightOptions} onChange={onLineHeightChange} />
          <span className="text-foreground-tertiary">/</span>
          <ValuePicker value={paragraphSpacing} label={`${paragraphSpacing.toFixed(1)}em`} options={paragraphSpacingOptions} onChange={onParagraphSpacingChange} unit="em" />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="text-xs text-foreground-tertiary whitespace-nowrap hidden lg:block">
          illusionsはあなたの作品の無断保存およびAI学習への利用は行いません
        </div>

        {/* 検索 */}
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
  onSelectionChange,
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
  isModeSwitchingRef,
  savedScrollProgressRef,
  posHighlightEnabled,
  posHighlightColors,
  verticalScrollBehavior = "auto",
  scrollSensitivity = 1.0,
  onOpenRubyDialog,
  onToggleTcy,
  onOpenDictionary,
}: {
  initialContent: string;
  onChange?: (content: string) => void;
  onInsertText?: (text: string) => void;
  onSelectionChange?: (charCount: number) => void;
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
  isModeSwitchingRef: MutableRefObject<boolean>;
  savedScrollProgressRef: RefObject<number>;
  posHighlightEnabled?: boolean;
  posHighlightColors?: Record<string, string>;
  verticalScrollBehavior?: "auto" | "mouse" | "trackpad";
  scrollSensitivity?: number;
  onOpenRubyDialog?: () => void;
  onToggleTcy?: () => void;
  onOpenDictionary?: (searchTerm?: string) => void;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [editorViewInstance, setEditorViewInstance] = useState<EditorView | null>(null);
  const [hasSelection, setHasSelection] = useState(false);
  const isElectron = typeof window !== "undefined" && isElectronRenderer();
  // 初期内容はマウント時に固定（ファイル切り替えでコンポーネントが再マウントされたときだけ変わる）
  const initialContentRef = useRef<string>(initialContent);
  const onChangeRef = useRef(onChange);
  const onInsertTextRef = useRef(onInsertText);
  const onSelectionChangeRef = useRef(onSelectionChange);

  // コールバックが変わったら ref を更新する

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onInsertTextRef.current = onInsertText;
  }, [onInsertText]);

  useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange;
  }, [onSelectionChange]);

  // 縦書き: ブラウザの自動スクロールを防止するための保存位置
  const savedScrollPosRef = useRef({ left: 0, top: 0 });
  const userScrollingRef = useRef(false);

  // 縦書き用のスクロール制御プラグインを作成
  // isVertical の参照を保持
  const isVerticalRef = useRef(isVertical);
  // isVertical の変更を追跡
  useEffect(() => {
    isVerticalRef.current = isVertical;
  }, [isVertical]);
  
  // 縦書き時は完全にスクロール動作を禁止（ユーザーが手動でスクロールする）
  const verticalScrollPlugin = useMemo(() => $prose(() => new Plugin({
    key: new PluginKey('verticalScrollControl'),
    props: {
      handleScrollToSelection(_view) {
        // 縦書きモードではスクロール動作を完全に無視（排版完成後の明示的なスクロール以外）
        if (isVerticalRef.current) {
          return true; // デフォルトのスクロールを完全に禁止
        }
        
        // 横書き時はデフォルトの動作を使用
        return false;
      },
    },
  })), []);

  const { get } = useEditor((root) => {
    const value = initialContentRef.current;
    return Editor.make()
      .config(nord)
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, value);
      })
      // listenerCtx 参照より先に listener を読み込む
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
      .use(cursor)
      .use(verticalScrollPlugin)
      .use($prose(() => searchHighlightPlugin))
      .use(posHighlight({
        enabled: false, // 初期化時は無効、後で動的に更新
        colors: {},
        dicPath: '/dict',
        debounceMs: 300,
      }));
  }, [isVertical, verticalScrollPlugin]); // posHighlight の依賴を削除して Editor 再作成を防ぐ

  // EditorView インスタンスを取得する
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
        // まだ準備中
      }
      // 取得できるまでリトライ
      if (attempts < maxAttempts) {
        timer = setTimeout(tryGetEditorView, 100);
      }
    };

    timer = setTimeout(tryGetEditorView, 100);

    return () => clearTimeout(timer);
  }, [get, onEditorViewReady]);

  // posHighlight 設定を動的に更新（Editor を再作成せずに）
  useEffect(() => {
    if (!editorViewInstance) return;

    // 動的に設定を更新
    import('@/packages/milkdown-plugin-japanese-novel/pos-highlight').then(({ updatePosHighlightSettings }) => {
      updatePosHighlightSettings(editorViewInstance, {
        enabled: posHighlightEnabled,
        colors: posHighlightColors,
      });
    }).catch(err => {
      console.error('[Editor] Failed to update POS highlight settings:', err);
    });
  }, [editorViewInstance, posHighlightEnabled, posHighlightColors]);

  // 選択範囲の変更を追跡する
  useEffect(() => {
    if (!editorViewInstance) return;

    const updateSelectionCount = () => {
      const { state } = editorViewInstance;
      const { selection } = state;
      const { from, to } = selection;

      // 選択がない場合は 0
      if (from === to) {
        setHasSelection(false);
        onSelectionChangeRef.current?.(0);
        return;
      }

      // 選択文字列の文字数を数える（空白は除外）
      const selectedText = state.doc.textBetween(from, to);
      const count = selectedText.replace(/\s/g, "").length;
      setHasSelection(count > 0);
      onSelectionChangeRef.current?.(count);
    };

    // 選択変更を購読
    const editorDom = editorViewInstance.dom;

    const handleMouseUp = () => {
      setTimeout(updateSelectionCount, 10);
    };

    const handleKeyUp = () => {
      setTimeout(updateSelectionCount, 10);
    };

    const handleSelectionChange = () => {
      setTimeout(updateSelectionCount, 10);
    };

    editorDom.addEventListener("mouseup", handleMouseUp);
    editorDom.addEventListener("keyup", handleKeyUp);
    document.addEventListener("selectionchange", handleSelectionChange);

    // 初期値
    updateSelectionCount();

    return () => {
      editorDom.removeEventListener("mouseup", handleMouseUp);
      editorDom.removeEventListener("keyup", handleKeyUp);
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, [editorViewInstance]);

  // エディタ全体を作り直さずに縦書き/横書きを切り替える
  useEffect(() => {
    // 初期化完了を待つため少し遅延する
    const timer = setTimeout(() => {
      try {
        const editor = get();
        if (!editor) return;
        
        const editorDom = editorRef.current?.querySelector('.milkdown .ProseMirror');
        if (editorDom) {
          // まず両方のクラスを外して状態をリセットする
          editorDom.classList.remove('milkdown-japanese-vertical', 'milkdown-japanese-horizontal');
          
          // モードに応じてクラスを付与
          if (isVertical) {
            editorDom.classList.add('milkdown-japanese-vertical');
          } else {
            editorDom.classList.add('milkdown-japanese-horizontal');
          }
        }
      } catch {
        // まだ準備中なら無視
      }
    }, 100);
    
    return () => clearTimeout(timer);
  }, [isVertical, get]);

  // 不要なアニメーションを避けるため、直前のスタイル値を保持する
  const prevStyleRef = useRef({ charsPerLine, isVertical, fontFamily, fontScale, lineHeight });
  const isFirstRenderRef = useRef(true);

  // 1行あたりの文字数制限を、実測値を使って適用する
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

    // 直前値を更新
    prevStyleRef.current = { charsPerLine, isVertical, fontFamily, fontScale, lineHeight };

    // スタイルが変わっていない場合はアニメーションをしない（保存による再構築など）
    const shouldAnimate = styleChanged && !isFirstRenderRef.current;
    isFirstRenderRef.current = false;

    const applyStyles = () => {
      // まずスタイルをリセット
      editorDom.style.width = '';
      editorDom.style.maxWidth = '';
      editorDom.style.height = '';
      editorDom.style.maxHeight = '';
      editorDom.style.minHeight = '';
      editorDom.style.margin = '';

      // 既存のスペーサーを削除
      const existingSpacer = editorContainer?.querySelector('.vertical-spacer');
      if (existingSpacer) {
        existingSpacer.remove();
      }

      if (charsPerLine > 0) {
        // 実際の文字サイズを測るための要素を作る
        const measureEl = document.createElement('span');
        measureEl.style.cssText = `
          position: absolute;
          visibility: hidden;
          white-space: nowrap;
          font-family: "${fontFamily}", serif;
          font-size: ${fontScale}%;
          line-height: ${lineHeight};
        `;
        measureEl.textContent = '国'; // 全角文字で測定
        document.body.appendChild(measureEl);
        
        // 和文の全角文字は概ね正方形に近い
        const charSize = measureEl.offsetWidth;
        document.body.removeChild(measureEl);

        // 計算したサイズをエディタへ適用
        if (isVertical) {
          // 縦書き: 高さを制限（1列あたりの文字数）
          // 高さ計算の誤差を修正: 1文字分を減算
          const targetHeight = charSize * (charsPerLine - 1);
          editorDom.style.height = `${targetHeight}px`;
          editorDom.style.maxHeight = `${targetHeight}px`;
          editorDom.style.minHeight = `${targetHeight}px`;
        } else {
          // 横書き: 幅を制限（1行あたりの文字数）し、中央寄せ
          const targetWidth = charSize * charsPerLine;
          editorDom.style.width = `${targetWidth}px`;
          editorDom.style.maxWidth = `${targetWidth}px`;
          editorDom.style.margin = '0 auto'; // 中央寄せ
        }
      }

      // 縦書き: コンテナ幅を埋める最小幅を設定し、短文でも右側に寄り切るのを防ぐ
      if (isVertical && scrollContainerRef.current) {
        // DOM更新後に計算する
        requestAnimationFrame(() => {
          const container = scrollContainerRef.current;
          if (!container) return;
          
          const containerWidth = container.clientWidth;
          // パディング（px-16 = 左右 64px）
          const padding = 128; // 64px * 2
          const minWidth = containerWidth - padding;
          
          // ProseMirror に最小幅を設定
          // vertical-rl では右→左へ流れるため、最小幅を確保すると開始位置が右端に揃う
          editorDom.style.minWidth = `${minWidth}px`;
          
          // 排版完全完成後的回調
          onLayoutCompleteCallback?.();
        });
      } else {
        // 横書きでは最小幅を解除
        editorDom.style.minWidth = '';
        
        // 横書きの場合は即座に排版完成
        onLayoutCompleteCallback?.();
      }
    };
    
    // 排版完成後的滾動處理回調
    let onLayoutCompleteCallback: (() => void) | null = null;

    // Restore scroll position after layout completes (only during mode switch)
    const handleScrollAfterLayout = () => {
      if (!isModeSwitchingRef.current) {
        return;
      }

      const container = scrollContainerRef.current;
      if (!container) {
        isModeSwitchingRef.current = false;
        return;
      }

      const savedProgress = savedScrollProgressRef.current ?? 0;

      console.log('[DEBUG] Apply scroll after layout (mode switch):', {
        isVertical,
        savedProgress
      });

      const success = setScrollProgress({ container, isVertical }, savedProgress);

      // Update the saved position for auto-scroll prevention
      savedScrollPosRef.current = { left: container.scrollLeft, top: container.scrollTop };

      if (success) {
        console.log('[DEBUG] Scroll applied successfully');
      } else {
        console.log('[DEBUG] No scrollbar, skip scroll');
      }

      // Delay clearing the flag to allow scroll events from setScrollProgress to be processed
      requestAnimationFrame(() => {
        isModeSwitchingRef.current = false;
      });
    };
    
    // 設置排版完成回調
    onLayoutCompleteCallback = handleScrollAfterLayout;

    if (shouldAnimate) {
      // 変更前にフェードアウト
      editorDom.style.transition = 'opacity 0.15s ease-out';
      editorDom.style.opacity = '0';

      // DOMの準備とフェードアウト完了を待って適用
      const timer = setTimeout(() => {
        applyStyles(); // applyStyles 內部會在排版完成後調用 onLayoutCompleteCallback

        // 適用後にフェードイン
        requestAnimationFrame(() => {
          editorDom.style.transition = 'opacity 0.25s ease-in';
          editorDom.style.opacity = '1';
        });
      }, 150);

      return () => {
        clearTimeout(timer);
        onLayoutCompleteCallback = null;
      };
    } else {
      // アニメーションなしで即時適用
      applyStyles(); // applyStyles 內部會在排版完成後調用 onLayoutCompleteCallback
      editorDom.style.opacity = '1';
    }
  }, [charsPerLine, isVertical, fontFamily, fontScale, lineHeight, scrollContainerRef, get, savedScrollProgressRef, isModeSwitchingRef]);

  // 縦書き時: マウスホイールの縦スクロールを横スクロールへ変換する
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !isVertical) return;

    const handleWheel = (event: WheelEvent) => {
      let isTouchpad: boolean;

      if (verticalScrollBehavior === "trackpad") {
        isTouchpad = true;
      } else if (verticalScrollBehavior === "mouse") {
        isTouchpad = false;
      } else {
        // "auto": existing heuristic
        const hasBothAxes = Math.abs(event.deltaX) > 0 && Math.abs(event.deltaY) > 0;
        const hasFineGrainedValues =
          (Math.abs(event.deltaY) < 50 && Math.abs(event.deltaY) > 0) ||
          (Math.abs(event.deltaX) < 50 && Math.abs(event.deltaX) > 0);
        isTouchpad = hasBothAxes || (hasFineGrainedValues && !event.ctrlKey);
      }

      const sensitivity = scrollSensitivity;

      if (isTouchpad) {
        container.scrollLeft += event.deltaX * sensitivity;
        container.scrollTop += event.deltaY * sensitivity;
        event.preventDefault();
      } else {
        if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
          container.scrollLeft += event.deltaY * sensitivity;
          event.preventDefault();
        } else if (Math.abs(event.deltaX) > 0) {
          container.scrollTop += event.deltaX * sensitivity;
          event.preventDefault();
        }
      }
    };

    container.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      container.removeEventListener("wheel", handleWheel);
    };
  }, [isVertical, scrollContainerRef, verticalScrollBehavior, scrollSensitivity]);

  // 縦書きモード: ブラウザの自動スクロールを防止
  // テキスト選択、編集、モード切替時にブラウザが不正な位置にスクロールするのを防ぐ
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !isVertical) return;

    let userScrollTimer: ReturnType<typeof setTimeout> | null = null;
    let isReverting = false;

    // Initialize saved position
    savedScrollPosRef.current = { left: container.scrollLeft, top: container.scrollTop };

    const markUserScroll = () => {
      userScrollingRef.current = true;
      if (userScrollTimer) clearTimeout(userScrollTimer);
      userScrollTimer = setTimeout(() => {
        userScrollingRef.current = false;
      }, 200);
    };

    // Track user-initiated scroll sources
    const onWheel = () => markUserScroll();
    const onPointerDown = (e: PointerEvent) => {
      // Detect scrollbar drag (pointer down on the container itself, not on editor content)
      if (e.target === container) {
        markUserScroll();
      }
    };
    const onTouchStart = () => markUserScroll();

    // Intercept and revert browser auto-scrolls
    const onScroll = () => {
      if (isReverting) return;

      if (userScrollingRef.current || isModeSwitchingRef.current) {
        // User interaction or mode switch: save position
        savedScrollPosRef.current = { left: container.scrollLeft, top: container.scrollTop };
      } else {
        // Browser auto-scroll (e.g., selection change, DOM update): revert
        isReverting = true;
        container.scrollLeft = savedScrollPosRef.current.left;
        container.scrollTop = savedScrollPosRef.current.top;
        requestAnimationFrame(() => { isReverting = false; });
      }
    };

    container.addEventListener('wheel', onWheel, { passive: true });
    container.addEventListener('pointerdown', onPointerDown, { passive: true });
    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      container.removeEventListener('wheel', onWheel);
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('scroll', onScroll);
      if (userScrollTimer) clearTimeout(userScrollTimer);
    };
  }, [isVertical, scrollContainerRef, isModeSwitchingRef, savedScrollPosRef, userScrollingRef]);

  // BubbleMenu からの書式コマンドを処理する
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
            // 標準コマンドを使用（headingIdFixer がIDを付与する）
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
      console.error("書式コマンドの実行に失敗しました:", error);
    }
  };

  // Context menu actions
  const handleContextMenuAction = useCallback((action: ContextMenuAction) => {
    if (!editorViewInstance) return;

    switch (action) {
      case "cut":
        document.execCommand("cut");
        break;
      case "copy":
        document.execCommand("copy");
        break;
      case "paste":
        navigator.clipboard.readText().then((text) => {
          const { state, dispatch } = editorViewInstance;
          const { from } = state.selection;
          const transaction = state.tr.insertText(text, from);
          dispatch(transaction);
        }).catch((err) => {
          console.error("Failed to paste:", err);
        });
        break;
      case "paste-plaintext":
        navigator.clipboard.readText().then((text) => {
          // Strip formatting by using plain text
          const { state, dispatch } = editorViewInstance;
          const { from } = state.selection;
          const transaction = state.tr.insertText(text, from);
          dispatch(transaction);
        }).catch((err) => {
          console.error("Failed to paste plain text:", err);
        });
        break;
      case "find":
        // Trigger search dialog (you'll need to expose this functionality)
        // For now, we'll use the browser's default find
        document.execCommand("find");
        break;
      case "select-all": {
        const { state: st, dispatch: dp } = editorViewInstance;
        const allSelection = new AllSelection(st.doc);
        dp(st.tr.setSelection(allSelection));
        break;
      }
      case "ruby":
        onOpenRubyDialog?.();
        break;
      case "tcy":
        onToggleTcy?.();
        break;
      case "google-search": {
        const { state: gs } = editorViewInstance;
        const { from: gf, to: gt } = gs.selection;
        if (gf !== gt) {
          const text = gs.doc.textBetween(gf, gt);
          window.open(`https://www.google.com/search?q=${encodeURIComponent(text)}`, "_blank");
        }
        break;
      }
      case "dictionary": {
        const { state: ds } = editorViewInstance;
        const { from: df, to: dt } = ds.selection;
        const selectedText = df !== dt ? ds.doc.textBetween(df, dt) : undefined;
        onOpenDictionary?.(selectedText);
        break;
      }
      default:
        break;
    }
  }, [editorViewInstance, onOpenRubyDialog, onToggleTcy, onOpenDictionary]);

  // Electron: native OS context menu via IPC
  const handleElectronContextMenu = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    const items = [
      ...(hasSelection ? [
        { label: '切り取り', action: 'cut', accelerator: 'CmdOrCtrl+X' },
        { label: 'コピー', action: 'copy', accelerator: 'CmdOrCtrl+C' },
      ] : []),
      { label: '貼り付け', action: 'paste', accelerator: 'CmdOrCtrl+V' },
      { label: 'プレーンテキストとして貼り付け', action: 'paste-plaintext', accelerator: 'Shift+CmdOrCtrl+V' },
      { label: '-', action: '_separator' },
      ...(hasSelection ? [
        { label: 'ルビ', action: 'ruby', accelerator: 'Shift+CmdOrCtrl+R' },
        { label: '縦中横', action: 'tcy', accelerator: 'Shift+CmdOrCtrl+T' },
        { label: '-', action: '_separator' },
      ] : []),
      { label: '検索', action: 'find', accelerator: 'CmdOrCtrl+F' },
      ...(hasSelection ? [
        { label: 'Googleで検索', action: 'google-search' },
        { label: '辞書で調べる', action: 'dictionary' },
      ] : []),
      { label: '-', action: '_separator' },
      { label: 'すべて選択', action: 'select-all', accelerator: 'CmdOrCtrl+A' },
    ];
    const action = await window.electronAPI?.showContextMenu?.(items);
    if (action) handleContextMenuAction(action as ContextMenuAction);
  }, [hasSelection, handleContextMenuAction]);

  // Editor content wrapper - only use custom context menu on Web, native on Electron
  const editorContent = (
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
            font-family: "${fontFamily}", serif;
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
          /* Hardbreak indent spacer: align lines after shift+enter with first-line indent */
          div :global(.milkdown .ProseMirror .mdi-hardbreak-indent) {
            display: inline-block;
            width: ${textIndent}em;
          }
          div :global(.milkdown .ProseMirror.milkdown-japanese-horizontal p::before) {
            ${showParagraphNumbers ? `
              content: counter(paragraph);
              position: absolute;
              left: -2em;
              font-size: 0.7em;
              opacity: 0.5;
              color: currentColor;
              user-select: none;
              font-family: 'Fira Code', monospace;
            ` : 'content: none;'}
          }
          div :global(.milkdown .ProseMirror.milkdown-japanese-vertical p::before) {
            ${showParagraphNumbers ? `
              content: counter(paragraph);
              position: absolute;
              top: -2em;
              right: 0;
              font-size: 0.7em;
              opacity: 0.5;
              color: currentColor;
              user-select: none;
              font-family: 'Fira Code', monospace;
              writing-mode: horizontal-tb;
            ` : 'content: none;'}
          }
          /* 見出し・リスト・引用などには字下げを適用しない */
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
          /* 見出しも段落としてカウントするが番号は非表示 */
          div :global(.milkdown .ProseMirror h1),
          div :global(.milkdown .ProseMirror h2),
          div :global(.milkdown .ProseMirror h3),
          div :global(.milkdown .ProseMirror h4),
          div :global(.milkdown .ProseMirror h5),
          div :global(.milkdown .ProseMirror h6) {
            ${showParagraphNumbers ? 'counter-increment: paragraph;' : ''}
          }
        `}</style>
        <style jsx global>{`
          /* 初期表示は透明にし、レイアウト確定後にJSでフェードインする */
          .editor-content-area .milkdown .ProseMirror {
            opacity: 0;
          }
        `}</style>
        <Milkdown />
      </div>
  );

  return (
    <>
      {/* Use custom context menu only on Web, native context menu on Electron */}
      {!isElectron ? (
        <EditorContextMenu onAction={handleContextMenuAction} hasSelection={hasSelection}>
          {editorContent}
        </EditorContextMenu>
      ) : (
        <div onContextMenu={handleElectronContextMenu}>
          {editorContent}
        </div>
      )}
      {editorViewInstance && (
        <BubbleMenu editorView={editorViewInstance} onFormat={handleFormat} isVertical={isVertical} />
      )}
    </>
  );
}
