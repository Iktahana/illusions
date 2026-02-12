"use client";

import { useState, useEffect, useRef } from "react";
import { X } from "lucide-react";
import ColorPicker from "./ColorPicker";
import { DEFAULT_POS_COLORS } from "@/packages/milkdown-plugin-japanese-novel/pos-highlight/pos-colors";
import clsx from "clsx";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  // Editor settings
  fontScale: number;
  onFontScaleChange: (value: number) => void;
  lineHeight: number;
  onLineHeightChange: (value: number) => void;
  paragraphSpacing: number;
  onParagraphSpacingChange: (value: number) => void;
  textIndent: number;
  onTextIndentChange: (value: number) => void;
  fontFamily: string;
  onFontFamilyChange: (value: string) => void;
  charsPerLine: number;
  onCharsPerLineChange: (value: number) => void;
  showParagraphNumbers: boolean;
  onShowParagraphNumbersChange: (value: boolean) => void;
  // Vertical scroll settings
  verticalScrollBehavior: "auto" | "mouse" | "trackpad";
  onVerticalScrollBehaviorChange: (value: "auto" | "mouse" | "trackpad") => void;
  scrollSensitivity: number;
  onScrollSensitivityChange: (value: number) => void;
  // POS highlight settings
  posHighlightEnabled: boolean;
  onPosHighlightEnabledChange: (value: boolean) => void;
  posHighlightColors: Record<string, string>;
  onPosHighlightColorsChange: (value: Record<string, string>) => void;
}

type SettingsCategory = "editor" | "vertical" | "pos-highlight";

const FONT_FAMILIES = [
  { value: "Noto Serif JP", label: "Noto Serif JP" },
  { value: "Noto Sans JP", label: "Noto Sans JP" },
  { value: "Shippori Mincho", label: "Shippori Mincho" },
  { value: "Zen Old Mincho", label: "Zen Old Mincho" },
  { value: "BIZ UDMincho", label: "BIZ UDMincho" },
  { value: "Klee One", label: "Klee One" },
];

const SCROLL_BEHAVIORS = [
  {
    value: "auto" as const,
    label: "自動検出",
    description: "マウスとトラックパッドを自動的に判別します",
  },
  {
    value: "mouse" as const,
    label: "マウス優先",
    description: "常にマウスホイールとして処理します（縦回転→横スクロール）",
  },
  {
    value: "trackpad" as const,
    label: "トラックパッド優先",
    description: "常にトラックパッドとして処理します（自然なスクロール方向を維持）",
  },
];

