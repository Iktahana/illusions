"use client";

import { Type, AlignLeft, Search, BookAudio, Pause } from "lucide-react";
import {
  useTypographySettings,
} from "@/contexts/EditorSettingsContext";
import type { SpeechState } from "@/lib/hooks/use-speech";
import ValuePicker from "./ValuePicker";

export default function EditorToolbar({
  isVertical,
  onToggleVertical,
  onSearchClick,
  speechState,
  onSpeakToggle,
}: {
  isVertical: boolean;
  onToggleVertical: () => void;
  onSearchClick: () => void;
  speechState: SpeechState;
  onSpeakToggle: () => void;
}) {
  const {
    fontScale, lineHeight, paragraphSpacing,
    onFontScaleChange, onLineHeightChange, onParagraphSpacingChange,
  } = useTypographySettings();
  // Options matching the 書式 menu ranges/steps
  const fontScaleOptions = Array.from({ length: 13 }, (_, i) => 50 + i * 10); // 50–170
  const lineHeightOptions = Array.from({ length: 21 }, (_, i) => +(1.0 + i * 0.1).toFixed(1)); // 1.0–3.0
  const paragraphSpacingOptions = Array.from({ length: 31 }, (_, i) => +(i * 0.1).toFixed(1)); // 0–3.0

  return (
    <div className="h-12 border-y border-border bg-[#fafafa] dark:bg-background-secondary flex items-center justify-between px-4">
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
        {/* 読み上げ */}
        {speechState.isSupported && (
          <button
            onClick={onSpeakToggle}
            className="flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium bg-background-tertiary text-foreground-secondary hover:bg-hover transition-colors"
            title={speechState.isPlaying ? "朗読を一時停止" : "朗読"}
          >
            {speechState.isPlaying ? <Pause className="w-4 h-4" /> : <BookAudio className="w-4 h-4" />}
          </button>
        )}

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
