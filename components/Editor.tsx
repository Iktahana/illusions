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
import { linting } from "@/packages/milkdown-plugin-japanese-novel/linting-plugin";
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
import { localPreferences } from "@/lib/local-preferences";
import type { RuleRunner, LintIssue } from "@/lib/linting";
import { useLlmStatus } from "@/lib/hooks/use-llm-status";
import type { LlmStatusState } from "@/lib/hooks/use-llm-status";

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
  /** Ref that external code sets to true before programmatic scrolling */
  programmaticScrollRef?: React.RefObject<boolean>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onShowAllSearchResults?: (matches: any[], searchTerm: string) => void;
  // 品詞着色設定
  posHighlightEnabled?: boolean;
  posHighlightColors?: Record<string, string>;
  // リンティング設定
  lintingEnabled?: boolean;
  lintingRuleRunner?: RuleRunner | null;
  onLintIssuesUpdated?: (issues: LintIssue[], options?: { llmPending?: boolean }) => void;
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
  // 校正提示表示コールバック
  onShowLintHint?: (issue: LintIssue) => void;
  // 校正無視コールバック
  onIgnoreCorrection?: (issue: LintIssue, ignoreAll: boolean) => void;
  // Editor mode controls
  mdiExtensionsEnabled?: boolean;
  gfmEnabled?: boolean;
  // LLM status indicator
  llmEnabled?: boolean;
  llmModelId?: string;
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
  programmaticScrollRef,
  onShowAllSearchResults,
  posHighlightEnabled = false,
  posHighlightColors = {},
  lintingEnabled = false,
  lintingRuleRunner,
  onLintIssuesUpdated,
  verticalScrollBehavior = "auto",
  scrollSensitivity = 1.0,
  onOpenRubyDialog,
  onToggleTcy,
  onOpenDictionary,
  onShowLintHint,
  onIgnoreCorrection,
  onFontScaleChange,
  onLineHeightChange,
  onParagraphSpacingChange,
  mdiExtensionsEnabled = true,
  gfmEnabled = true,
  llmEnabled = false,
  llmModelId = "",
}: EditorProps) {
  // localStorage から同期的に初期値を読み込む（初回レンダリング前に反映、横→縦のフラッシュ防止）
  const [isVertical, setIsVertical] = useState(() => {
    if (typeof window === "undefined") return false;
    return localPreferences.getWritingMode() === "vertical";
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
    localPreferences.setWritingMode(isVertical ? 'vertical' : 'horizontal');
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

  const handleSearchOpen = useCallback(() => {
    setIsSearchOpen(true);
  }, []);

  // 親からのトリガーで検索ダイアログを開く（ショートカット）
  useEffect(() => {
    if (searchOpenTrigger > 0) {
      handleSearchOpen();
    }
  }, [searchOpenTrigger, handleSearchOpen]);

  // Save scroll progress (0-1) before mode switch
  const savedScrollProgressRef = useRef<number>(0);
  
  // Save current scroll progress on mode switch
  const handleToggleVertical = useCallback(() => {
    const container = scrollContainerRef.current;
    if (container) {
      // Get current progress via abstraction layer
      const progress = getScrollProgress({ container, isVertical });

      // Save progress
      savedScrollProgressRef.current = progress;

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
        llmEnabled={llmEnabled}
        llmModelId={llmModelId}
      />

      {/* エディタ領域 */}
      <div
        ref={scrollContainerRef}
        className="flex-1 bg-background-secondary relative min-h-0 pt-12"
        style={{
          overflowX: 'auto',
          overflowY: 'auto',
          // Disable browser scroll anchoring to prevent auto-scroll adjustment during DOM updates in vertical mode
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
              programmaticScrollRef={programmaticScrollRef}
              isModeSwitchingRef={isModeSwitchingRef}
              savedScrollProgressRef={savedScrollProgressRef}
              posHighlightEnabled={posHighlightEnabled}
              posHighlightColors={posHighlightColors}
              lintingEnabled={lintingEnabled}
              lintingRuleRunner={lintingRuleRunner}
              onLintIssuesUpdated={onLintIssuesUpdated}
              verticalScrollBehavior={verticalScrollBehavior}
              scrollSensitivity={scrollSensitivity}
              onOpenRubyDialog={onOpenRubyDialog}
              onToggleTcy={onToggleTcy}
              onOpenDictionary={onOpenDictionary}
              onShowLintHint={onShowLintHint}
              onIgnoreCorrection={onIgnoreCorrection}
              mdiExtensionsEnabled={mdiExtensionsEnabled}
              gfmEnabled={gfmEnabled}
              llmEnabled={llmEnabled}
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

const LLM_STATUS_LABELS: Record<LlmStatusState, string> = {
  off: "AI: 無効",
  loading: "AI: 読み込み中",
  ready: "AI: 準備完了",
  inferring: "AI: 推論中",
};

function LlmStatusDot({ status }: { status: LlmStatusState }) {
  const dotClass = clsx(
    "w-2.5 h-2.5 rounded-full shrink-0 transition-colors",
    {
      "bg-foreground-muted": status === "off",
      "bg-yellow-400": status === "loading",
      "bg-emerald-500": status === "ready",
      "bg-emerald-500 animate-llm-pulse": status === "inferring",
    },
  );

  return (
    <span title={LLM_STATUS_LABELS[status]} className="flex items-center">
      <span className={dotClass} />
    </span>
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
  llmEnabled = false,
  llmModelId = "",
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
  llmEnabled?: boolean;
  llmModelId?: string;
}) {
  const llmStatus = useLlmStatus(llmEnabled, llmModelId);
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
        {/* LLM status indicator */}
        <LlmStatusDot status={llmStatus} />

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
  programmaticScrollRef,
  showParagraphNumbers,
  isModeSwitchingRef,
  savedScrollProgressRef,
  posHighlightEnabled,
  posHighlightColors,
  lintingEnabled,
  lintingRuleRunner,
  onLintIssuesUpdated,
  verticalScrollBehavior = "auto",
  scrollSensitivity = 1.0,
  onOpenRubyDialog,
  onToggleTcy,
  onOpenDictionary,
  onShowLintHint,
  onIgnoreCorrection,
  mdiExtensionsEnabled = true,
  gfmEnabled = true,
  llmEnabled = false,
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
  programmaticScrollRef?: React.RefObject<boolean>;
  showParagraphNumbers: boolean;
  isModeSwitchingRef: MutableRefObject<boolean>;
  savedScrollProgressRef: RefObject<number>;
  posHighlightEnabled?: boolean;
  posHighlightColors?: Record<string, string>;
  lintingEnabled?: boolean;
  lintingRuleRunner?: RuleRunner | null;
  onLintIssuesUpdated?: (issues: LintIssue[], options?: { llmPending?: boolean }) => void;
  verticalScrollBehavior?: "auto" | "mouse" | "trackpad";
  scrollSensitivity?: number;
  onOpenRubyDialog?: () => void;
  onToggleTcy?: () => void;
  llmEnabled?: boolean;
  onOpenDictionary?: (searchTerm?: string) => void;
  onShowLintHint?: (issue: LintIssue) => void;
  onIgnoreCorrection?: (issue: LintIssue, ignoreAll: boolean) => void;
  mdiExtensionsEnabled?: boolean;
  gfmEnabled?: boolean;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [editorViewInstance, setEditorViewInstance] = useState<EditorView | null>(null);
  const [hasSelection, setHasSelection] = useState(false);
  const [lintIssueAtCursor, setLintIssueAtCursor] = useState<LintIssue | null>(null);
  const isElectron = typeof window !== "undefined" && isElectronRenderer();
  // 初期内容はマウント時に固定（ファイル切り替えでコンポーネントが再マウントされたときだけ変わる）
  const initialContentRef = useRef<string>(initialContent);
  const onChangeRef = useRef(onChange);
  const onInsertTextRef = useRef(onInsertText);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const onLintIssuesUpdatedRef = useRef(onLintIssuesUpdated);

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

  useEffect(() => {
    onLintIssuesUpdatedRef.current = onLintIssuesUpdated;
  }, [onLintIssuesUpdated]);

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
    let editor = Editor.make()
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
      .use(commonmark);

    // GFM: conditionally loaded
    if (gfmEnabled) {
      editor = editor.use(gfm);
    }

    // MDI extensions: conditionally loaded
    editor = editor.use(japaneseNovel({
      isVertical,
      showManuscriptLine: false,
      enableRuby: mdiExtensionsEnabled,
      enableTcy: mdiExtensionsEnabled,
    }));

    editor = editor
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
      }))
      .use(linting({
        enabled: false, // 初期化時は無効、後で動的に更新
        debounceMs: 500,
        onIssuesUpdated: (issues, options) => onLintIssuesUpdatedRef.current?.(issues, options),
      }));

    return editor;
  }, [isVertical, verticalScrollPlugin, mdiExtensionsEnabled, gfmEnabled]);

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

  // linting 設定を動的に更新（Editor を再作成せずに）
  useEffect(() => {
    if (!editorViewInstance) return;

    import('@/packages/milkdown-plugin-japanese-novel/linting-plugin').then(({ updateLintingSettings }) => {
      updateLintingSettings(
        editorViewInstance,
        {
          enabled: lintingEnabled,
          ruleRunner: lintingRuleRunner,
          llmEnabled,
        },
        "rule-config-change",
      );
    }).catch(err => {
      console.error('[Editor] Failed to update linting settings:', err);
    });
  }, [editorViewInstance, lintingEnabled, lintingRuleRunner, llmEnabled]);

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

    const timers = new Set<ReturnType<typeof setTimeout>>();

    const scheduleUpdate = () => {
      const id = setTimeout(() => {
        timers.delete(id);
        updateSelectionCount();
      }, 10);
      timers.add(id);
    };

    editorDom.addEventListener("mouseup", scheduleUpdate);
    editorDom.addEventListener("keyup", scheduleUpdate);
    document.addEventListener("selectionchange", scheduleUpdate);

    // 初期値
    updateSelectionCount();

    return () => {
      editorDom.removeEventListener("mouseup", scheduleUpdate);
      editorDom.removeEventListener("keyup", scheduleUpdate);
      document.removeEventListener("selectionchange", scheduleUpdate);
      timers.forEach(clearTimeout);
      timers.clear();
    };
  }, [editorViewInstance]);

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
    const isFirstRender = isFirstRenderRef.current;
    const shouldAnimate = styleChanged && !isFirstRender;
    isFirstRenderRef.current = false;

    const applyStyles = () => {
      // writing-mode class toggle (atomic with style application)
      editorDom.classList.remove('milkdown-japanese-vertical', 'milkdown-japanese-horizontal');
      editorDom.classList.add(isVertical ? 'milkdown-japanese-vertical' : 'milkdown-japanese-horizontal');

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

          // Wait one more frame for layout to fully stabilize after writing-mode + minWidth change
          requestAnimationFrame(() => {
            onLayoutCompleteCallback?.();
          });
        });
      } else {
        // 横書きでは最小幅を解除
        editorDom.style.minWidth = '';

        // Wait one frame for layout to stabilize after writing-mode change
        requestAnimationFrame(() => {
          onLayoutCompleteCallback?.();
        });
      }
    };
    
    // Scroll handling callback after layout completes
    let onLayoutCompleteCallback: (() => void) | null = null;

    // Restore scroll position after layout completes (mode switch or first render)
    const handleScrollAfterLayout = () => {
      const container = scrollContainerRef.current;
      if (!container) {
        isModeSwitchingRef.current = false;
        return;
      }

      if (isModeSwitchingRef.current) {
        // Mode switch: restore saved progress
        const savedProgress = savedScrollProgressRef.current ?? 0;

        const success = setScrollProgress({ container, isVertical }, savedProgress);

        // Update the saved position for auto-scroll prevention
        savedScrollPosRef.current = { left: container.scrollLeft, top: container.scrollTop };

        // Delay clearing the flag with double rAF to outlast any browser auto-scroll or ProseMirror focus management
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            isModeSwitchingRef.current = false;
          });
        });
      } else if (isFirstRender && isVertical) {
        // First mount in vertical mode: scroll to start (rightmost position)
        setScrollProgress({ container, isVertical }, 0);
        savedScrollPosRef.current = { left: container.scrollLeft, top: container.scrollTop };
      }
    };
    
    // Set layout completion callback
    onLayoutCompleteCallback = handleScrollAfterLayout;

    if (shouldAnimate) {
      // 変更前にフェードアウト
      editorDom.style.transition = 'opacity 0.15s ease-out';
      editorDom.style.opacity = '0';

      // DOMの準備とフェードアウト完了を待って適用
      const timer = setTimeout(() => {
        applyStyles(); // applyStyles will call onLayoutCompleteCallback after layout completes

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
      applyStyles(); // applyStyles will call onLayoutCompleteCallback after layout completes
      editorDom.style.opacity = '1';
    }
  }, [charsPerLine, isVertical, fontFamily, fontScale, lineHeight, scrollContainerRef, get, savedScrollProgressRef, isModeSwitchingRef]);

  // 縦書き時: コンテンツサイズ変更時に minWidth を再計算し、スクロール範囲を更新する
  useEffect(() => {
    if (!isVertical) return;

    const container = scrollContainerRef.current;
    const editorContainer = editorRef.current;
    const editorDom = editorContainer?.querySelector('.milkdown .ProseMirror') as HTMLElement;
    if (!container || !editorDom) return;

    const observer = new ResizeObserver(() => {
      const containerWidth = container.clientWidth;
      const padding = 128; // 64px * 2
      const minWidth = containerWidth - padding;
      editorDom.style.minWidth = `${minWidth}px`;
    });

    observer.observe(editorDom);

    return () => {
      observer.disconnect();
    };
  }, [isVertical, scrollContainerRef]);

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

  // Auto-scroll prevention for both modes
  // Prevents browser from overriding scroll position during text selection, editing, and mode switches
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    let userScrollTimer: ReturnType<typeof setTimeout> | null = null;
    let isReverting = false;
    let isPointerDown = false; // マウスドラッグ中（テキスト選択中）のフラグ

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
    const onPointerDown = () => {
      // マウスボタンが押されている間はドラッグ選択の可能性がある
      isPointerDown = true;
    };
    const onPointerUp = () => {
      isPointerDown = false;
    };
    const onTouchStart = () => markUserScroll();

    // Intercept and revert browser auto-scrolls
    const onScroll = () => {
      if (isReverting) return;

      if (userScrollingRef.current || isModeSwitchingRef.current || isPointerDown || programmaticScrollRef?.current) {
        // User interaction, mode switch, mouse drag, or programmatic navigation: save position
        savedScrollPosRef.current = { left: container.scrollLeft, top: container.scrollTop };
      } else {
        // Browser auto-scroll (e.g., DOM update): revert
        isReverting = true;
        container.scrollLeft = savedScrollPosRef.current.left;
        container.scrollTop = savedScrollPosRef.current.top;
        requestAnimationFrame(() => { isReverting = false; });
      }
    };

    container.addEventListener('wheel', onWheel, { passive: true });
    container.addEventListener('pointerdown', onPointerDown, { passive: true });
    document.addEventListener('pointerup', onPointerUp);
    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      container.removeEventListener('wheel', onWheel);
      container.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('pointerup', onPointerUp);
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

  // Detect lint issue at a given mouse position via DOM attribute
  const getLintIssueAtCoords = useCallback((x: number, y: number): LintIssue | null => {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const lintEl = el.closest('[data-lint-issue]');
    if (!lintEl) return null;
    const issueJson = lintEl.getAttribute('data-lint-issue');
    if (!issueJson) return null;
    try { return JSON.parse(issueJson); } catch { return null; }
  }, []);

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
          const { from, to } = state.selection;
          const transaction = state.tr.insertText(text, from, to);
          dispatch(transaction);
        }).catch((err) => {
          console.error("Failed to paste:", err);
        });
        break;
      case "paste-plaintext":
        navigator.clipboard.readText().then((text) => {
          // Strip formatting by using plain text
          const { state, dispatch } = editorViewInstance;
          const { from, to } = state.selection;
          const transaction = state.tr.insertText(text, from, to);
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
      case "show-lint-hint":
        if (lintIssueAtCursor) {
          onShowLintHint?.(lintIssueAtCursor);
        }
        break;
      case "ignore-correction":
        if (lintIssueAtCursor) {
          onIgnoreCorrection?.(lintIssueAtCursor, false);
        }
        break;
      case "ignore-correction-all":
        if (lintIssueAtCursor) {
          onIgnoreCorrection?.(lintIssueAtCursor, true);
        }
        break;
      default:
        break;
    }
  }, [editorViewInstance, onOpenRubyDialog, onToggleTcy, onOpenDictionary, lintIssueAtCursor, onShowLintHint, onIgnoreCorrection]);

  // Electron: native OS context menu via IPC
  const handleElectronContextMenu = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    const issue = getLintIssueAtCoords(e.clientX, e.clientY);
    setLintIssueAtCursor(issue);
    const items = [
      ...(issue ? [
        { label: '校正提示を表示', action: 'show-lint-hint' },
        { label: 'この指摘を無視', action: 'ignore-correction' },
        { label: '同じ指摘をすべて無視', action: 'ignore-correction-all' },
        { label: '-', action: '_separator' },
      ] : []),
      ...(hasSelection ? [
        { label: '切り取り', action: 'cut', accelerator: 'CmdOrCtrl+X' },
        { label: 'コピー', action: 'copy', accelerator: 'CmdOrCtrl+C' },
      ] : []),
      { label: '貼り付け', action: 'paste', accelerator: 'CmdOrCtrl+V' },
      { label: 'プレーンテキストとして貼り付け', action: 'paste-plaintext', accelerator: 'Shift+CmdOrCtrl+V' },
      { label: '-', action: '_separator' },
      ...(hasSelection && mdiExtensionsEnabled ? [
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
  }, [hasSelection, handleContextMenuAction, mdiExtensionsEnabled, getLintIssueAtCoords]);

  // Left-click on lint decoration → auto-switch to corrections tab
  const handleEditorClick = useCallback((e: React.MouseEvent) => {
    const issue = getLintIssueAtCoords(e.clientX, e.clientY);
    if (issue) {
      onShowLintHint?.(issue);
    }
  }, [getLintIssueAtCoords, onShowLintHint]);

  // Editor content wrapper - only use custom context menu on Web, native on Electron
  const editorContent = (
    <div
      ref={editorRef}
      onClick={handleEditorClick}
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
        <EditorContextMenu
          onAction={handleContextMenuAction}
          hasSelection={hasSelection}
          lintIssueAtCursor={lintIssueAtCursor}
          onContextMenuOpen={(e) => setLintIssueAtCursor(getLintIssueAtCoords(e.clientX, e.clientY))}
        >
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
