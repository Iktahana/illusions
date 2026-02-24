"use client";

import clsx from "clsx";
import { FontSelector } from "./FontSelector";
import { useTypographySettings } from "@/contexts/EditorSettingsContext";

/** Panel for adjusting typography and display settings */
export function StylePanel() {
  const {
    fontScale, lineHeight, paragraphSpacing, textIndent, fontFamily,
    charsPerLine, autoCharsPerLine, showParagraphNumbers,
    onFontScaleChange, onLineHeightChange, onParagraphSpacingChange,
    onTextIndentChange, onFontFamilyChange, onCharsPerLineChange,
    onAutoCharsPerLineChange, onShowParagraphNumbersChange,
  } = useTypographySettings();

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground-secondary mb-2">
          フォント
        </label>
        <FontSelector
          value={fontFamily}
          onChange={(font) => onFontFamilyChange(font)}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground-secondary mb-2">
          文字サイズ
        </label>
        <input
          type="range"
          min="50"
          max="200"
          step="5"
          value={fontScale}
          onChange={(e) => onFontScaleChange(Number(e.target.value))}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-foreground-tertiary mt-1">
          <span>50%</span>
          <span>{fontScale}%</span>
          <span>200%</span>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground-secondary mb-2">
          行間
        </label>
        <input
          type="range"
          min="1.5"
          max="2.5"
          step="0.1"
          value={lineHeight}
          onChange={(e) => onLineHeightChange(Number(e.target.value))}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-foreground-tertiary mt-1">
          <span>狭い</span>
          <span>{lineHeight.toFixed(1)}</span>
          <span>広い</span>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground-secondary mb-2">
          段落間
        </label>
        <input
          type="range"
          min="0"
          max="2"
          step="0.1"
          value={paragraphSpacing}
          onChange={(e) => onParagraphSpacingChange(Number(e.target.value))}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-foreground-tertiary mt-1">
          <span>なし</span>
          <span>{paragraphSpacing.toFixed(1)}em</span>
          <span>広い</span>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground-secondary mb-2">
          字下げ
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0"
            step="0.5"
            value={textIndent}
            onChange={(e) => onTextIndentChange(Number(e.target.value))}
            className="w-20 px-3 py-2 text-sm border border-border-secondary rounded focus:outline-none focus:ring-2 focus:ring-accent bg-background text-foreground"
          />
          <span className="text-sm text-foreground-secondary">字</span>
        </div>
        <p className="text-xs text-foreground-tertiary mt-1">
          段落の先頭にインデントを適用します
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground-secondary mb-2">
          1行あたりの文字数制限
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="1"
            step="1"
            value={charsPerLine}
            disabled={autoCharsPerLine}
            onChange={(e) => onCharsPerLineChange(Number(e.target.value))}
            className={clsx(
              "w-20 px-3 py-2 text-sm border border-border-secondary rounded focus:outline-none focus:ring-2 focus:ring-accent bg-background text-foreground",
              autoCharsPerLine && "opacity-50 cursor-not-allowed"
            )}
          />
          <span className="text-sm text-foreground-secondary">字</span>
          <span className="text-sm text-foreground-secondary ml-auto">自動</span>
          <button
            onClick={() => onAutoCharsPerLineChange(!autoCharsPerLine)}
            className={clsx(
              "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
              autoCharsPerLine ? "bg-accent" : "bg-border-secondary"
            )}
          >
            <span
              className={clsx(
                "inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm",
                autoCharsPerLine ? "translate-x-6" : "translate-x-1"
              )}
            />
          </button>
        </div>
        <p className="text-xs text-foreground-tertiary mt-1">
          {autoCharsPerLine
            ? 'ウィンドウサイズに応じて自動調整します（最大40字）'
            : '1行（縦書きの場合は1列）あたりの最大文字数'}
        </p>
      </div>

      <div>
        <label className="flex items-center justify-between text-sm font-medium text-foreground-secondary mb-2">
          <span>段落番号</span>
          <button
            onClick={() => onShowParagraphNumbersChange(!showParagraphNumbers)}
            className={clsx(
              "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2",
              showParagraphNumbers ? "bg-accent" : "bg-border-secondary"
            )}
          >
            <span
              className={clsx(
                "inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm",
                showParagraphNumbers ? "translate-x-6" : "translate-x-1"
              )}
            />
          </button>
        </label>
        <p className="text-xs text-foreground-tertiary mt-1">
          段落の先頭に番号を表示します
        </p>
      </div>
    </div>
  );
}
