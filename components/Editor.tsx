"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Decoration } from "@milkdown/prose/view";
import { MilkdownProvider } from "@milkdown/react";
import { ProsemirrorAdapterProvider } from "@prosemirror-adapter/react";
import clsx from "clsx";
import type { EditorView } from "@milkdown/prose/view";
import { useSpeech } from "@/lib/hooks/use-speech";
import SearchDialog, { type SearchMatch } from "./SearchDialog";
import SelectionCounter from "./SelectionCounter";
import EditorToolbar from "./editor/EditorToolbar";
import MilkdownEditor from "./editor/MilkdownEditor";
import { buildSegments, buildSpeechChunks, buildSpeechMap } from "@/lib/hooks/speech-utils";
import { localPreferences } from "@/lib/storage/local-preferences";
import type { RuleRunner, LintIssue } from "@/lib/linting";
import { useTypographySettings, useSpeechSettings } from "@/contexts/EditorSettingsContext";

interface EditorProps {
  initialContent?: string;
  onChange?: (content: string) => void;
  onInsertText?: (text: string) => void;
  onSelectionChange?: (charCount: number) => void;
  className?: string;
  searchOpenTrigger?: number;
  searchInitialTerm?: string;
  onEditorViewReady?: (view: EditorView) => void;
  onShowAllSearchResults?: (matches: SearchMatch[], searchTerm: string) => void;
  // リンティング設定
  lintingRuleRunner?: RuleRunner | null;
  onLintIssuesUpdated?: (issues: LintIssue[], options?: { llmPending?: boolean }) => void;
  onNlpError?: (error: Error) => void;
  // 書式コールバック
  onOpenRubyDialog?: () => void;
  onToggleTcy?: () => void;
  // 辞書
  onOpenDictionary?: (searchTerm?: string) => void;
  // 校正提示表示コールバック
  onShowLintHint?: (issue: LintIssue) => void;
  // 校正無視コールバック
  onIgnoreCorrection?: (issue: LintIssue, ignoreAll: boolean) => void;
  // Editor mode controls
  mdiExtensionsEnabled?: boolean;
  gfmEnabled?: boolean;
  /** External content to apply to the editor (from file watcher). Preserves scroll position. */
  externalContent?: string | null;
  /** Called after externalContent has been applied to ProseMirror. */
  onExternalContentApplied?: () => void;
}

