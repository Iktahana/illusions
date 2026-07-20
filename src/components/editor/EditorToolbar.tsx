"use client";

import type React from "react";
import { Type, AlignLeft, Search, BookAudio, Pause } from "lucide-react";
import { useTypographySettings } from "@/contexts/EditorSettingsContext";
import type { SpeechState } from "@/lib/hooks/use-speech";
import ValuePicker from "./ValuePicker";

export default function EditorToolbar({
  isVertical,
  onToggleVertical,
  onSearchClick,
  searchButtonRef,
  speechState,
  onSpeakToggle,
  onOpenSpeechSettings,
}: {
  isVertical: boolean;
  onToggleVertical: () => void;
  onSearchClick: () => void;
  // #1504: anchor for SearchDialog. Forwarded to the 検索 button so the dialog
  // is positioned relative to the clicked editor pane, not the viewport.
  searchButtonRef?: React.Ref<HTMLButtonElement>;
  speechState: SpeechState;
  onSpeakToggle: () => void;
  onOpenSpeechSettings?: () => void;
}) {
  const {
    fontScale,
    lineHeight,
    paragraphSpacing,
    onFontScaleChange,
    onLineHeightChange,
    onParagraphSpacingChange,
  } = useTypographySettings();
  // Options matching the 書式 menu ranges/steps
  const fontScaleOptions = Array.from({ length: 13 }, (_, i) => 50 + i * 10); // 50–170
  const lineHeightOptions = Array.from({ length: 21 }, (_, i) => +(1.0 + i * 0.1).toFixed(1)); // 1.0–3.0
  const paragraphSpacingOptions = Array.from({ length: 31 }, (_, i) => +(i * 0.1).toFixed(1)); // 0–3.0

  return (
    // #1856: 狭いウィンドウで検索／読み上げボタンが画面外に押し出されないよう、
    // gap-x を縮め、設定グループ(min-w-0)が縮小・はみ出しを許容するようにする。
    // 縦書き／読み上げ／検索の主要操作は shrink-0 で常に可視のまま残す。
    <div className="min-h-12 border-y border-border bg-background-secondary flex items-center justify-between gap-2 px-4 py-1">
      <div className="flex min-w-0 items-center gap-2 overflow-hidden sm:gap-4">
        {/* 縦書き/横書き */}
        <button
          onClick={onToggleVertical}
          className="flex shrink-0 items-center gap-2 px-3 py-1.5 rounded font-medium bg-accent text-accent-foreground hover:bg-accent-hover transition-colors whitespace-nowrap"
          style={{ fontSize: "clamp(0.75rem, 1.5vw, 0.875rem)" }}
        >
          <Type className="w-4 h-4 shrink-0" />
          <span className="overflow-hidden text-ellipsis">{isVertical ? "縦書き" : "横書き"}</span>
        </button>

        {/* 現在の設定 — 狭幅では本グループが先に縮む／横スクロールする */}
        <div className="flex min-w-0 items-center gap-2 overflow-x-auto text-xs text-foreground-secondary">
          <AlignLeft className="w-4 h-4 shrink-0 text-foreground-tertiary" />
          <ValuePicker
            value={fontScale}
            label={`${fontScale}%`}
            options={fontScaleOptions}
            onChange={onFontScaleChange}
            unit="%"
          />
          <span className="text-foreground-tertiary">/</span>
          <ValuePicker
            value={lineHeight}
            label={lineHeight.toFixed(1)}
            options={lineHeightOptions}
            onChange={onLineHeightChange}
          />
          <span className="text-foreground-tertiary">/</span>
          <ValuePicker
            value={paragraphSpacing}
            label={`${paragraphSpacing.toFixed(1)}em`}
            options={paragraphSpacingOptions}
            onChange={onParagraphSpacingChange}
            unit="em"
          />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-4">
        {/* 読み上げ */}
        {speechState.isSupported && (
          <button
            onClick={onSpeakToggle}
            onContextMenu={(e) => {
              e.preventDefault();
              onOpenSpeechSettings?.();
            }}
            className="flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium bg-background-tertiary text-foreground-secondary hover:bg-hover transition-colors"
            title={speechState.isPlaying ? "読み上げを一時停止" : "読み上げ"}
          >
            {speechState.isPlaying ? (
              <Pause className="w-4 h-4" />
            ) : (
              <BookAudio className="w-4 h-4" />
            )}
          </button>
        )}

        {/* 検索 */}
        <button
          ref={searchButtonRef}
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
