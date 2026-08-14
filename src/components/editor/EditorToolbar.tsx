"use client";

import { Columns2, Rows2 } from "lucide-react";
import { useTypographySettings } from "@/contexts/EditorSettingsContext";
import ValuePicker from "./ValuePicker";

export default function EditorToolbar({
  isVertical,
  onToggleWritingMode,
}: {
  isVertical: boolean;
  onToggleWritingMode: () => void;
}): React.ReactElement {
  const {
    fontScale,
    lineHeight,
    paragraphSpacing,
    onFontScaleChange,
    onLineHeightChange,
    onParagraphSpacingChange,
  } = useTypographySettings();
  return (
    <div
      role="toolbar"
      aria-label="エディター表示"
      className="editor-toolbar flex h-9 shrink-0 items-center gap-3 overflow-x-auto border-b border-border bg-background-secondary px-2 text-xs whitespace-nowrap"
    >
      <button
        type="button"
        aria-label={isVertical ? "横書きに切り替え" : "縦書きに切り替え"}
        onClick={onToggleWritingMode}
        className="sticky left-0 z-10 flex items-center gap-1 rounded px-2 py-1 bg-background-secondary hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        {isVertical ? <Rows2 size={15} /> : <Columns2 size={15} />}
        {isVertical ? "横書き" : "縦書き"}
      </button>
      <ValuePicker
        label={`文字 ${fontScale}%`}
        value={fontScale}
        options={[75, 85, 100, 110, 125, 150]}
        onChange={onFontScaleChange}
      />
      <ValuePicker
        label={`行間 ${lineHeight.toFixed(1)}`}
        value={lineHeight}
        options={[1.2, 1.5, 1.8, 2, 2.4]}
        onChange={onLineHeightChange}
      />
      <ValuePicker
        label={`段落 ${paragraphSpacing.toFixed(1)}`}
        value={paragraphSpacing}
        options={[0, 0.25, 0.5, 0.75, 1]}
        onChange={onParagraphSpacingChange}
        unit="em"
      />
    </div>
  );
}