export default function SettingsModal({
  isOpen,
  onClose,
  fontScale,
  onFontScaleChange,
  lineHeight,
  onLineHeightChange,
  paragraphSpacing,
  onParagraphSpacingChange,
  textIndent,
  onTextIndentChange,
  fontFamily,
  onFontFamilyChange,
  charsPerLine,
  onCharsPerLineChange,
  showParagraphNumbers,
  onShowParagraphNumbersChange,
  verticalScrollBehavior,
  onVerticalScrollBehaviorChange,
  scrollSensitivity,
  onScrollSensitivityChange,
  posHighlightEnabled,
  onPosHighlightEnabledChange,
  posHighlightColors,
  onPosHighlightColorsChange,
}: SettingsModalProps) {
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>("editor");
  const modalRef = useRef<HTMLDivElement>(null);

  // Body scroll lock
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [isOpen]);

  // Escape key handler
  useEffect(() => {
    function handleEscape(e: KeyboardEvent): void {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>): void {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  function handleResetColors(): void {
    onPosHighlightColorsChange({});
  }

  // Get effective color (user custom or default)
  function getEffectiveColor(key: string): string {
    return posHighlightColors[key] || DEFAULT_POS_COLORS[key] || "#000000";
  }

  // Filter POS types: skip 記号, 名詞, and sub-types with `-`
  const posTypes = Object.keys(DEFAULT_POS_COLORS).filter(
    (key) => key !== "記号" && key !== "名詞" && !key.includes("-")
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
      onClick={handleOverlayClick}
    >
      <div
        ref={modalRef}
        className="relative w-full max-w-4xl h-[80vh] mx-4 rounded-xl bg-background-elevated/80 backdrop-blur-xl shadow-xl border border-border/50 flex flex-col"
      >
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-medium text-foreground">設定</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-hover text-foreground-secondary hover:text-foreground transition-colors"
            aria-label="閉じる"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 2-column layout */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left navigation */}
          <div className="w-48 flex-shrink-0 border-r border-border bg-background/50 p-2">
            <nav className="space-y-1">
              <button
                onClick={() => setActiveCategory("editor")}
                className={clsx(
                  "w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  activeCategory === "editor"
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground-secondary hover:bg-hover hover:text-foreground"
                )}
              >
                エディタ
              </button>
              <button
                onClick={() => setActiveCategory("vertical")}
                className={clsx(
                  "w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  activeCategory === "vertical"
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground-secondary hover:bg-hover hover:text-foreground"
                )}
              >
                縦書き
              </button>
              <button
                onClick={() => setActiveCategory("pos-highlight")}
                className={clsx(
                  "w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  activeCategory === "pos-highlight"
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground-secondary hover:bg-hover hover:text-foreground"
                )}
              >
                品詞ハイライト
              </button>
            </nav>
          </div>

          {/* Right content */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* Editor section */}
            {activeCategory === "editor" && (
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
                    {FONT_FAMILIES.map((font) => (
                      <option key={font.value} value={font.value}>
                        {font.label}
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
                    1行あたりの文字数
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={charsPerLine}
                      onChange={(e) => onCharsPerLineChange(Number(e.target.value))}
                      className="w-24 px-3 py-2 border border-border-secondary rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                    <span className="text-sm text-foreground-secondary">字</span>
                  </div>
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
                      "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
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
              </div>
            )}

            {/* Vertical section */}
            {activeCategory === "vertical" && (
              <div className="space-y-6">
                {/* Scroll behavior */}
                <div>
                  <h3 className="text-sm font-medium text-foreground mb-3">
                    スクロール動作
                  </h3>
                  <div className="space-y-2">
                    {SCROLL_BEHAVIORS.map((behavior) => (
                      <button
                        key={behavior.value}
                        onClick={() => onVerticalScrollBehaviorChange(behavior.value)}
                        className={clsx(
                          "w-full text-left px-3 py-2 rounded-lg border transition-colors",
                          verticalScrollBehavior === behavior.value
                            ? "border-accent bg-accent/10"
                            : "border-border hover:border-accent/50 hover:bg-hover"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className={clsx(
                              "w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0",
                              verticalScrollBehavior === behavior.value
                                ? "border-accent"
                                : "border-border-secondary"
                            )}
                          >
                            {verticalScrollBehavior === behavior.value && (
                              <div className="w-2 h-2 rounded-full bg-accent" />
                            )}
                          </div>
                          <div className="flex-1">
                            <div className="text-sm font-medium text-foreground">
                              {behavior.label}
                            </div>
                            <div className="text-xs text-foreground-tertiary">
                              {behavior.description}
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Scroll sensitivity */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    スクロール感度: {scrollSensitivity.toFixed(1)}x
                  </label>
                  <input
                    type="range"
                    min={0.2}
                    max={3.0}
                    step={0.1}
                    value={scrollSensitivity}
                    onChange={(e) => onScrollSensitivityChange(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
              </div>
            )}

            {/* POS highlight section */}
            {activeCategory === "pos-highlight" && (
              <div className="space-y-6">
                {/* Toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-foreground">
                      品詞ハイライトを有効化
                    </h3>
                    <p className="text-xs text-foreground-tertiary mt-0.5">
                      動詞・助詞などを色分け表示
                    </p>
                  </div>
                  <button
                    onClick={() => onPosHighlightEnabledChange(!posHighlightEnabled)}
                    className={clsx(
                      "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                      posHighlightEnabled ? "bg-accent" : "bg-border-secondary"
                    )}
                  >
                    <span
                      className={clsx(
                        "inline-block h-4 w-4 transform rounded-full bg-background transition-transform",
                        posHighlightEnabled ? "translate-x-6" : "translate-x-1"
                      )}
                    />
                  </button>
                </div>

                {/* Color pickers */}
                {posHighlightEnabled && (
                  <div className="space-y-4 pt-4 border-t border-border">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium text-foreground">品詞の色</h4>
                      <button
                        onClick={handleResetColors}
                        className="text-xs text-accent hover:text-accent-hover transition-colors"
                      >
                        デフォルトに戻す
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      {posTypes.map((posType) => (
                        <ColorPicker
                          key={posType}
                          label={posType}
                          value={getEffectiveColor(posType)}
                          onChange={(color) => {
                            onPosHighlightColorsChange({
                              ...posHighlightColors,
                              [posType]: color,
                            });
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
