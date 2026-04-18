"use client";

import { RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { commandsCtx, Editor, rootCtx, defaultValueCtx, editorViewCtx } from "@milkdown/core";
import { nord } from "@milkdown/theme-nord";
import {
  commonmark,
  toggleEmphasisCommand,
  toggleStrongCommand,
  toggleInlineCodeCommand,
  wrapInHeadingCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInOrderedListCommand,
} from "@milkdown/preset-commonmark";
import { gfm, toggleStrikethroughCommand } from "@milkdown/preset-gfm";
import { listener, listenerCtx } from "@milkdown/plugin-listener";
import { history } from "@milkdown/plugin-history";
import { clipboard } from "@milkdown/plugin-clipboard";
import { cursor } from "@milkdown/plugin-cursor";
import { Milkdown, useEditor } from "@milkdown/react";
import { japaneseNovel } from "@/packages/milkdown-plugin-japanese-novel";
import { posHighlight } from "@/packages/milkdown-plugin-japanese-novel/pos-highlight";
import { linting } from "@/packages/milkdown-plugin-japanese-novel/linting-plugin";
import clsx from "clsx";
import { EditorView } from "@milkdown/prose/view";
import { AllSelection, Plugin, PluginKey } from "@milkdown/prose/state";
import { $prose, $remark, replaceAll } from "@milkdown/utils";
import { remarkPlainTextPlugin } from "@/packages/milkdown-plugin-japanese-novel/syntax/remark-plain-text";
import BubbleMenu, { type FormatType } from "../BubbleMenu";
import { searchHighlightPlugin } from "@/lib/editor-page/search-highlight-plugin";
import { speechHighlightPlugin } from "@/lib/editor-page/speech-highlight-plugin";
import type { EditorSelectionState } from "@/lib/editor-page/use-selection-tracking";
import EditorContextMenu, { type ContextMenuAction } from "../EditorContextMenu";
import { isElectronRenderer } from "@/lib/utils/runtime-env";
import { useCharWidth, MEASURE_TEXT } from "@/lib/editor-page/use-char-width";
import {
  getScrollProgress,
  setScrollProgress,
} from "@/packages/milkdown-plugin-japanese-novel/scroll-progress";
import type { RuleRunner, LintIssue } from "@/lib/linting";
import {
  useTypographySettings,
  useLintingSettings,
  usePosHighlightSettings,
  useScrollSettings,
} from "@/contexts/EditorSettingsContext";

interface MilkdownEditorProps {
  initialContent: string;
  onChange?: (content: string) => void;
  onInsertText?: (text: string) => void;
  selectionState: EditorSelectionState;
  isVertical: boolean;
  scrollContainerRef: RefObject<HTMLDivElement>;
  onEditorViewReady?: (view: EditorView) => void;
  lintingRuleRunner?: RuleRunner | null;
  onLintIssuesUpdated?: (issues: LintIssue[]) => void;
  onNlpError?: (error: Error) => void;
  onOpenRubyDialog?: () => void;
  onToggleTcy?: () => void;
  onOpenDictionary?: (searchTerm?: string) => void;
  onShowLintHint?: (issue: LintIssue) => void;
  onIgnoreCorrection?: (issue: LintIssue, ignoreAll: boolean) => void;
  mdiExtensionsEnabled?: boolean;
  gfmEnabled?: boolean;
  onStartSpeech?: () => void;
  /** Called when the user triggers "検索" from the context menu. Receives selected text as initial search term. */
  onFind?: (initialTerm?: string) => void;
  /** Per-pane override for charsPerLine (used by auto mode to avoid global state conflicts in split editors) */
  overrideCharsPerLine?: number;
  /** External content to apply to the editor (from file watcher). Best-effort scroll position preservation. */
  externalContent?: string | null;
  /** Called after externalContent has been applied and scroll restored (best-effort). */
  onExternalContentApplied?: () => void;
  /** Called after layout reflow completes (style application + browser paint). */
  onLayoutReady?: () => void;
}

export default function MilkdownEditor({
  initialContent,
  onChange,
  onInsertText,
  selectionState,
  isVertical,
  scrollContainerRef,
  onEditorViewReady,
  lintingRuleRunner,
  onLintIssuesUpdated,
  onNlpError,
  onOpenRubyDialog,
  onToggleTcy,
  onOpenDictionary,
  onShowLintHint,
  onIgnoreCorrection,
  mdiExtensionsEnabled = true,
  gfmEnabled = true,
  onStartSpeech,
  onFind,
  overrideCharsPerLine,
  externalContent,
  onExternalContentApplied,
  onLayoutReady,
}: MilkdownEditorProps) {
  const {
    fontScale,
    lineHeight,
    paragraphSpacing,
    textIndent,
    fontFamily,
    charsPerLine: contextCharsPerLine,
    showParagraphNumbers,
  } = useTypographySettings();
  const charsPerLine = overrideCharsPerLine ?? contextCharsPerLine;
  const { lintingEnabled } = useLintingSettings();
  const { posHighlightEnabled, posHighlightColors, posHighlightDisabledTypes } =
    usePosHighlightSettings();
  const { verticalScrollBehavior, scrollSensitivity } = useScrollSettings();
  const { measureRef: charMeasureRef, charWidth } = useCharWidth({
    fontFamily,
    fontScale,
    lineHeight,
    isVertical,
  });
  const editorRef = useRef<HTMLDivElement>(null);
  const measureBoxRef = useRef<HTMLDivElement>(null);
  const [editorViewInstance, setEditorViewInstance] = useState<EditorView | null>(null);
  const [lintIssueAtCursor, setLintIssueAtCursor] = useState<LintIssue | null>(null);
  const isElectron = typeof window !== "undefined" && isElectronRenderer();
  // 初期内容はマウント時に固定（ファイル切り替えでコンポーネントが再マウントされたときだけ変わる）
  const initialContentRef = useRef<string>(initialContent);
  const onChangeRef = useRef(onChange);
  const onInsertTextRef = useRef(onInsertText);
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
    onLintIssuesUpdatedRef.current = onLintIssuesUpdated;
  }, [onLintIssuesUpdated]);

  useEffect(() => {
    onNlpErrorRef.current = onNlpError;
  }, [onNlpError]);

  // 縦書き用のスクロール制御プラグインを作成
  const isVerticalRef = useRef(isVertical);
  useEffect(() => {
    isVerticalRef.current = isVertical;
  }, [isVertical]);

  // 縦書き時は handleScrollToSelection を抑制（ユーザーが手動でスクロールする）
  const verticalScrollPlugin = useMemo(
    () =>
      $prose(
        () =>
          new Plugin({
            key: new PluginKey("verticalScrollControl"),
            props: {
              handleScrollToSelection() {
                if (isVerticalRef.current) {
                  return true; // デフォルトのスクロールを完全に禁止
                }
                return false;
              },
            },
          }),
      ),
    [],
  );

  // Derive plain-text mode: fileType ".txt" has both GFM and MDI disabled.
  // This value is captured at editor mount time, which is safe because each
  // tab has its own editor instance (keyed by bufferId+editorKey) and a tab's
  // file type never changes during its lifetime.
  const isPlainText = !gfmEnabled && !mdiExtensionsEnabled;

  const { get } = useEditor(
    (root) => {
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
          // Plain-text (.txt) mode: extract raw text directly from ProseMirror
          // nodes so that tab.content stays as plain text without any markdown
          // escaping. Non-plain-text mode uses the standard markdown serializer.
          if (isPlainText) {
            ctx.get(listenerCtx).updated((_ctx, doc) => {
              const lines: string[] = [];
              doc.forEach((node) => {
                lines.push(node.textContent);
              });
              onChangeRef.current?.(lines.join("\n"));
            });
          } else {
            ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
              onChangeRef.current?.(markdown);
            });
          }
        })
        .use(commonmark);

      // GFM: conditionally loaded
      if (gfmEnabled) {
        editor = editor.use(gfm);
      }

      // Plain-text mode: remark plugin converts raw lines to paragraphs,
      // bypassing all CommonMark syntax interpretation.
      if (isPlainText) {
        editor = editor.use($remark("plainText", () => remarkPlainTextPlugin));
      }

      // MDI extensions: conditionally loaded
      // NOTE: enableNoBreak / enableKern are not explicitly passed here, so
      //   they default to `true` (always enabled, even in .md files).
      //   enableMdiBreak is explicitly gated on mdiExtensionsEnabled so that
      //   `[[br]]` is only active in .mdi files. Aligning nobreak/kern with
      //   the same gating is tracked separately.
      editor = editor.use(
        japaneseNovel({
          isVertical,
          showManuscriptLine: false,
          enableRuby: mdiExtensionsEnabled,
          enableTcy: mdiExtensionsEnabled,
          enableMdiBreak: mdiExtensionsEnabled,
        }),
      );

      editor = editor
        .use(history)
        .use(clipboard)
        .use(cursor)
        .use(verticalScrollPlugin)
        .use($prose(() => searchHighlightPlugin))
        .use($prose(() => speechHighlightPlugin))
        .use(
          posHighlight({
            enabled: false, // 初期化時は無効、後で動的に更新
            colors: {},
            dicPath: "/dict",
            debounceMs: 300,
          }),
        )
        .use(
          linting({
            enabled: false, // 初期化時は無効、後で動的に更新
            debounceMs: 500,
            onIssuesUpdated: (issues) => onLintIssuesUpdatedRef.current?.(issues),
            onNlpError: (error) => onNlpErrorRef.current?.(error),
          }),
        );

      return editor;
    },
    [isVertical, verticalScrollPlugin, mdiExtensionsEnabled, gfmEnabled],
  );

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

  // 外部ファイル変更時にスクロール位置を保持したまま内容を更新する
  const onExternalContentAppliedRef = useRef(onExternalContentApplied);
  onExternalContentAppliedRef.current = onExternalContentApplied;

  useEffect(() => {
    if (externalContent == null) return;
    const editor = get();
    if (!editor) return;

    // Save scroll progress before replacing content
    const container = scrollContainerRef.current;
    let savedProgress: number | null = null;
    if (container) {
      savedProgress = getScrollProgress({ container, isVertical });
    }

    try {
      editor.action(replaceAll(externalContent));
      // Restore scroll progress after layout settles
      if (container && savedProgress != null) {
        const progress = savedProgress;
        requestAnimationFrame(() => {
          setScrollProgress({ container, isVertical }, progress);
          onExternalContentAppliedRef.current?.();
        });
      } else {
        onExternalContentAppliedRef.current?.();
      }
    } catch (error) {
      console.warn("外部コンテンツの適用に失敗しました:", error);
    }
  }, [externalContent, get, isVertical, scrollContainerRef]);

  // posHighlight 設定を動的に更新（Editor を再作成せずに）
  useEffect(() => {
    if (!editorViewInstance) return;

    // 動的に設定を更新
    import("@/packages/milkdown-plugin-japanese-novel/pos-highlight")
      .then(({ updatePosHighlightSettings }) => {
        updatePosHighlightSettings(editorViewInstance, {
          enabled: posHighlightEnabled,
          colors: posHighlightColors,
          disabledTypes: posHighlightDisabledTypes,
        });
      })
      .catch((err) => {
        console.error("[Editor] Failed to update POS highlight settings:", err);
      });
  }, [editorViewInstance, posHighlightEnabled, posHighlightColors, posHighlightDisabledTypes]);

  // linting 設定を動的に更新（Editor を再作成せずに）
  useEffect(() => {
    if (!editorViewInstance) return;

    import("@/packages/milkdown-plugin-japanese-novel/linting-plugin")
      .then(({ updateLintingSettings }) => {
        updateLintingSettings(
          editorViewInstance,
          {
            enabled: lintingEnabled,
            ruleRunner: lintingRuleRunner,
          },
          "rule-config-change",
        );
      })
      .catch((err) => {
        console.error("[Editor] Failed to update linting settings:", err);
      });
  }, [editorViewInstance, lintingEnabled, lintingRuleRunner]);

  // 縦書き時: マウスホイールの縦スクロールを横スクロールへ変換する
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !isVertical) return;

    const handleWheel = (event: WheelEvent) => {
      const sensitivity = scrollSensitivity;
      const absX = Math.abs(event.deltaX);
      const absY = Math.abs(event.deltaY);
      const mouseHorizontalDelta = -event.deltaY * sensitivity;
      const hasBothAxes = absX > 0 && absY > 0;
      const hasFineGrainedValues = (absY > 0 && absY < 50) || (absX > 0 && absX < 50);
      const isTrackpadInput =
        verticalScrollBehavior === "trackpad" ||
        (verticalScrollBehavior === "auto" &&
          (hasBothAxes || (hasFineGrainedValues && !event.ctrlKey)));

      if (verticalScrollBehavior === "mouse") {
        if (absY >= absX && absY > 0) {
          container.scrollLeft += mouseHorizontalDelta;
          event.preventDefault();
        } else if (absX > 0) {
          container.scrollTop += event.deltaX * sensitivity;
          event.preventDefault();
        }
        return;
      }

      if (isTrackpadInput) {
        if (absY > 0) {
          container.scrollLeft += event.deltaY * sensitivity;
        }
        if (absX > 0) {
          container.scrollTop += event.deltaX * sensitivity;
        }
        event.preventDefault();
        return;
      }

      // Mouse semantics: treat dominant deltaY as vertical wheel input and map it
      // to horizontal movement for vertical writing.
      if (absY >= absX && absY > 0) {
        container.scrollLeft += mouseHorizontalDelta;
        event.preventDefault();
      } else if (absX > 0) {
        container.scrollTop += event.deltaX * sensitivity;
        event.preventDefault();
      }
    };

    container.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      container.removeEventListener("wheel", handleWheel);
    };
  }, [isVertical, scrollContainerRef, verticalScrollBehavior, scrollSensitivity]);

  // 不要なアニメーションを避けるため、直前のスタイル値を保持する
  const prevStyleRef = useRef({
    charsPerLine,
    isVertical,
    fontFamily,
    fontScale,
    lineHeight,
    charWidth,
  });
  const isFirstRenderRef = useRef(true);

  // 1行あたりの文字数制限を、スクロールルートではなく内側の measure box に適用する
  useEffect(() => {
    const measureBox = measureBoxRef.current;
    const editorDom = editorViewInstance?.dom ?? null;
    const milkdownRoot = editorDom?.closest(".milkdown") as HTMLElement | null;
    if (!measureBox || !milkdownRoot || !editorDom) return;

    const prev = prevStyleRef.current;
    const styleChanged =
      prev.charsPerLine !== charsPerLine ||
      prev.isVertical !== isVertical ||
      prev.fontFamily !== fontFamily ||
      prev.fontScale !== fontScale ||
      prev.lineHeight !== lineHeight ||
      prev.charWidth !== charWidth;

    // 直前値を更新
    prevStyleRef.current = {
      charsPerLine,
      isVertical,
      fontFamily,
      fontScale,
      lineHeight,
      charWidth,
    };

    // スタイルが変わっていない場合はアニメーションをしない（保存による再構築など）
    // charWidth が 0→計測値 へ初期化される遷移ではアニメーション不要
    const isFirstRender = isFirstRenderRef.current;
    const isCharWidthInit = prev.charWidth === 0 && charWidth > 0;
    const shouldAnimate = styleChanged && !isFirstRender && !isCharWidthInit;
    isFirstRenderRef.current = false;

    const applyStyles = () => {
      editorDom.classList.remove("milkdown-japanese-vertical", "milkdown-japanese-horizontal");
      editorDom.classList.add(
        isVertical ? "milkdown-japanese-vertical" : "milkdown-japanese-horizontal",
      );

      measureBox.style.width = "";
      measureBox.style.maxWidth = "";
      measureBox.style.height = "";
      measureBox.style.maxHeight = "";
      measureBox.style.minHeight = "";
      measureBox.style.minWidth = "";
      measureBox.style.margin = "";

      milkdownRoot.style.width = isVertical ? "max-content" : "100%";
      milkdownRoot.style.maxWidth = isVertical ? "" : "100%";
      milkdownRoot.style.height = "";
      milkdownRoot.style.maxHeight = "";
      milkdownRoot.style.minHeight = "";

      editorDom.style.width = isVertical ? "max-content" : "100%";
      editorDom.style.maxWidth = isVertical ? "" : "100%";
      editorDom.style.height = "";
      editorDom.style.maxHeight = "";
      editorDom.style.minHeight = "";
      editorDom.style.minWidth = "";
      editorDom.style.margin = "";

      if (charsPerLine > 0 && charWidth > 0) {
        if (isVertical) {
          const targetHeight = charWidth * charsPerLine;
          measureBox.style.height = `${targetHeight}px`;
          measureBox.style.maxHeight = `${targetHeight}px`;
          measureBox.style.minHeight = `${targetHeight}px`;
          milkdownRoot.style.height = `${targetHeight}px`;
          milkdownRoot.style.maxHeight = `${targetHeight}px`;
          milkdownRoot.style.minHeight = `${targetHeight}px`;
          editorDom.style.height = `${targetHeight}px`;
          editorDom.style.maxHeight = `${targetHeight}px`;
          editorDom.style.minHeight = `${targetHeight}px`;
        } else {
          const targetWidth = charWidth * charsPerLine;
          measureBox.style.width = `${targetWidth}px`;
          measureBox.style.maxWidth = `${targetWidth}px`;
        }
      }
    };

    if (shouldAnimate) {
      editorDom.style.transition = "opacity 0.15s ease-out";
      editorDom.style.opacity = "0";

      const timer = setTimeout(() => {
        applyStyles();

        requestAnimationFrame(() => {
          editorDom.style.transition = "opacity 0.25s ease-in";
          editorDom.style.opacity = "1";
          onLayoutReady?.();
        });
      }, 150);

      return () => {
        clearTimeout(timer);
      };
    } else {
      applyStyles();
      // charWidth が未計測（0）の間はエディタを透明のまま維持し、
      // 幅制約なしの状態が一瞬描画されるのを防ぐ
      if (charWidth > 0 || charsPerLine <= 0) {
        editorDom.style.opacity = "1";
        onLayoutReady?.();
      }
    }
  }, [
    charsPerLine,
    charWidth,
    editorViewInstance,
    isVertical,
    fontFamily,
    fontScale,
    lineHeight,
    onLayoutReady,
  ]);

  // Union of all Milkdown command keys used in handleFormat.
  // Each .key property is a branded CmdKey<T> string exported by @milkdown.
  type MilkdownCommandKey =
    | typeof toggleStrongCommand.key
    | typeof toggleEmphasisCommand.key
    | typeof toggleInlineCodeCommand.key
    | typeof wrapInHeadingCommand.key
    | typeof wrapInBlockquoteCommand.key
    | typeof wrapInBulletListCommand.key
    | typeof wrapInOrderedListCommand.key
    | typeof toggleStrikethroughCommand.key;

  // BubbleMenu からの書式コマンドを処理する
  const handleFormat = (format: FormatType, level?: number) => {
    try {
      const editor = get();
      if (!editor) return;

      const execute = (commandKey: MilkdownCommandKey, payload?: unknown): void => {
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
    const lintEl = el.closest("[data-lint-issue]");
    if (!lintEl) return null;
    const issueJson = lintEl.getAttribute("data-lint-issue");
    if (!issueJson) return null;
    try {
      return JSON.parse(issueJson);
    } catch {
      return null;
    }
  }, []);

  // Context menu actions
  const handleContextMenuAction = useCallback(
    (action: ContextMenuAction) => {
      if (!editorViewInstance) return;

      switch (action) {
        case "cut":
          document.execCommand("cut");
          break;
        case "copy":
          document.execCommand("copy");
          break;
        case "paste":
          navigator.clipboard
            .readText()
            .then((text) => {
              const { state, dispatch } = editorViewInstance;
              const { from, to } = state.selection;
              const transaction = state.tr.insertText(text, from, to);
              dispatch(transaction);
            })
            .catch((err) => {
              console.error("Failed to paste:", err);
            });
          break;
        case "paste-plaintext":
          navigator.clipboard
            .readText()
            .then((text) => {
              // Strip formatting by using plain text
              const { state, dispatch } = editorViewInstance;
              const { from, to } = state.selection;
              const transaction = state.tr.insertText(text, from, to);
              dispatch(transaction);
            })
            .catch((err) => {
              console.error("Failed to paste plain text:", err);
            });
          break;
        case "find": {
          // Open the app's SearchDialog, passing any selected text as the initial term
          const { state: fs } = editorViewInstance;
          const { from: ff, to: ft } = fs.selection;
          const findTerm = ff !== ft ? fs.doc.textBetween(ff, ft) : undefined;
          onFind?.(findTerm);
          break;
        }
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
        case "start-speech":
          onStartSpeech?.();
          break;
        default:
          break;
      }
    },
    [
      editorViewInstance,
      onOpenRubyDialog,
      onToggleTcy,
      onOpenDictionary,
      lintIssueAtCursor,
      onShowLintHint,
      onIgnoreCorrection,
      onStartSpeech,
      onFind,
    ],
  );

  // Electron: native OS context menu via IPC
  const handleElectronContextMenu = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      const issue = getLintIssueAtCoords(e.clientX, e.clientY);
      setLintIssueAtCursor(issue);
      const items = [
        ...(issue
          ? [
              { label: "校正提示を表示", action: "show-lint-hint" },
              { label: "この指摘を無視", action: "ignore-correction" },
              { label: "同じ指摘をすべて無視", action: "ignore-correction-all" },
              { label: "-", action: "_separator" },
            ]
          : []),
        ...(selectionState.hasSelection
          ? [
              { label: "切り取り", action: "cut", accelerator: "CmdOrCtrl+X" },
              { label: "コピー", action: "copy", accelerator: "CmdOrCtrl+C" },
            ]
          : []),
        { label: "貼り付け", action: "paste", accelerator: "CmdOrCtrl+V" },
        {
          label: "プレーンテキストとして貼り付け",
          action: "paste-plaintext",
          accelerator: "Shift+CmdOrCtrl+V",
        },
        { label: "-", action: "_separator" },
        ...(selectionState.hasSelection && mdiExtensionsEnabled
          ? [
              { label: "ルビ", action: "ruby", accelerator: "Shift+CmdOrCtrl+R" },
              { label: "縦中横", action: "tcy", accelerator: "Shift+CmdOrCtrl+T" },
              { label: "-", action: "_separator" },
            ]
          : []),
        { label: "検索", action: "find", accelerator: "CmdOrCtrl+F" },
        ...(selectionState.hasSelection
          ? [
              { label: "Googleで検索", action: "google-search" },
              { label: "辞書で調べる", action: "dictionary" },
            ]
          : []),
        { label: "-", action: "_separator" },
        { label: "読み上げ開始", action: "start-speech" },
        { label: "-", action: "_separator" },
        { label: "すべて選択", action: "select-all", accelerator: "CmdOrCtrl+A" },
      ];
      const action = await window.electronAPI?.showContextMenu?.(items);
      if (action) handleContextMenuAction(action as ContextMenuAction);
    },
    [
      getLintIssueAtCoords,
      handleContextMenuAction,
      mdiExtensionsEnabled,
      selectionState.hasSelection,
    ],
  );

  // Left-click on lint decoration → auto-switch to corrections tab
  const handleEditorClick = useCallback(
    (e: React.MouseEvent) => {
      const issue = getLintIssueAtCoords(e.clientX, e.clientY);
      if (issue) {
        onShowLintHint?.(issue);
      }
    },
    [getLintIssueAtCoords, onShowLintHint],
  );

  // Editor content wrapper - only use custom context menu on Web, native on Electron
  const editorContent = (
    <div
      ref={editorRef}
      onClick={handleEditorClick}
      className={clsx(
        "editor-content-area",
        isVertical ? "py-8 h-full min-h-full min-w-full" : "p-8 min-h-full",
      )}
      style={{
        fontSize: `${fontScale}%`,
        fontFamily: `"${fontFamily}", serif`,
        lineHeight: lineHeight,
        ...(isVertical && {
          width: "max-content",
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
        }),
      }}
    >
      {/* Hidden character width measurement element — CSS class provides letter-spacing
          and font-feature-settings; inline styles override the class's font-family/size
          so the measurement matches the user's actual typography settings.
          Use fixed positioning so the measurement node can never affect any scroll container. */}
      <span
        ref={charMeasureRef}
        aria-hidden="true"
        className={isVertical ? "milkdown-japanese-vertical" : "milkdown-japanese-horizontal"}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          visibility: "hidden",
          pointerEvents: "none",
          whiteSpace: "nowrap",
          fontFamily: `"${fontFamily}", serif`,
          fontSize: `${fontScale}%`,
          lineHeight: lineHeight,
        }}
      >
        {MEASURE_TEXT}
      </span>
      <style jsx>{`
        div :global(.milkdown .ProseMirror) {
          font-family: "${fontFamily}", serif;
          line-height: ${lineHeight};
          ${showParagraphNumbers ? "counter-reset: paragraph;" : ""}
        }
        div :global(.milkdown .ProseMirror.milkdown-japanese-horizontal p) {
          text-indent: ${textIndent}em;
          margin-bottom: ${paragraphSpacing}em;
          ${showParagraphNumbers ? "counter-increment: paragraph;" : ""}
          ${showParagraphNumbers ? "position: relative;" : ""}
        }
        div :global(.milkdown .ProseMirror.milkdown-japanese-vertical p) {
          text-indent: ${textIndent}em;
          margin-left: ${paragraphSpacing}em;
          margin-bottom: 0;
          ${showParagraphNumbers ? "counter-increment: paragraph;" : ""}
          ${showParagraphNumbers ? "position: relative;" : ""}
        }
        /* Hardbreak indent spacer: align lines after shift+enter with first-line indent */
        div :global(.milkdown .ProseMirror .mdi-hardbreak-indent) {
          display: inline-block;
          width: ${textIndent}em;
        }
        div :global(.milkdown .ProseMirror.milkdown-japanese-horizontal p::before) {
          ${showParagraphNumbers
            ? `
              content: counter(paragraph);
              position: absolute;
              left: -2em;
              font-size: 0.7em;
              opacity: 0.5;
              color: currentColor;
              user-select: none;
              font-family: 'Fira Code', monospace;
            `
            : "content: none;"}
        }
        div :global(.milkdown .ProseMirror.milkdown-japanese-vertical p::before) {
          ${showParagraphNumbers
            ? `
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
            `
            : "content: none;"}
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
          ${showParagraphNumbers ? "counter-increment: paragraph;" : ""}
        }
      `}</style>
      <style jsx global>{`
        /* 初期表示は透明にし、レイアウト確定後にJSでフェードインする */
        .editor-content-area .editor-measure-box {
          position: relative;
        }
        .editor-content-area .editor-measure-box > .milkdown {
          width: 100%;
          max-width: 100%;
        }
        .editor-content-area
          .editor-measure-box
          > .milkdown
          .ProseMirror.milkdown-japanese-horizontal {
          width: 100%;
          max-width: 100%;
        }
        .editor-content-area
          .editor-measure-box
          > .milkdown
          .ProseMirror.milkdown-japanese-vertical {
          min-height: 100%;
        }
        .editor-content-area .milkdown .ProseMirror {
          opacity: 0;
        }
      `}</style>
      <div
        className={clsx(
          "editor-layout-frame flex",
          isVertical
            ? "min-w-full w-max justify-end"
            : "min-h-full w-full justify-center items-start",
        )}
      >
        <div
          ref={measureBoxRef}
          className={clsx("editor-measure-box shrink-0", !isVertical && "w-full max-w-full")}
        >
          <Milkdown />
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Use custom context menu only on Web, native context menu on Electron */}
      {!isElectron ? (
        <EditorContextMenu
          onAction={handleContextMenuAction}
          hasSelection={selectionState.hasSelection}
          lintIssueAtCursor={lintIssueAtCursor}
          onContextMenuOpen={(e) =>
            setLintIssueAtCursor(getLintIssueAtCoords(e.clientX, e.clientY))
          }
          mdiExtensionsEnabled={mdiExtensionsEnabled}
          onStartSpeech={onStartSpeech}
        >
          {editorContent}
        </EditorContextMenu>
      ) : (
        <div onContextMenu={handleElectronContextMenu}>{editorContent}</div>
      )}
      {editorViewInstance && (
        <BubbleMenu
          selectionState={selectionState}
          scrollContainerRef={scrollContainerRef}
          onFormat={handleFormat}
          isVertical={isVertical}
        />
      )}
    </>
  );
}
