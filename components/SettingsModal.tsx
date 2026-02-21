"use client";

import { useState, useEffect, useRef } from "react";
import { X, ExternalLink, ChevronDown, ChevronRight, Sparkles, Settings, Columns2, Highlighter, SpellCheck, BatteryMedium } from "lucide-react";
import type { Severity } from "@/lib/linting/types";
import dynamic from "next/dynamic";

import { isElectronRenderer } from "@/lib/runtime-env";
import { DEFAULT_POS_COLORS } from "@/packages/milkdown-plugin-japanese-novel/pos-highlight/pos-colors";
import { FEATURED_JAPANESE_FONTS } from "@/lib/fonts";
import ColorPicker from "./ColorPicker";
import LintingSettings from "./LintingSettings";
import { LlmSettings } from "./LlmSettings";
import { DEFAULT_MODEL_ID } from "@/lib/llm-client/model-registry";

const PosHighlightPreview = dynamic(() => import("./PosHighlightPreview"), {
  ssr: false,
});
const LICENSE_TEXT = process.env.NEXT_PUBLIC_LICENSE_TEXT || "";
const TERMS_TEXT = process.env.NEXT_PUBLIC_TERMS_TEXT || "";

/** Display version: show full version for CI builds (x.y.z where z > 0), otherwise first two parts */
const APP_VERSION = (() => {
  const v = process.env.NEXT_PUBLIC_APP_VERSION || "0.0.0";
  const parts = v.split(".");
  if (parts.length >= 3 && parts[2] !== "0") return v;
  return parts.slice(0, 2).join(".");
})();
import clsx from "clsx";

interface CreditEntry {
  name: string;
  version: string;
  license: string;
  repository: string;
}

let creditsData: CreditEntry[] = [];
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  creditsData = require("@/generated/credits.json") as CreditEntry[];
} catch {
  // credits.json may not exist yet (before running generate:credits)
}

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
  autoCharsPerLine: boolean;
  onAutoCharsPerLineChange: (value: boolean) => void;
  showParagraphNumbers: boolean;
  onShowParagraphNumbersChange: (value: boolean) => void;
  autoSave: boolean;
  onAutoSaveChange: (value: boolean) => void;
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
  // Linting settings
  lintingEnabled?: boolean;
  onLintingEnabledChange?: (value: boolean) => void;
  lintingRuleConfigs?: Record<string, { enabled: boolean; severity: Severity }>;
  onLintingRuleConfigChange?: (ruleId: string, config: { enabled: boolean; severity: Severity }) => void;
  onLintingRuleConfigsBatchChange?: (configs: Record<string, { enabled: boolean; severity: Severity }>) => void;
  // LLM settings
  llmEnabled?: boolean;
  onLlmEnabledChange?: (value: boolean) => void;
  llmModelId?: string;
  onLlmModelIdChange?: (modelId: string) => void;
  // Power saving (Electron only)
  powerSaveMode?: boolean;
  onPowerSaveModeChange?: (value: boolean) => void;
  /** Open modal on a specific tab */
  initialCategory?: SettingsCategory;
}

