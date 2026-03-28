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
import { Milkdown, useEditor } from "@milkdown/react";
import { japaneseNovel } from "@/packages/milkdown-plugin-japanese-novel";
import {
  setScrollProgress,
} from "@/packages/milkdown-plugin-japanese-novel/scroll-progress";
import { posHighlight } from "@/packages/milkdown-plugin-japanese-novel/pos-highlight";
import { linting } from "@/packages/milkdown-plugin-japanese-novel/linting-plugin";
import clsx from "clsx";
import { EditorView } from "@milkdown/prose/view";
import { AllSelection, Plugin, PluginKey } from "@milkdown/prose/state";
import { $prose } from "@milkdown/utils";
import BubbleMenu, { type FormatType } from "../BubbleMenu";
import { searchHighlightPlugin } from "@/lib/editor-page/search-highlight-plugin";
import { speechHighlightPlugin } from "@/lib/editor-page/speech-highlight-plugin";
import EditorContextMenu, { type ContextMenuAction } from "../EditorContextMenu";
import { isElectronRenderer } from "@/lib/utils/runtime-env";
import type { RuleRunner, LintIssue } from "@/lib/linting";
import {
  useTypographySettings,
  useLintingSettings,
  useLlmSettings,
  usePosHighlightSettings,
  useScrollSettings,
} from "@/contexts/EditorSettingsContext";

interface MilkdownEditorProps {
  initialContent: string;
  onChange?: (content: string) => void;
  onInsertText?: (text: string) => void;
  onSelectionChange?: (charCount: number) => void;
  isVertical: boolean;
  scrollContainerRef: RefObject<HTMLDivElement>;
  onEditorViewReady?: (view: EditorView) => void;
  programmaticScrollRef?: React.MutableRefObject<boolean>;
  isModeSwitchingRef: MutableRefObject<boolean>;
  savedScrollProgressRef: RefObject<number>;
  lintingRuleRunner?: RuleRunner | null;
  onLintIssuesUpdated?: (issues: LintIssue[], options?: { llmPending?: boolean }) => void;
  onNlpError?: (error: Error) => void;
  onOpenRubyDialog?: () => void;
  onToggleTcy?: () => void;
  onOpenDictionary?: (searchTerm?: string) => void;
  onOpenSearch?: () => void;
  onShowLintHint?: (issue: LintIssue) => void;
  onIgnoreCorrection?: (issue: LintIssue, ignoreAll: boolean) => void;
  mdiExtensionsEnabled?: boolean;
  gfmEnabled?: boolean;
}

export default function MilkdownEditor({
  initialContent,
  onChange,
  onInsertText,
  onSelectionChange,
  isVertical,
  scrollContainerRef,
  onEditorViewReady,
  programmaticScrollRef,
  isModeSwitchingRef,
  savedScrollProgressRef,
  lintingRuleRunner,
  onLintIssuesUpdated,
  onNlpError,
  onOpenRubyDialog,
  onToggleTcy,
  onOpenDictionary,
  onOpenSearch,
  onShowLintHint,
  onIgnoreCorrection,
  mdiExtensionsEnabled = true,
  gfmEnabled = true,
}: MilkdownEditorProps) {
  const {
    fontScale, lineHeight, paragraphSpacing, textIndent, fontFamily,
    charsPerLine, showParagraphNumbers,
  } = useTypographySettings();
  const { lintingEnabled } = useLintingSettings();
  const { llmEnabled } = useLlmSettings();
  const { posHighlightEnabled, posHighlightColors } = usePosHighlightSettings();
  const { verticalScrollBehavior, scrollSensitivity } = useScrollSettings();
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
  const onNlpErrorRef = useRef(onNlpError);

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

  useEffect(() => {
    onNlpErrorRef.current = onNlpError;
  }, [onNlpError]);

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
      .use($prose(() => speechHighlightPlugin))
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
        onNlpError: (error) => onNlpErrorRef.current?.(error),
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
          // Prevent browser caret-scroll on .ProseMirror itself (contenteditable + fixed height
          // makes it implicitly scrollable in vertical-rl). clip prevents scrolling without
          // creating a new formatting context, so layout is unaffected.
          editorDom.style.overflow = 'clip';
        } else {
          // 横書き: 幅を制限（1行あたりの文字数）し、中央寄せ
          const targetWidth = charSize * charsPerLine;
          editorDom.style.width = `${targetWidth}px`;
          editorDom.style.maxWidth = `${targetWidth}px`;
          editorDom.style.margin = '0 auto'; // 中央寄せ
          editorDom.style.overflow = '';
        }
      }

      // 縦書き: コンテナ幅を埋める最小幅を設定し、短文でも右側に寄り切るのを防ぐ
      if (isVertical && scrollContainerRef.current) {
        // DOM更新後に計算する
        requestAnimationFrame(() => {
          const container = scrollContainerRef.current;
          if (!container) return;

          const containerWidth = container.clientWidth;
          // clientWidth includes scroll container's own padding (64px * 2)
          const padding = 128;
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

        setScrollProgress({ container, isVertical }, savedProgress);

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
      const padding = 128; // scroll container's own padding (64px * 2)
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

      if (userScrollingRef.current || isModeSwitchingRef.current || programmaticScrollRef?.current) {
        // User interaction, mode switch, or programmatic navigation: save position
        savedScrollPosRef.current = { left: container.scrollLeft, top: container.scrollTop };
      } else if (isPointerDown && isVertical) {
        // Mouse drag (text selection) in vertical-rl: browser may fire native caret-scroll-into-view
        // which computes wrong positions. Detect large jumps and revert them.
        // Only applies to vertical mode — horizontal selection scrolls are legitimate.
        const dx = Math.abs(container.scrollLeft - savedScrollPosRef.current.left);
        const dy = Math.abs(container.scrollTop - savedScrollPosRef.current.top);
        if (dx > 50 || dy > 50) {
          // Large jump → browser auto-scroll in vertical-rl, revert
          isReverting = true;
          container.scrollLeft = savedScrollPosRef.current.left;
          container.scrollTop = savedScrollPosRef.current.top;
          requestAnimationFrame(() => { isReverting = false; });
        } else {
          // Small movement → legitimate edge-drag scroll, allow
          savedScrollPosRef.current = { left: container.scrollLeft, top: container.scrollTop };
        }
      } else if (isPointerDown) {
        // Horizontal mode pointer drag: save position normally
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
        onOpenSearch?.();
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
  }, [editorViewInstance, onOpenRubyDialog, onToggleTcy, onOpenDictionary, onOpenSearch, lintIssueAtCursor, onShowLintHint, onIgnoreCorrection]);

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
          ? "py-8 min-w-fit"
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
          overflow: 'clip' as const, // Prevent browser caret-scroll on intermediate elements
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