export default function NovelEditor({
  initialContent = "",
  onChange,
  onInsertText,
  onSelectionChange,
  className,
  searchOpenTrigger = 0,
  searchInitialTerm,
  onEditorViewReady,
  onShowAllSearchResults,
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
  externalContent,
  onExternalContentApplied,
}: EditorProps) {
  const { fontScale, lineHeight, fontFamily, charsPerLine, autoCharsPerLine } =
    useTypographySettings();
  const { speechVoiceURI, speechRate, speechPitch, speechVolume } = useSpeechSettings();
  // localStorage から同期的に初期値を読み込む（初回レンダリング前に反映、横→縦のフラッシュ防止）
  const [isVertical, setIsVertical] = useState(() => {
    if (typeof window === "undefined") return false;
    return localPreferences.getWritingMode() === "vertical";
  });
  const [isMounted, setIsMounted] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  // コンテキストメニューの「検索」で渡された初期検索語
  const [contextMenuSearchTerm, setContextMenuSearchTerm] = useState<string | undefined>(undefined);
  const [editorViewInstance, setEditorViewInstance] = useState<EditorView | null>(null);
  const {
    state: speechState,
    speakSegments,
    pause,
    resume,
    stop,
  } = useSpeech({
    voiceURI: speechVoiceURI,
    rate: speechRate,
    pitch: speechPitch,
    volume: speechVolume,
  });
  const editorViewRef = useRef<EditorView | null>(null);
  const speechMapRef = useRef<{ text: string; positions: number[] } | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  /** Doc position to resume TTS from after the current chunk ends. null = no continuation. */
  const speechContinuationPosRef = useRef<number | null>(null);
  /** Stable ref to startSpeechFromPos, allowing onEnd to recurse without circular deps. */
  const startSpeechFromPosRef = useRef<((pos: number) => void) | null>(null);
  /** Max doc-position range processed per TTS chunk (~5 000 Japanese chars). */
  const MAX_SPEECH_CHUNK_RANGE = 10_000;

  /** Cache for DOM character-width measurement (invalidated when font settings change) */
  const charSizeCacheRef = useRef<{
    fontFamily: string;
    fontScale: number;
    lineHeight: number;
    size: number;
  } | null>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    editorViewRef.current = editorViewInstance;
  }, [editorViewInstance]);

  // 変更時に縦書き状態を localStorage に保存する
  useEffect(() => {
    if (!isMounted) return;
    localPreferences.setWritingMode(isVertical ? "vertical" : "horizontal");
  }, [isVertical, isMounted]);

  // 注意：このエフェクトはもう不要。理由：
  // 1. 新規ファイル打開時、親コンポーネント は key 属性経由で NovelEditor 全体を再マウント
  // 2. 編集内容時、initialContent は変わるが、スクロール位置をリセットするべきではない
  // 3. モード切替時、handleToggleVertical がスクロール位置の保存と復元を担当
  //
  // 将来、再マウント無しでファイル切替が必要なら、明確な fileId prop を追加して追跡可能

  const handleSearchToggle = () => {
    setIsSearchOpen((prev) => !prev);
  };

  const handleSearchOpen = useCallback(() => {
    setIsSearchOpen(true);
  }, []);

  /** コンテキストメニューの「検索」アクションを処理する。選択テキストを初期検索語として渡す。 */
  const handleFind = useCallback((initialTerm?: string) => {
    setContextMenuSearchTerm(initialTerm);
    setIsSearchOpen(true);
  }, []);

  const clearHighlight = useCallback(() => {
    const view = editorViewRef.current;
    if (!view) return;
    view.dispatch(view.state.tr.setMeta("speechDecorations", []));
  }, []);

  const startSpeechFromPos = useCallback(
    (startPos: number) => {
      stop();
      clearHighlight();
      const view = editorViewRef.current;
      if (!view) return;
      const docSize = view.state.doc.content.size;
      // Limit the range to avoid allocating huge arrays and thousands of utterances
      // on long documents. Continuation is handled lazily in onEnd.
      const endPos = Math.min(startPos + MAX_SPEECH_CHUNK_RANGE, docSize);
      const map = buildSpeechMap(view.state.doc, startPos, endPos);
      const segments = buildSegments(map.text);
      const chunks = buildSpeechChunks(map.text, segments);
      if (chunks.length === 0) return;
      speechMapRef.current = map;
      speechContinuationPosRef.current = endPos < docSize ? endPos : null;

      speakSegments(
        chunks.map((c) => c.speech),
        {
          onSegmentStart(index) {
            const v = editorViewRef.current;
            const m = speechMapRef.current;
            if (!v || !m) return;
            const chunk = chunks[index];
            const from = m.positions[chunk.highlightStart];
            const to = (m.positions[chunk.highlightEnd - 1] ?? from) + 1;
            if (from == null) return;
            const deco = Decoration.inline(from, to, { class: "speech-reading" });
            v.dispatch(v.state.tr.setMeta("speechDecorations", [deco]));
          },
          onEnd() {
            clearHighlight();
            speechMapRef.current = null;
            // Lazily load the next chunk so the full document is read without
            // pre-allocating all utterances upfront.
            const nextPos = speechContinuationPosRef.current;
            speechContinuationPosRef.current = null;
            if (nextPos !== null) {
              startSpeechFromPosRef.current?.(nextPos);
            }
          },
        },
      );
    },
    [speakSegments, stop, clearHighlight, isVertical, MAX_SPEECH_CHUNK_RANGE],
  );

  // Keep the ref in sync so onEnd can call startSpeechFromPos without a circular dep
  useEffect(() => {
    startSpeechFromPosRef.current = startSpeechFromPos;
  }, [startSpeechFromPos]);

  const startSpeechFromCursor = useCallback(() => {
    const view = editorViewRef.current;
    if (!view) return;
    const { head } = view.state.selection;
    const startPos = head > 1 ? head : 1;
    startSpeechFromPos(startPos);
  }, [startSpeechFromPos]);

  const handleSpeakToggle = useCallback(() => {
    if (speechState.isPlaying) {
      pause();
      return;
    }
    if (speechState.isPaused) {
      resume();
      return;
    }
    startSpeechFromCursor();
  }, [speechState.isPlaying, speechState.isPaused, pause, resume, startSpeechFromCursor]);

  // Restart speech from clicked position when clicking during playback
  const speechPlayingRef = useRef(false);
  useEffect(() => {
    speechPlayingRef.current = speechState.isPlaying;
  }, [speechState.isPlaying]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const handleClick = () => {
      if (!speechPlayingRef.current) return;
      // Wait for ProseMirror to update selection from the click
      requestAnimationFrame(() => {
        startSpeechFromCursor();
      });
    };
    container.addEventListener("click", handleClick);
    return () => container.removeEventListener("click", handleClick);
  }, [startSpeechFromCursor]);

  // 親からのトリガーで検索ダイアログを開く（ショートカット）
  useEffect(() => {
    if (searchOpenTrigger > 0) {
      handleSearchOpen();
    }
  }, [searchOpenTrigger, handleSearchOpen]);

  const handleToggleVertical = useCallback(() => {
    setIsVertical((prev) => !prev);
  }, []);

  // Per-pane local state for auto-calculated chars per line (avoids split panes overwriting each other)
  const [localAutoCharsPerLine, setLocalAutoCharsPerLine] = useState<number | null>(null);
  const effectiveCharsPerLine =
    autoCharsPerLine && localAutoCharsPerLine !== null ? localAutoCharsPerLine : charsPerLine;

  // Reset local value when auto mode is toggled off
  useEffect(() => {
    if (!autoCharsPerLine) setLocalAutoCharsPerLine(null);
  }, [autoCharsPerLine]);

  // Refs to avoid including charsPerLine / callback in useCallback deps (prevents recalc loop)
  const charsPerLineRef = useRef(effectiveCharsPerLine);
  useEffect(() => {
    charsPerLineRef.current = effectiveCharsPerLine;
  }, [effectiveCharsPerLine]);

  // Calculate optimal chars per line based on editor width and font size
  const calculateOptimalCharsPerLine = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // Skip calculation when container is not visible (e.g., hidden dockview panel)
    if (container.clientWidth <= 0 || container.clientHeight <= 0) return;

    // Use cached charSize when font settings are unchanged (avoids DOM element creation on every resize)
    let charSize: number;
    const cache = charSizeCacheRef.current;
    if (
      cache &&
      cache.fontFamily === fontFamily &&
      cache.fontScale === fontScale &&
      cache.lineHeight === lineHeight
    ) {
      charSize = cache.size;
    } else {
      // Measure character width via a temporary DOM element
      const measureEl = document.createElement("span");
      measureEl.style.cssText = `
        position: absolute;
        visibility: hidden;
        white-space: nowrap;
        font-family: "${fontFamily}", serif;
        font-size: ${fontScale}%;
        line-height: ${lineHeight};
      `;
      measureEl.textContent = "国"; // Measure with full-width character
      document.body.appendChild(measureEl);
      charSize = measureEl.offsetWidth;
      document.body.removeChild(measureEl);

      // Cache the result for subsequent resize events with the same font settings
      charSizeCacheRef.current = { fontFamily, fontScale, lineHeight, size: charSize };
    }

    if (charSize <= 0) return;

    // Get available space (subtract padding)
    const padding = 128; // 64px * 2 for left and right
    const availableWidth = container.clientWidth - padding;

    if (isVertical) {
      // For vertical writing: calculate based on available height
      // Only subtract topPadding (pt-12); toolbar is outside the scroll container
      const topPadding = 48; // pt-12 = 48px
      const availableHeight = container.clientHeight - topPadding;

      const optimalChars = Math.max(10, Math.floor(availableHeight / charSize));
      // Clamp: max 40 characters
      const clamped = Math.min(40, optimalChars);

      if (clamped !== charsPerLineRef.current) {
        setLocalAutoCharsPerLine(clamped);
      }
    } else {
      // For horizontal writing: calculate based on available width
      const optimalChars = Math.max(10, Math.floor(availableWidth / charSize));
      // Clamp: max 40 characters
      const clamped = Math.min(40, optimalChars);

      if (clamped !== charsPerLineRef.current) {
        setLocalAutoCharsPerLine(clamped);
      }
    }
  }, [fontFamily, fontScale, lineHeight, isVertical, scrollContainerRef]);

  // Add window resize listener to auto-adjust chars per line
  useEffect(() => {
    if (!autoCharsPerLine) return;

    // Calculate on mount
    const timer = setTimeout(calculateOptimalCharsPerLine, 100);

    // Debounce resize events to 300ms to avoid excessive recalculation during window drag
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const handleResize = () => {
      if (resizeTimer !== null) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(calculateOptimalCharsPerLine, 300);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      clearTimeout(timer);
      if (resizeTimer !== null) clearTimeout(resizeTimer);
      window.removeEventListener("resize", handleResize);
    };
  }, [calculateOptimalCharsPerLine, autoCharsPerLine]);

  return (
    <div className={clsx("flex flex-col h-full min-h-0 relative", className)}>
      {/* ツールバー */}
      <EditorToolbar
        isVertical={isVertical}
        onToggleVertical={handleToggleVertical}
        onSearchClick={handleSearchToggle}
        speechState={speechState}
        onSpeakToggle={handleSpeakToggle}
      />

      {/* エディタ領域 */}
      <div
        ref={scrollContainerRef}
        className="flex-1 bg-background-secondary relative min-h-0 pt-12"
        style={{
          overflowX: "auto",
          overflowY: "auto",
          // Disable browser scroll anchoring to prevent auto-scroll adjustment during DOM updates in vertical mode
          overflowAnchor: "none",
          // In vertical-rl, padding on child elements causes Chromium to miscalculate scrollWidth.
          // Move horizontal padding to the scroll container itself, where the browser handles it correctly.
          ...(isVertical ? { paddingLeft: 64, paddingRight: 64 } : {}),
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
              scrollContainerRef={scrollContainerRef}
              overrideCharsPerLine={effectiveCharsPerLine}
              onEditorViewReady={(view) => {
                setEditorViewInstance(view);
                onEditorViewReady?.(view);
              }}
              lintingRuleRunner={lintingRuleRunner}
              onLintIssuesUpdated={onLintIssuesUpdated}
              onNlpError={onNlpError}
              onOpenRubyDialog={onOpenRubyDialog}
              onToggleTcy={onToggleTcy}
              onOpenDictionary={onOpenDictionary}
              onShowLintHint={onShowLintHint}
              onIgnoreCorrection={onIgnoreCorrection}
              mdiExtensionsEnabled={mdiExtensionsEnabled}
              gfmEnabled={gfmEnabled}
              onStartSpeech={startSpeechFromCursor}
              onFind={handleFind}
              externalContent={externalContent}
              onExternalContentApplied={onExternalContentApplied}
            />
          </ProsemirrorAdapterProvider>
        </MilkdownProvider>
      </div>

      {/* 選択文字数（エディタ外枠基準で配置） */}
      {editorViewInstance && (
        <SelectionCounter
          editorView={editorViewInstance}
          isVertical={isVertical}
          containerRef={scrollContainerRef}
        />
      )}

      {/* 検索ダイアログ */}
      <SearchDialog
        editorView={editorViewInstance}
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onShowAllResults={onShowAllSearchResults}
        initialSearchTerm={contextMenuSearchTerm ?? searchInitialTerm}
      />
    </div>
  );
}