export type SettingsCategory = "editor" | "vertical" | "pos-highlight" | "linting" | "llm" | "power" | "about";

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
  autoCharsPerLine,
  onAutoCharsPerLineChange,
  showParagraphNumbers,
  onShowParagraphNumbersChange,
  autoSave,
  onAutoSaveChange,
  verticalScrollBehavior,
  onVerticalScrollBehaviorChange,
  scrollSensitivity,
  onScrollSensitivityChange,
  posHighlightEnabled,
  onPosHighlightEnabledChange,
  posHighlightColors,
  onPosHighlightColorsChange,
  lintingEnabled = false,
  onLintingEnabledChange,
  lintingRuleConfigs = {},
  onLintingRuleConfigChange,
  onLintingRuleConfigsBatchChange,
  llmEnabled,
  onLlmEnabledChange,
  llmModelId,
  onLlmModelIdChange,
  powerSaveMode,
  onPowerSaveModeChange,
  initialCategory,
}: SettingsModalProps) {
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>(initialCategory ?? "editor");
  const modalRef = useRef<HTMLDivElement>(null);

  // Sync initialCategory when modal opens
  useEffect(() => {
    if (isOpen && initialCategory) {
      setActiveCategory(initialCategory);
    }
  }, [isOpen, initialCategory]);

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

  const posColorItems = [
    { key: "名詞", label: "名詞" },
    { key: "動詞", label: "動詞" },
    { key: "動詞-自立", label: "└ 自立" },
    { key: "動詞-非自立", label: "└ 非自立" },
    { key: "形容詞", label: "形容詞" },
    { key: "副詞", label: "副詞" },
    { key: "助詞", label: "助詞" },
    { key: "助動詞", label: "助動詞" },
    { key: "接続詞", label: "接続詞" },
    { key: "連体詞", label: "連体詞" },
    { key: "感動詞", label: "感動詞" },
    { key: "記号", label: "記号" },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
      onClick={handleOverlayClick}
    >
      <div
        ref={modalRef}
        className={clsx(
          "relative w-full h-[80vh] mx-4 rounded-xl bg-background-elevated shadow-xl border border-border flex flex-col transition-[max-width] duration-200",
          activeCategory === "pos-highlight" ? "max-w-6xl" : "max-w-4xl"
        )}
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
          <div className="w-48 flex-shrink-0 border-r border-border bg-background-secondary p-2">
            <nav className="space-y-1">
              <button
                onClick={() => setActiveCategory("editor")}
                className={clsx(
                  "w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5",
                  activeCategory === "editor"
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground-secondary hover:bg-hover hover:text-foreground"
                )}
              >
                <Settings className="w-4 h-4" />
                エディタ
              </button>
              <button
                onClick={() => setActiveCategory("vertical")}
                className={clsx(
                  "w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5",
                  activeCategory === "vertical"
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground-secondary hover:bg-hover hover:text-foreground"
                )}
              >
                <Columns2 className="w-4 h-4" />
                縦書き
              </button>
              <button
                onClick={() => setActiveCategory("pos-highlight")}
                className={clsx(
                  "w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5",
                  activeCategory === "pos-highlight"
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground-secondary hover:bg-hover hover:text-foreground"
                )}
              >
                <Highlighter className="w-4 h-4" />
                品詞ハイライト
              </button>
              <button
                onClick={() => setActiveCategory("linting")}
                className={clsx(
                  "w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5",
                  activeCategory === "linting"
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground-secondary hover:bg-hover hover:text-foreground"
                )}
              >
                <SpellCheck className="w-4 h-4" />
                校正
              </button>
              <button
                onClick={() => setActiveCategory("llm")}
                className={clsx(
                  "w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5",
                  activeCategory === "llm"
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground-secondary hover:bg-hover hover:text-foreground"
                )}
              >
                <Sparkles className="w-4 h-4" />
                AI機能
              </button>
              {isElectronRenderer() && (
                <button
                  onClick={() => setActiveCategory("power")}
                  className={clsx(
                    "w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5",
                    activeCategory === "power"
                      ? "bg-accent text-accent-foreground"
                      : "text-foreground-secondary hover:bg-hover hover:text-foreground"
                  )}
                >
                  <BatteryMedium className="w-4 h-4" />
                  省電力
                </button>
              )}
              <div className="my-2 border-t border-border" />
              <button
                onClick={() => setActiveCategory("about")}
                className={clsx(
                  "w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  activeCategory === "about"
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground-secondary hover:bg-hover hover:text-foreground"
                )}
              >
                illusionsについて
              </button>
            </nav>
          </div>

          {/* Right content */}
          <div className={clsx(
            "flex-1 p-6",
            activeCategory === "pos-highlight" ? "overflow-hidden" : "overflow-y-auto"
          )}>
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
                      "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
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
              <div className="flex gap-6 h-full">
                {/* Left: controls */}
                <div className="w-2/5 overflow-y-auto space-y-6 pr-2">
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
                    <div className="space-y-2">
                      {posColorItems.map(({ key, label }) => (
                        <div key={key} className="flex items-center justify-between">
                          <span className="text-sm text-foreground-secondary">{label}</span>
                          <ColorPicker
                            value={getEffectiveColor(key)}
                            onChange={(color) => {
                              onPosHighlightColorsChange({
                                ...posHighlightColors,
                                [key]: color,
                              });
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right: live preview */}
                <div className="w-3/5 min-h-0">
                  <PosHighlightPreview
                    posHighlightColors={posHighlightColors}
                    posHighlightEnabled={posHighlightEnabled}
                  />
                </div>
              </div>
            )}

            {/* Linting section */}
            {activeCategory === "linting" && (
              <LintingSettings
                lintingEnabled={lintingEnabled}
                onLintingEnabledChange={(v) => onLintingEnabledChange?.(v)}
                lintingRuleConfigs={lintingRuleConfigs}
                onLintingRuleConfigChange={(id, cfg) => onLintingRuleConfigChange?.(id, cfg)}
                onLintingRuleConfigsBatchChange={(cfgs) => onLintingRuleConfigsBatchChange?.(cfgs)}
                llmEnabled={llmEnabled}
              />
            )}

            {/* LLM section */}
            {activeCategory === "llm" && (
              <LlmSettings
                llmEnabled={llmEnabled ?? false}
                onLlmEnabledChange={onLlmEnabledChange}
                llmModelId={llmModelId ?? DEFAULT_MODEL_ID}
                onLlmModelIdChange={onLlmModelIdChange}
              />
            )}

            {/* Power saving section (Electron only) */}
            {activeCategory === "power" && (
              <div className="space-y-6 p-6">
                <div>
                  <h3 className="text-lg font-semibold text-foreground mb-1">省電力モード</h3>
                  <p className="text-sm text-foreground-secondary mb-4">
                    省電力モードを有効にすると、校正機能とAI関連機能が一時的に無効になり、バッテリー消費を抑えます。
                  </p>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={powerSaveMode ?? false}
                      onChange={(e) => onPowerSaveModeChange?.(e.target.checked)}
                      className="w-4 h-4 rounded border-border accent-accent"
                    />
                    <span className="text-sm font-medium text-foreground">省電力モードを有効にする</span>
                  </label>
                </div>
                <div className="text-xs text-foreground-secondary space-y-1">
                  <p>• バッテリー駆動時に自動的に省電力モードの有効化を提案します</p>
                  <p>• AC電源接続時に自動的に省電力モードを解除します</p>
                  <p>• 省電力モード解除時、以前の校正・AI設定が復元されます</p>
                </div>
              </div>
            )}

            {/* About section */}
            {activeCategory === "about" && (
              <AboutSection />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

type AboutTab = "terms" | "license" | "credits";

function AboutSection(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<AboutTab>("terms");
  const [expandedCredits, setExpandedCredits] = useState<Set<string>>(new Set());

  // Group credits by license type
  const creditsByLicense = creditsData.reduce<Record<string, CreditEntry[]>>((acc, entry) => {
    const key = entry.license || "Unknown";
    if (!acc[key]) acc[key] = [];
    acc[key].push(entry);
    return acc;
  }, {});

  function handleExternalLink(e: React.MouseEvent<HTMLAnchorElement>): void {
    const url = e.currentTarget.href;
    if (window.electronAPI?.openExternal) {
      e.preventDefault();
      void window.electronAPI.openExternal(url);
    }
    // Web: default <a target="_blank"> behavior handles it
  }

  function handleToggleLicenseGroup(license: string): void {
    setExpandedCredits((prev) => {
      const next = new Set(prev);
      if (next.has(license)) {
        next.delete(license);
      } else {
        next.add(license);
      }
      return next;
    });
  }

  return (
    <div className="space-y-6">
      {/* App info header */}
      <div className="text-center space-y-2">
        <h3 className="text-2xl font-bold text-foreground">illusions</h3>
        <p className="text-sm text-foreground-secondary">
          バージョン {APP_VERSION}
        </p>
        <p className="text-sm text-foreground-tertiary">
          © {new Date().getFullYear()} 幾田花 (Iktahana). All rights reserved.
        </p>
      </div>

      {/* Links */}
      <div className="flex justify-center gap-4">
        <a
          href="https://www.illusions.app"
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleExternalLink}
          className="inline-flex items-center gap-1.5 text-sm text-accent hover:text-accent-hover transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          www.illusions.app
        </a>
        <a
          href="https://github.com/Iktahana/illusions"
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleExternalLink}
          className="inline-flex items-center gap-1.5 text-sm text-accent hover:text-accent-hover transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          GitHub
        </a>
      </div>

      {/* Tab switcher */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveTab("terms")}
          className={clsx(
            "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
            activeTab === "terms"
              ? "border-accent text-accent"
              : "border-transparent text-foreground-secondary hover:text-foreground"
          )}
        >
          利用規約
        </button>
        <button
          onClick={() => setActiveTab("license")}
          className={clsx(
            "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
            activeTab === "license"
              ? "border-accent text-accent"
              : "border-transparent text-foreground-secondary hover:text-foreground"
          )}
        >
          LICENSE
        </button>
        <button
          onClick={() => setActiveTab("credits")}
          className={clsx(
            "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
            activeTab === "credits"
              ? "border-accent text-accent"
              : "border-transparent text-foreground-secondary hover:text-foreground"
          )}
        >
          CREDITS ({creditsData.length})
        </button>
      </div>

      {/* Tab content */}
      {activeTab === "terms" && (
        <div className="rounded-lg border border-border bg-background-secondary overflow-hidden">
          <div
            className="p-4 text-sm text-foreground-secondary overflow-auto max-h-[40vh] leading-relaxed prose-about"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(TERMS_TEXT) }}
          />
        </div>
      )}

      {activeTab === "license" && (
        <div className="rounded-lg border border-border bg-background-secondary overflow-hidden">
          <pre className="p-4 text-xs text-foreground-secondary overflow-auto max-h-[40vh] whitespace-pre-wrap font-mono leading-relaxed text-center">
            {LICENSE_TEXT.replace(/^ {2,}/gm, "")}
          </pre>
        </div>
      )}

      {activeTab === "credits" && (
        <div className="space-y-2 max-h-[40vh] overflow-y-auto">
          {creditsData.length === 0 ? (
            <p className="text-sm text-foreground-tertiary text-center py-4">
              クレジットデータがありません。<code className="text-xs bg-background px-1 py-0.5 rounded">npm run generate:credits</code> を実行してください。
            </p>
          ) : (
            Object.entries(creditsByLicense)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([license, entries]) => (
                <div key={license} className="border border-border rounded-lg overflow-hidden">
                  <button
                    onClick={() => handleToggleLicenseGroup(license)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-foreground hover:bg-hover transition-colors"
                  >
                    {expandedCredits.has(license) ? (
                      <ChevronDown className="w-4 h-4 flex-shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 flex-shrink-0" />
                    )}
                    <span>{license}</span>
                    <span className="text-foreground-tertiary text-xs ml-auto">
                      {entries.length}
                    </span>
                  </button>
                  {expandedCredits.has(license) && (
                    <div className="border-t border-border divide-y divide-border">
                      {entries.map((entry) => (
                        <div
                          key={`${entry.name}@${entry.version}`}
                          className="px-3 py-1.5 flex items-center justify-between text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-foreground truncate">{entry.name}</span>
                            <span className="text-foreground-tertiary flex-shrink-0">
                              {entry.version}
                            </span>
                          </div>
                          {entry.repository && (
                            <a
                              href={entry.repository}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-accent hover:text-accent-hover flex-shrink-0 ml-2"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
          )}
        </div>
      )}
    </div>
  );
}

/** Lightweight markdown to HTML renderer for simple documents */
function renderMarkdown(md: string): string {
  const escape = (s: string): string =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const lines = md.split("\n");
  const html: string[] = [];
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      if (inList) { html.push("</ul>"); inList = false; }
      html.push('<hr class="my-4 border-border" />');
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,4})\s+(.*)/);
    if (headingMatch) {
      if (inList) { html.push("</ul>"); inList = false; }
      const level = headingMatch[1].length;
      const text = inlineFormat(escape(headingMatch[2]));
      const sizes: Record<number, string> = { 1: "text-lg font-bold", 2: "text-base font-bold", 3: "text-sm font-semibold", 4: "text-sm font-medium" };
      html.push(`<h${level} class="${sizes[level] || "text-sm font-medium"} text-foreground mt-4 mb-2">${text}</h${level}>`);
      continue;
    }

    // List items (*, -)
    const listMatch = line.match(/^(\s*)[*\-]\s+(.*)/);
    if (listMatch) {
      if (!inList) { html.push('<ul class="list-disc pl-5 space-y-1">'); inList = true; }
      const indent = listMatch[1].length >= 4 ? ' class="ml-4"' : "";
      html.push(`<li${indent}>${inlineFormat(escape(listMatch[2]))}</li>`);
      continue;
    }

    // Close list if we hit a non-list line
    if (inList) { html.push("</ul>"); inList = false; }

    // Empty line
    if (line.trim() === "") {
      continue;
    }

    // Paragraph
    html.push(`<p class="mb-2">${inlineFormat(escape(line))}</p>`);
  }

  if (inList) html.push("</ul>");
  return html.join("\n");
}

/** Render inline markdown: bold, links, code */
function inlineFormat(text: string): string {
  // Bold **text**
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong class="text-foreground font-semibold">$1</strong>');
  // Links [text](url)
  text = text.replace(
    /\[(.+?)\]\((.+?)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-accent hover:text-accent-hover underline">$1</a>'
  );
  // Inline code `text`
  text = text.replace(/`(.+?)`/g, '<code class="text-xs bg-background px-1 py-0.5 rounded">$1</code>');
  // Line break (two trailing spaces)
  text = text.replace(/ {2}$/, "<br />");
  return text;
}
