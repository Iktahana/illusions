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
import { toggleStrikethroughCommand } from "@milkdown/preset-gfm";
import { clearFormatting } from "@/lib/editor-page/clear-formatting";
import { listener, listenerCtx } from "@milkdown/plugin-listener";
import { history } from "@milkdown/plugin-history";
import { clipboard } from "@milkdown/plugin-clipboard";
import { cursor } from "@milkdown/plugin-cursor";
import { Milkdown, useEditor } from "@milkdown/react";
import {
  changeLineLength,
  changeWritingMode,
  verticalWriting,
} from "@illusions-lab/milkdown-plugin-vertical-writing";
import { novelEditorFeatures } from "@/lib/editor-page/novel-editor-features";
import { posHighlight } from "@/lib/editor-page/pos-highlight";
import { linting } from "@/lib/editor-page/linting-plugin";
import clsx from "clsx";
import { EditorView } from "@milkdown/prose/view";
import { AllSelection } from "@milkdown/prose/state";
import { $prose, replaceAll } from "@milkdown/utils";
import BubbleMenu, { type FormatType } from "../BubbleMenu";
import { searchHighlightPlugin } from "@/lib/editor-page/search-highlight-plugin";
import { speechHighlightPlugin } from "@/lib/editor-page/speech-highlight-plugin";
import type { EditorSelectionState } from "@/lib/editor-page/use-selection-tracking";
import EditorContextMenu, { type ContextMenuAction } from "../EditorContextMenu";
import { isElectronRenderer } from "@/lib/utils/runtime-env";
import { commitPendingComposition } from "@/lib/editor-page/commit-pending-composition";
import type { LintIssue } from "@/lib/linting";
import type { RuleRunnerLike } from "@/lib/editor-page/linting-plugin";
import {
  useTypographySettings,
  useLintingSettings,
  usePosHighlightSettings,
  usePowerSettings,
  useKeyboardInputSettings,
} from "@/contexts/EditorSettingsContext";
import { usePosHighlightActivation } from "@/lib/editor-page/use-pos-highlight-activation";
import { isEditorViewAlive } from "@/lib/editor-page/use-search-highlight";
import { dispatchIfEditorViewAlive } from "@/shared/lib/editor-view-safety";
import { createMacOptionInputGuardPlugin } from "@/lib/editor-page/mac-option-input-guard";
import {
  getDocumentAdapter,
  type DocumentDiagnostic,
  type DocumentFormat,
} from "@/lib/document-format";
import { sourceLocationAtByteOffset } from "@/lib/mdi/utf8-source-offsets";

