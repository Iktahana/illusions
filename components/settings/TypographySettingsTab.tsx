"use client";

import type React from "react";
import clsx from "clsx";

import { FEATURED_JAPANESE_FONTS } from "@/lib/utils/fonts";
import { useTypographySettings, useUISettings } from "@/contexts/EditorSettingsContext";
import {
  SettingsField,
  SettingsSection,
  SettingsToggle,
  SliderField,
} from "./primitives";

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
      <SettingsSection title="文字組み">
        <SettingsField label="フォント" htmlFor="typography-font-family">
          <select
            id="typography-font-family"
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
        </SettingsField>

        <SliderField
          label="フォントサイズ"
          value={fontScale}
          min={50}
          max={200}
          step={5}
          formatValue={(v) => `${v}%`}
          onChange={onFontScaleChange}
        />

        <SliderField
          label="行間"
          value={lineHeight}
          min={1.0}
          max={3.0}
          step={0.1}
          formatValue={(v) => v.toFixed(1)}
          onChange={onLineHeightChange}
        />

        <SliderField
          label="段落間隔"
          value={paragraphSpacing}
          min={0}
          max={2}
          step={0.1}
          formatValue={(v) => `${v.toFixed(1)}em`}
          onChange={onParagraphSpacingChange}
        />

        <SettingsField label="字下げ" htmlFor="typography-text-indent">
          <div className="flex items-center gap-2">
            <input
              id="typography-text-indent"
              type="number"
              min={0}
              step={0.5}
              value={textIndent}
              onChange={(e) => onTextIndentChange(Number(e.target.value))}
              className="w-24 px-3 py-2 border border-border-secondary rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <span className="text-sm text-foreground-secondary">字</span>
          </div>
        </SettingsField>

        <SettingsField
          label="1 行あたりの文字数制限"
          description={
            autoCharsPerLine
              ? "ウィンドウサイズに応じて自動調整します（最大 40 字）"
              : "1 行（縦書きの場合は 1 列）あたりの最大文字数"
          }
          htmlFor="typography-chars-per-line"
        >
          <div className="flex items-center gap-2">
            <input
              id="typography-chars-per-line"
              type="number"
              min={1}
              step={1}
              value={charsPerLine}
              disabled={autoCharsPerLine}
              onChange={(e) => onCharsPerLineChange(Number(e.target.value))}
              className={clsx(
                "w-24 px-3 py-2 border border-border-secondary rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent",
                autoCharsPerLine && "opacity-50 cursor-not-allowed",
              )}
            />
            <span className="text-sm text-foreground-secondary">字</span>
            <span className="ml-auto text-sm text-foreground-secondary">自動</span>
            <SettingsToggle
              id="typography-auto-chars-per-line"
              checked={autoCharsPerLine}
              onChange={onAutoCharsPerLineChange}
              aria-label="1 行あたりの文字数を自動調整"
            />
          </div>
        </SettingsField>
      </SettingsSection>

      <SettingsSection title="その他">
        <SettingsField
          label="段落番号を表示"
          description="各段落に番号を表示します"
          htmlFor="typography-paragraph-numbers"
          inline
        >
          <SettingsToggle
            id="typography-paragraph-numbers"
            checked={showParagraphNumbers}
            onChange={onShowParagraphNumbersChange}
          />
        </SettingsField>

        <SettingsField
          label="自動保存"
          description="変更を 5 秒ごとに自動保存します"
          htmlFor="typography-auto-save"
          inline
        >
          <SettingsToggle
            id="typography-auto-save"
            checked={autoSave}
            onChange={onAutoSaveChange}
          />
        </SettingsField>
      </SettingsSection>
    </div>
  );
}
