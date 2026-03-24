"use client";

import type React from "react";
import clsx from "clsx";
import { FEATURED_JAPANESE_FONTS } from "@/lib/utils/fonts";
import {
  useTypographySettings,
  useUISettings,
} from "@/contexts/EditorSettingsContext";

/**
 * Settings tab for typography (editor) and UI settings.
 * Covers: font family, font scale, line height, paragraph spacing,
 * text indent, chars per line, paragraph numbers, and auto-save.
 */
export default function TypographySettingsTab(): React.ReactElement {
  const {
    fontScale,
    lineHeight,
    paragraphSpacing,
    textIndent,
    fontFamily,
    charsPerLine,
    autoCharsPerLine,
    showParagraphNumbers,
    onFontScaleChange,
    onLineHeightChange,
    onParagraphSpacingChange,
    onTextIndentChange,
    onFontFamilyChange,
    onCharsPerLineChange,
    onAutoCharsPerLineChange,
    onShowParagraphNumbersChange,
  } = useTypographySettings();
  const { autoSave, onAutoSaveChange } = useUISettings();

  return (
    <div className="space-y-6">
      {/* Font family */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          フォント
        </label>
        <select
          value={fontFamily}
          onChange={(e) => onFontFamilyChange(e.target.value)}
          className="w-full px-3 py-2 border border-border-secondary rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
        >
          {FEATURED_JAPANESE_FONTS.map((font) => (
            <option key={font.family} value={font.family}>
              {font.localizedName ? `${font.family} (${font.localizedName})` : font.family}
            </option>
          ))}
        </select>
      </div>

      {/* Font scale */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          フォントサイズ: {fontScale}%
        </label>
        <input
          type="range"
          min={50}
          max={200}
          step={5}
          value={fontScale}
          onChange={(e) => onFontScaleChange(Number(e.target.value))}
          className="w-full"
        />
      </div>

      {/* Line height */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          行間: {lineHeight.toFixed(1)}
        </label>
        <input
          type="range"
          min={1.0}
          max={3.0}
          step={0.1}
          value={lineHeight}
          onChange={(e) => onLineHeightChange(Number(e.target.value))}
          className="w-full"
        />
      </div>

      {/* Paragraph spacing */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          段落間隔: {paragraphSpacing.toFixed(1)}em
        </label>
        <input
          type="range"
          min={0}
          max={2}
          step={0.1}
          value={paragraphSpacing}
          onChange={(e) => onParagraphSpacingChange(Number(e.target.value))}
          className="w-full"
        />
      </div>

      {/* Text indent */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          字下げ
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            step={0.5}
            value={textIndent}
            onChange={(e) => onTextIndentChange(Number(e.target.value))}
            className="w-24 px-3 py-2 border border-border-secondary rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <span className="text-sm text-foreground-secondary">字</span>
        </div>
      </div>

      {/* Chars per line */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          1行あたりの文字数制限
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            step={1}
            value={charsPerLine}
            disabled={autoCharsPerLine}
            onChange={(e) => onCharsPerLineChange(Number(e.target.value))}
            className={clsx(
              "w-24 px-3 py-2 border border-border-secondary rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent",
              autoCharsPerLine && "opacity-50 cursor-not-allowed"
            )}
          />
          <span className="text-sm text-foreground-secondary">字</span>
          <span className="ml-auto text-sm text-foreground-secondary">自動</span>
          <button
            onClick={() => onAutoCharsPerLineChange(!autoCharsPerLine)}
            className={clsx(
              "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out",
              autoCharsPerLine ? "bg-accent" : "bg-border-secondary"
            )}
          >
            <span
              className={clsx(
                "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition duration-200 ease-in-out",
                autoCharsPerLine ? "translate-x-5" : "translate-x-0"
              )}
            />
          </button>
        </div>
        <p className="text-xs text-foreground-tertiary mt-1">
          {autoCharsPerLine
            ? "ウィンドウサイズに応じて自動調整します（最大40字）"
            : "1行（縦書きの場合は1列）あたりの最大文字数"}
        </p>
      </div>

      {/* Paragraph numbers toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-foreground">段落番号を表示</h3>
          <p className="text-xs text-foreground-tertiary mt-0.5">
            各段落に番号を表示します
          </p>
        </div>
        <button
          onClick={() => onShowParagraphNumbersChange(!showParagraphNumbers)}
          className={clsx(
            "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
            showParagraphNumbers ? "bg-accent" : "bg-border-secondary"
          )}
        >
          <span
            className={clsx(
              "inline-block h-4 w-4 transform rounded-full bg-background transition-transform",
              showParagraphNumbers ? "translate-x-6" : "translate-x-1"
            )}
          />
        </button>
      </div>

      {/* Auto-save toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-foreground">自動保存</h3>
          <p className="text-xs text-foreground-tertiary mt-0.5">
            変更を5秒ごとに自動保存します
          </p>
        </div>
        <button
          onClick={() => onAutoSaveChange(!autoSave)}
          className={clsx(
            "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
            autoSave ? "bg-accent" : "bg-border-secondary"
          )}
        >
          <span
            className={clsx(
              "inline-block h-4 w-4 transform rounded-full bg-background transition-transform",
              autoSave ? "translate-x-6" : "translate-x-1"
            )}
          />
        </button>
      </div>
    </div>
  );
}