interface MilkdownEditorProps {
  initialContent: string;
  onChange?: (content: string) => void;
  onInsertText?: (text: string) => void;
  selectionState: EditorSelectionState;
  isVertical: boolean;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  onEditorViewReady?: (view: EditorView) => void;
  lintingRuleRunner?: RuleRunnerLike | null;
  onLintIssuesUpdated?: (issues: LintIssue[]) => void;
  onNlpError?: (error: Error) => void;
  onOpenRubyDialog?: () => void;
  onToggleTcy?: () => void;
  onOpenDictionary?: (searchTerm?: string) => void;
  onShowLintHint?: (issue: LintIssue) => void;
  onIgnoreCorrection?: (issue: LintIssue, ignoreAll: boolean) => void;
  onAddToUserDictionary?: (issue: LintIssue) => void;
  /** Rule ids whose detections support adding the flagged word to the user dictionary. */
  dictEntryRuleIds?: ReadonlySet<string>;
  documentFormat?: DocumentFormat;
  onStartSpeech?: () => void;
  /** Called when the user triggers "検索" from the context menu. Receives selected text as initial search term. */
  onFind?: (initialTerm?: string) => void;
  /** Per-pane override for charsPerLine (used by auto mode to avoid global state conflicts in split editors) */
  overrideCharsPerLine?: number;
  /** External content to apply to the editor (from file watcher). Best-effort scroll position preservation. */
  externalContent?: string | null;
  /** Called after externalContent has been applied and scroll restored (best-effort). */
  onExternalContentApplied?: () => void;
  /**
   * Register an on-demand flush that synchronously serializes the *live*
   * editor doc and returns it (#1840). The content update path
   * (`markdownUpdated`) is debounced 200ms with no maxWait, so during
   * continuous typing the parent's `tab.content` lags arbitrarily. Save flows
   * call this right before persisting so they never write stale content.
   * Called with the flush fn on mount and `null` on unmount.
   */
  registerFlush?: (flush: (() => string | null) | null) => void;
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
  onAddToUserDictionary,
  dictEntryRuleIds,
  documentFormat = "mdi",
  onStartSpeech,
  onFind,
  overrideCharsPerLine,
  externalContent,
  onExternalContentApplied,
  registerFlush,
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
  const { powerSaveMode } = usePowerSettings();
  const { allowOptionKeySpecialCharacterInput } = useKeyboardInputSettings();
  const editorRef = useRef<HTMLDivElement>(null);
  const [editorViewInstance, setEditorViewInstance] = useState<EditorView | null>(null);
  const adapter = useMemo(() => getDocumentAdapter(documentFormat), [documentFormat]);
  const [documentDiagnostics, setDocumentDiagnostics] = useState<readonly DocumentDiagnostic[]>([]);
  const [lintIssueAtCursor, setLintIssueAtCursor] = useState<LintIssue | null>(null);
  const isElectron = typeof window !== "undefined" && isElectronRenderer();
  // Keep unsaved content across format-driven editor reconstruction.
  const currentContentRef = useRef<string>(initialContent);
  const onChangeRef = useRef(onChange);
  const onInsertTextRef = useRef(onInsertText);
  const onLintIssuesUpdatedRef = useRef(onLintIssuesUpdated);
  const onNlpErrorRef = useRef(onNlpError);
  const allowOptionKeySpecialCharacterInputRef = useRef(allowOptionKeySpecialCharacterInput);
  allowOptionKeySpecialCharacterInputRef.current = allowOptionKeySpecialCharacterInput;

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

  const isVerticalRef = useRef(isVertical);
  const charsPerLineRef = useRef(charsPerLine);
  charsPerLineRef.current = charsPerLine;
  useEffect(() => {
    isVerticalRef.current = isVertical;
  }, [isVertical]);

  const isPlainText = documentFormat === "plain-text";
  const refreshDocumentDiagnostics = useCallback(
    (source: string) => {
      try {
        setDocumentDiagnostics(adapter.diagnostics(source));
      } catch (error) {
        console.warn("文書 diagnostics の取得に失敗しました:", error);
        setDocumentDiagnostics([]);
      }
    },
    [adapter],
  );

  useEffect(() => {
    refreshDocumentDiagnostics(currentContentRef.current);
  }, [refreshDocumentDiagnostics]);

  const { get } = useEditor(
    (root) => {
      const value = currentContentRef.current;
      let editor = Editor.make()
        .config(nord)
        .config((ctx) => {
          ctx.set(rootCtx, root);
          ctx.set(defaultValueCtx, value);
        })
        // listenerCtx 参照より先に listener を読み込む
        .use(listener)
        .config((ctx) => {
          if (isPlainText) {
            ctx.get(listenerCtx).updated((_ctx, doc) => {
              const content = adapter.encodeEditor(_ctx, doc);
              currentContentRef.current = content;
              refreshDocumentDiagnostics(content);
              onChangeRef.current?.(content);
            });
          } else {
            ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
              const content = adapter.capabilities.mdi
                ? adapter.encodeEditor(_ctx, _ctx.get(editorViewCtx).state.doc)
                : markdown;
              currentContentRef.current = content;
              refreshDocumentDiagnostics(content);
              onChangeRef.current?.(content);
            });
          }
        })
        .use(commonmark);

      editor = adapter.configureEditor(editor);

      editor = editor.use(novelEditorFeatures({ plainText: isPlainText }));

