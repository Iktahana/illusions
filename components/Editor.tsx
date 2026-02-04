"use client";

import { RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Plugin, PluginKey } from "@milkdown/prose/state";
import { $prose } from "@milkdown/utils";
import BubbleMenu, { type FormatType } from "./BubbleMenu";
import SearchDialog from "./SearchDialog";
import SelectionCounter from "./SelectionCounter";
import { searchHighlightPlugin } from "@/lib/search-highlight-plugin";

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
  searchOpenTrigger?: number;
  showParagraphNumbers?: boolean;
  onEditorViewReady?: (view: EditorView) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onShowAllSearchResults?: (matches: any[], searchTerm: string) => void;
  // 品詞着色設定
  posHighlightEnabled?: boolean;
  posHighlightColors?: Record<string, string>;
}

export default function NovelEditor({
  initialContent = "",
  onChange,
  onInsertText,
  onSelectionChange,
  className,
  fontScale = 100,
  lineHeight = 1.8,
  paragraphSpacing = 0,
  textIndent = 1,
  fontFamily = 'Noto Serif JP',
  charsPerLine = 40,
  searchOpenTrigger = 0,
  showParagraphNumbers = false,
  onEditorViewReady,
  onShowAllSearchResults,
  posHighlightEnabled = false,
  posHighlightColors = {},
}: EditorProps) {
  // ハイドレーション不整合を避けるため、初期値は false にする
  const [isVertical, setIsVertical] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [editorViewInstance, setEditorViewInstance] = useState<EditorView | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  // 模式切換時保持滾動位置：保存目標滾動進度（0-1）
  const [targetScrollProgress, setTargetScrollProgress] = useState<number | null>(null);

  // マウント後に localStorage から読み込む（クライアントのみ）
  useEffect(() => {
    setIsMounted(true);
    const saved = localStorage.getItem('illusions-writing-mode');
    if (saved === 'vertical') {
      setIsVertical(true);
    }
  }, []);

  // 変更時に縦書き状態を localStorage に保存する
  useEffect(() => {
    if (!isMounted) return;
    localStorage.setItem('illusions-writing-mode', isVertical ? 'vertical' : 'horizontal');
  }, [isVertical, isMounted]);

  // 注意：不再需要這個 effect，因為：
  // 1. 新文件打開時，父組件會通過 key 屬性重新掛載整個 NovelEditor 組件
  // 2. 編輯內容時，initialContent 會改變，但我們不應該重置滾動位置
  // 3. 模式切換時，handleToggleVertical 會負責保存和恢復滾動位置
  // 
  // 如果將來需要在不重新掛載的情況下切換文件，可以添加一個明確的 fileId prop 來追蹤

  const handleSearchOpen = () => {
    setIsSearchOpen(true);
  };

  // 親からのトリガーで検索ダイアログを開く（ショートカット）
  useEffect(() => {
    if (searchOpenTrigger > 0) {
      handleSearchOpen();
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
      
      // 標記需要恢復滾動位置
      setTargetScrollProgress(0.5); // 使用任意非null值觸發滾動邏輯
    }
    
    setIsVertical(!isVertical);
  }, [isVertical, scrollContainerRef]);

  // 滾動恢復完成後的回調
  const handleScrollRestored = useCallback(() => {
    setTargetScrollProgress(null);
  }, []);

  return (
    <div className={clsx("flex flex-col h-full min-h-0 relative", className)}>
      {/* ツールバー */}
      <EditorToolbar
        isVertical={isVertical}
        onToggleVertical={handleToggleVertical}
        fontScale={fontScale}
        lineHeight={lineHeight}
        onSearchClick={handleSearchOpen}
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
              targetScrollProgress={targetScrollProgress}
              onScrollRestored={handleScrollRestored}
              savedScrollProgressRef={savedScrollProgressRef}
              posHighlightEnabled={posHighlightEnabled}
              posHighlightColors={posHighlightColors}
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
        {/* 縦書き/横書き */}
         <button
           onClick={onToggleVertical}
           className="flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium bg-accent text-accent-foreground hover:bg-accent-hover transition-colors"
         >
           <Type className="w-4 h-4" />
           {isVertical ? "縦書き" : "横書き"}
         </button>

        {/* 現在の設定 */}
        <div className="flex items-center gap-2 text-xs text-foreground-secondary">
          <AlignLeft className="w-4 h-4 text-foreground-tertiary" />
          <span>{fontScale}% / {lineHeight.toFixed(1)}</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="text-xs text-foreground-tertiary">
          Illusionsはあなたの作品の無断保存およびAI学習への利用は行いません
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
  targetScrollProgress,
  onScrollRestored,
  savedScrollProgressRef,
  posHighlightEnabled,
  posHighlightColors,
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
  targetScrollProgress?: number | null;
  onScrollRestored?: () => void;
  savedScrollProgressRef: RefObject<number>;
  posHighlightEnabled?: boolean;
  posHighlightColors?: Record<string, string>;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [editorViewInstance, setEditorViewInstance] = useState<EditorView | null>(null);
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

  // 縦書き用のスクロール制御プラグインを作成
  // isVertical の参照を保持
  const isVerticalRef = useRef(isVertical);
  const shouldScrollToHeadRef = useRef(false); // 排版完成後にスクロールするかどうか
  
  // isVertical の変更を追跡（変更のみ、スクロールフラグは設定しない）
  useEffect(() => {
    isVerticalRef.current = isVertical;
  }, [isVertical]);
  
  // targetScrollProgress が設定されたらスクロールフラグを立てる
  useEffect(() => {
    if (targetScrollProgress !== null && targetScrollProgress !== undefined) {
      shouldScrollToHeadRef.current = true;
    }
  }, [targetScrollProgress]);
  
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
        onSelectionChangeRef.current?.(0);
        return;
      }

      // 選択文字列の文字数を数える（空白は除外）
      const selectedText = state.doc.textBetween(from, to);
      const count = selectedText.replace(/\s/g, "").length;
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
          const targetHeight = charSize * charsPerLine;
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

    // 滾動處理函數：在排版完成後執行
    // 注意：只有在「模式切換」時才需要恢復滾動位置
    const handleScrollAfterLayout = () => {
      // 檢查是否真的需要滾動恢復（只有模式切換時會設置這個標記）
      if (!shouldScrollToHeadRef.current) {
        // 正常情況：編輯內容時不需要恢復滾動
        return;
      }
      
      const container = scrollContainerRef.current;
      if (!container) {
        console.debug('[DEBUG] handleScrollAfterLayout: skip (no container)');
        shouldScrollToHeadRef.current = false;
        return;
      }
      
      // 只有在 targetScrollProgress 被明確設置為 0.5（模式切換觸發值）時才執行滾動
      if (targetScrollProgress !== 0.5) {
        console.debug('[DEBUG] handleScrollAfterLayout: skip (not mode switch)', { targetScrollProgress });
        shouldScrollToHeadRef.current = false;
        onScrollRestored?.();
        return;
      }
      
      const savedProgress = savedScrollProgressRef.current ?? 0;
      
      console.log('[DEBUG] Apply scroll after layout (mode switch):', {
        isVertical,
        savedProgress
      });
      
      // 使用保存的進度設置滾動位置
      const success = setScrollProgress({ container, isVertical }, savedProgress);
      
      if (success) {
        console.log('[DEBUG] Scroll applied successfully');
      } else {
        console.log('[DEBUG] No scrollbar, skip scroll');
      }
      
      shouldScrollToHeadRef.current = false;
      onScrollRestored?.();
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
  }, [charsPerLine, isVertical, fontFamily, fontScale, lineHeight, scrollContainerRef, get, targetScrollProgress, onScrollRestored, savedScrollProgressRef]);

  // 縦書き時: マウスホイールの縦スクロールを横スクロールへ変換する
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !isVertical) return;

    const handleWheel = (event: WheelEvent) => {
      // トラックパッド判定:
      // 1) deltaX と deltaY の両方が出る（2Dスクロール）
      // 2) 値が細かい（100/-100のように粗くない）
      // 3) ctrlKey が押されていない（ピンチズーム除外）
      const hasBothAxes = Math.abs(event.deltaX) > 0 && Math.abs(event.deltaY) > 0;
      const hasFineGrainedValues = 
        (Math.abs(event.deltaY) < 50 && Math.abs(event.deltaY) > 0) ||
        (Math.abs(event.deltaX) < 50 && Math.abs(event.deltaX) > 0);
      const isTouchpad = hasBothAxes || (hasFineGrainedValues && !event.ctrlKey);

      if (isTouchpad) {
        // トラックパッド: 自然なスクロールを維持
        const beforeLeft = container.scrollLeft;
        const beforeTop = container.scrollTop;
        container.scrollLeft += event.deltaX;
        container.scrollTop += event.deltaY;
        console.debug('[AutoScroll] touchpad scroll', {
          beforeLeft,
          deltaX: event.deltaX,
          afterLeft: container.scrollLeft,
          beforeTop,
          deltaY: event.deltaY,
          afterTop: container.scrollTop,
        });
        event.preventDefault();
      } else {
        // マウスホイール:
        // - 縦回転（deltaY）→ 横スクロール（縦書きの読み進め方向）
        // - 横回転（deltaX）→ 縦スクロール
        // 横/縦のスクロール量を補正しつつ、操作を追跡ログを出す
        if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
          // 縦回転 → 横スクロール
          const beforeLeft = container.scrollLeft;
          container.scrollLeft += event.deltaY;
          console.debug('[AutoScroll] wheel vertical-scroll (deltaY)', {
            beforeLeft,
            deltaY: event.deltaY,
            afterLeft: container.scrollLeft,
          });
          event.preventDefault();
        } else if (Math.abs(event.deltaX) > 0) {
          // 横回転 → 縦スクロール
          const beforeTop = container.scrollTop;
          container.scrollTop += event.deltaX;
          console.debug('[AutoScroll] wheel horizontal-scroll (deltaX)', {
            beforeTop,
            deltaX: event.deltaX,
            afterTop: container.scrollTop,
          });
          event.preventDefault();
        }
      }
    };

    container.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      container.removeEventListener("wheel", handleWheel);
    };
  }, [isVertical, scrollContainerRef]);

  // 【調試用】監聽所有 scroll 事件，追蹤滾動來源
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !isVertical) return;

    let lastScrollLeft = container.scrollLeft;
    let lastScrollTop = container.scrollTop;

    const handleScroll = () => {
      const currentScrollLeft = container.scrollLeft;
      const currentScrollTop = container.scrollTop;
      
      // 只有在滾動位置有明顯變化時才輸出日誌（避免太多噪音）
      const deltaLeft = Math.abs(currentScrollLeft - lastScrollLeft);
      const deltaTop = Math.abs(currentScrollTop - lastScrollTop);
      
      if (deltaLeft > 10 || deltaTop > 10) {
        console.debug('[AutoScroll] scroll event detected', {
          beforeLeft: lastScrollLeft,
          afterLeft: currentScrollLeft,
          deltaLeft,
          beforeTop: lastScrollTop,
          afterTop: currentScrollTop,
          deltaTop,
          // 嘗試獲取調用堆棧
          stack: new Error().stack?.split('\n').slice(1, 5).join('\n')
        });
      }
      
      lastScrollLeft = currentScrollLeft;
      lastScrollTop = currentScrollTop;
    };

    container.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, [isVertical, scrollContainerRef]);

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
        `}</style>
        <style jsx global>{`
          /* 初期表示は透明にし、レイアウト確定後にJSでフェードインする */
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