      editor = editor
        .use(
          verticalWriting({
            mode: isVerticalRef.current ? "vertical-rl" : "horizontal-tb",
            lineLength: charsPerLineRef.current > 0 ? charsPerLineRef.current : undefined,
          }),
        )
        .use(history)
        .use(clipboard)
        .use(cursor)
        // Prevent macOS Option-generated characters (for example ⌥V → √)
        // without stopping propagation to the global shortcut listener.
        .use(
          $prose(() =>
            createMacOptionInputGuardPlugin(() => allowOptionKeySpecialCharacterInputRef.current),
          ),
        )
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
    [adapter, isPlainText, refreshDocumentDiagnostics],
  );

  // Presentation changes are hot actions. They must never recreate Milkdown,
  // so document, selection, IME composition and history stay in the same view.
  useEffect(() => {
    if (!editorViewInstance) return;
    get()?.action(changeWritingMode(isVertical ? "vertical-rl" : "horizontal-tb"));
  }, [editorViewInstance, get, isVertical]);

  useEffect(() => {
    if (!editorViewInstance) return;
    get()?.action(changeLineLength(charsPerLine > 0 ? charsPerLine : null));
  }, [charsPerLine, editorViewInstance, get]);

  // EditorView インスタンスを取得する
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    // Unmount/cleanup guard: prevents setState after unmount and stops the
    // retry chain when the effect is torn down mid-poll (#1567).
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 10;

    const tryGetEditorView = () => {
      if (cancelled) return;
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

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [get, onEditorViewReady]);

  // 外部ファイル変更時にスクロール位置を保持したまま内容を更新する
  const onExternalContentAppliedRef = useRef(onExternalContentApplied);
  onExternalContentAppliedRef.current = onExternalContentApplied;

  useEffect(() => {
    if (externalContent == null) return;
    const editor = get();
    if (!editor) return;

    const container = editorViewInstance?.dom.closest(".milkdown") as HTMLElement | null;
    const savedScroll = container ? { left: container.scrollLeft, top: container.scrollTop } : null;

    try {
      editor.action(replaceAll(externalContent));
      if (container && savedScroll) {
        requestAnimationFrame(() => {
          container.scrollTo(savedScroll);
          onExternalContentAppliedRef.current?.();
        });
      } else {
        onExternalContentAppliedRef.current?.();
      }
    } catch (error) {
      console.warn("外部コンテンツの適用に失敗しました:", error);
    }
  }, [editorViewInstance, externalContent, get]);

  // 保存直前にライブ doc を即時シリアライズして返す（#1840）。
  // markdownUpdated は debounce(200ms, maxWait なし) のため、連続入力中は
  // currentContentRef / 親の tab.content が古いままになる。保存経路はこの関数を
  // 呼び、エディタの現在状態から content を再生成してから永続化する。
  // per-keystroke ではなく保存時のみ呼ばれるので perf 影響はない。
  const flushContent = useCallback((): string | null => {
    const editor = get();
    if (!editor) return null;
    try {
      let result: string | null = null;
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        // IME 変換中なら未確定文字を取りこぼさないよう、シリアライズ前に
        // composition を best-effort でコミットする（#1971）。通常経路は no-op。
        commitPendingComposition(view);
        const doc = view.state.doc;
        result = adapter.encodeEditor(ctx, doc);
      });
      // 注（#1840 / Codex F-01）: ここに来た時点で editor.action は editorViewCtx を
      // 解決できている＝EditorView は ready。ready な view の doc は内容の単一の
      // 真実なので、result === "" は「本当に空」を意味する（ユーザーの全削除など）。
      // よって "" を異常値として弾かない。未 ready 時は上の ctx.get が throw して
      // catch 節で null を返し、呼び出し側が既存 tab.content にフォールバックする。
      // 再マウント過渡は registerFlush(null)（登録が一旦 null）でも保護される。
      if (result != null && result !== currentContentRef.current) {
        // ライブ値を ref と親 state に反映し、後続の isDirty 再計算も正しくする。
        currentContentRef.current = result;
        refreshDocumentDiagnostics(result);
        onChangeRef.current?.(result);
      }
      return result;
    } catch (error) {
      console.warn("コンテンツのフラッシュに失敗しました:", error);
      return null;
    }
  }, [adapter, get, refreshDocumentDiagnostics]);

  // flush を親へ登録/解除する（onEditorViewReady と同じ readiness パターン）。
  // dockview はタブ切替や分割表示でも非アクティブな pane を portal でマウントし続ける
  // ため、エディタはタブ切替で再マウントされない（#1878）。代わりに親
  // (EditorLayout) は active pane にだけ実体の registrar を渡し、inactive pane には
  // undefined を渡す。よって登録/解除は registerFlush の変化（= アクティブ状態の
  // 反転）に追従させる必要がある。registerFlush を ref 越しに読んで [flushContent]
  // だけに依存すると effect が再実行されず、flushActiveEditorRef がマウント時に
  // アクティブだった pane を指したまま固まり、保存時に別 pane の内容を直列化して
  // しまう（#1878 の退行）。registerFlush を依存に含め、アクティブな pane の flush
  // だけが常に登録されている状態を保証する。inactive 化時は registerFlush が
  // undefined になるので cleanup は no-op となり、新たに active 化した pane の登録を
  // 上書きしない。
  useEffect(() => {
    registerFlush?.(flushContent);
    return () => {
      registerFlush?.(null);
    };
  }, [registerFlush, flushContent]);

  // posHighlight 設定を動的に更新（Editor を再作成せずに）。
  // enabled は power policy 由来の実効値（バックグラウンド中は停止、
  // フォーカス復帰でユーザー設定どおりに復元、#1466）。
  usePosHighlightActivation({
    view: editorViewInstance,
    posHighlightEnabled,
    powerSaveMode,
    posHighlightColors,
    posHighlightDisabledTypes,
  });

  // linting 設定を動的に更新（Editor を再作成せずに）
  useEffect(() => {
    if (!editorViewInstance) return;

    import("@/lib/editor-page/linting-plugin")
      .then(({ updateLintingSettings }) => {
        if (!isEditorViewAlive(editorViewInstance)) return;
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
        case "clearFormatting":
          // 選択範囲を標準本文（段落・装飾なし）に戻す
          editor.action((ctx) => {
            clearFormatting(ctx.get(editorViewCtx));
          });
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
              dispatchIfEditorViewAlive(editorViewInstance, (view) => {
                const { from, to } = view.state.selection;
                return view.state.tr.insertText(text, from, to);
              });
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
              dispatchIfEditorViewAlive(editorViewInstance, (view) => {
                const { from, to } = view.state.selection;
                return view.state.tr.insertText(text, from, to);
              });
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
          dispatchIfEditorViewAlive(editorViewInstance, (view) => {
            const allSelection = new AllSelection(view.state.doc);
            return view.state.tr.setSelection(allSelection);
          });
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
        case "add-to-user-dict":
          if (lintIssueAtCursor) {
            onAddToUserDictionary?.(lintIssueAtCursor);
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
      onAddToUserDictionary,
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
              ...(dictEntryRuleIds?.has(issue.ruleId)
                ? [{ label: "この語をユーザー辞書に追加", action: "add-to-user-dict" }]
                : []),
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
        ...(selectionState.hasSelection && adapter.capabilities.ruby
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
      adapter.capabilities.ruby,
      selectionState.hasSelection,
      dictEntryRuleIds,
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
      className="editor-content-area relative h-full min-h-0 w-full"
      style={{
        fontSize: `${fontScale}%`,
        fontFamily: `"${fontFamily}", serif`,
        lineHeight: lineHeight,
      }}
    >
      <style jsx>{`
        div :global(.milkdown .ProseMirror) {
          font-family: "${fontFamily}", serif;
          line-height: ${lineHeight};
          ${showParagraphNumbers ? "counter-reset: paragraph;" : ""}
        }
        div :global(.milkdown[data-writing-mode="horizontal-tb"] .ProseMirror p) {
          text-indent: ${textIndent}em;
          margin-block-end: ${paragraphSpacing}em;
        }
        div :global(.milkdown:not([data-writing-mode="horizontal-tb"]) .ProseMirror p) {
          text-indent: ${textIndent}em;
          margin-block-end: ${paragraphSpacing}em;
        }
        /* 行頭起こし括弧の段落（会話文など）は字下げしない */
        div :global(.milkdown .ProseMirror p.mdi-dialogue) {
          text-indent: 0;
        }
        /* 段落番号: 空行 (.mdi-blank) は数えない・表示しない。
           .mdi-blank の ::before は \\200B 表示（package CSS）に予約されている */
        div :global(.milkdown .ProseMirror p:not(.mdi-blank)) {
          ${showParagraphNumbers ? "counter-increment: paragraph;" : ""}
          ${showParagraphNumbers ? "position: relative;" : ""}
        }
        /* Hardbreak indent spacer: align lines after shift+enter with first-line indent */
        div :global(.milkdown .ProseMirror .mdi-hardbreak-indent) {
          display: inline-block;
          width: ${textIndent}em;
        }
        div
          :global(
            .milkdown[data-writing-mode="horizontal-tb"] .ProseMirror p:not(.mdi-blank)::before
          ) {
          ${
            showParagraphNumbers
              ? `
              content: counter(paragraph);
              position: absolute;
              /* Anchor the number's edge nearest the text at a fixed distance
                 from the paragraph's inline start, so every number lines up
                 regardless of digit count. */
              right: 100%;
              margin-right: 0.6em;
              /* abspos blockifies ::before, which would otherwise inherit the
                 paragraph's text-indent and offset dialogue (indent 0) vs
                 normal (indent N) numbers. Pin it so all numbers align. */
              text-indent: 0;
              text-align: right;
              font-size: 0.7em;
              opacity: 0.5;
              color: currentColor;
              user-select: none;
              font-family: 'Fira Code', monospace;
            `
              : "content: none;"
          }
        }
        div
          :global(
            .milkdown:not([data-writing-mode="horizontal-tb"])
              .ProseMirror
              p:not(.mdi-blank)::before
          ) {
          ${
            showParagraphNumbers
              ? `
              content: counter(paragraph);
              position: absolute;
              /* In vertical-rl the inline axis is vertical, so the paragraph's
                 text-indent shifts the number downward. abspos blockifies
                 ::before and it inherits that indent, offsetting dialogue
                 (indent 0) vs normal numbers. Pin it to 0 so all numbers align. */
              text-indent: 0;
              top: -2em;
              right: 0;
              font-size: 0.7em;
              opacity: 0.5;
              color: currentColor;
              user-select: none;
              font-family: 'Fira Code', monospace;
              writing-mode: horizontal-tb;
            `
              : "content: none;"
          }
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
        .editor-content-area > .milkdown {
          --milkdown-vertical-writing-viewport-size: 100%;
          width: 100%;
          height: 100%;
        }
        .editor-content-area > .milkdown > .editor {
          margin-inline: auto;
          padding-block: 2rem;
          padding-inline: 4rem;
        }
      `}</style>
      <Milkdown />
      {documentDiagnostics.length > 0 && (
        <aside
          aria-label="MDI diagnostics"
          className="absolute bottom-2 left-2 z-20 max-w-md rounded border border-amber-500/30 bg-background/95 px-3 py-2 text-xs shadow-lg"
        >
          {documentDiagnostics.slice(0, 3).map((diagnostic, index) => {
            const location = diagnostic.span
              ? sourceLocationAtByteOffset(currentContentRef.current, diagnostic.span.startByte)
              : null;
            return (
              <div key={`${diagnostic.code}-${diagnostic.span?.startByte ?? index}`}>
                <span
                  className={diagnostic.severity === "error" ? "text-red-500" : "text-amber-500"}
                >
                  {diagnostic.severity === "error" ? "エラー" : "警告"}
                </span>{" "}
                {location ? `L${location.line}:${location.column} ` : ""}
                {diagnostic.message}
              </div>
            );
          })}
          {documentDiagnostics.length > 3 && <div>ほか {documentDiagnostics.length - 3} 件</div>}
        </aside>
      )}
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
          canAddLintIssueToDict={
            !!(lintIssueAtCursor && dictEntryRuleIds?.has(lintIssueAtCursor.ruleId))
          }
          onContextMenuOpen={(e) =>
            setLintIssueAtCursor(getLintIssueAtCoords(e.clientX, e.clientY))
          }
          mdiCommandsEnabled={adapter.capabilities.mdi}
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
