"use client";

import { useState, useEffect, useRef } from "react";
import { X, Settings, Columns2, Highlighter, SpellCheck, BatteryMedium, AudioLines, Keyboard } from "lucide-react";
import AboutSection from "./SettingsModal/AboutSection";
import dynamic from "next/dynamic";

import { isElectronRenderer } from "@/lib/utils/runtime-env";
import { DEFAULT_POS_COLORS } from "@/packages/milkdown-plugin-japanese-novel/pos-highlight/pos-colors";
import { FEATURED_JAPANESE_FONTS } from "@/lib/utils/fonts";
import {
  useTypographySettings,
  useLintingSettings,
  useCharacterExtractionSettings,
  usePosHighlightSettings,
  useScrollSettings,
  usePowerSettings,
  useUISettings,
  useSpeechSettings,
} from "@/contexts/EditorSettingsContext";
import ColorPicker from "./ColorPicker";
import LintingSettings from "./LintingSettings";
import KeymapSettings from "./KeymapSettings";

const PosHighlightPreview = dynamic(() => import("./PosHighlightPreview"), {
  ssr: false,
});
import clsx from "clsx";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Open modal on a specific tab */
  initialCategory?: SettingsCategory;
}

export type SettingsCategory = "editor" | "vertical" | "pos-highlight" | "linting" | "speech" | "keymap" | "power" | "about";

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
  initialCategory,
}: SettingsModalProps) {
  const {
    fontScale, lineHeight, paragraphSpacing, textIndent, fontFamily,
    charsPerLine, autoCharsPerLine, showParagraphNumbers,
    onFontScaleChange, onLineHeightChange, onParagraphSpacingChange,
    onTextIndentChange, onFontFamilyChange, onCharsPerLineChange,
    onAutoCharsPerLineChange, onShowParagraphNumbersChange,
  } = useTypographySettings();
  const { autoSave, onAutoSaveChange } = useUISettings();
  const {
    verticalScrollBehavior, scrollSensitivity,
    onVerticalScrollBehaviorChange, onScrollSensitivityChange,
  } = useScrollSettings();
  const {
    posHighlightEnabled, posHighlightColors,
    onPosHighlightEnabledChange, onPosHighlightColorsChange,
  } = usePosHighlightSettings();
  const {
    lintingEnabled, lintingRuleConfigs, correctionConfig,
    onLintingEnabledChange, onLintingRuleConfigChange,
    onLintingRuleConfigsBatchChange, onCorrectionConfigChange,
  } = useLintingSettings();
  const {
    characterExtractionBatchSize, characterExtractionConcurrency,
    onCharacterExtractionBatchSizeChange, onCharacterExtractionConcurrencyChange,
  } = useCharacterExtractionSettings();
  const {
    powerSaveMode, autoPowerSaveOnBattery,
    onPowerSaveModeChange, onAutoPowerSaveOnBatteryChange,
  } = usePowerSettings();
  const {
    speechVoiceURI, speechRate, speechPitch, speechVolume,
    onSpeechVoiceURIChange, onSpeechRateChange,
    onSpeechPitchChange, onSpeechVolumeChange,
  } = useSpeechSettings();
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>(initialCategory ?? "editor");
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const modalRef = useRef<HTMLDivElement>(null);

  // Load available Japanese voices (may arrive asynchronously)
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices().filter((v) => v.lang === "ja-JP");
      setAvailableVoices(voices);
    };
    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
    };
  }, []);

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
                onClick={() => setActiveCategory("speech")}
                className={clsx(
                  "w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5",
                  activeCategory === "speech"
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground-secondary hover:bg-hover hover:text-foreground"
                )}
              >
                <AudioLines className="w-4 h-4" />
                聴写/朗読
              </button>
              <button
                onClick={() => setActiveCategory("keymap")}
                className={clsx(
                  "w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5",
                  activeCategory === "keymap"
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground-secondary hover:bg-hover hover:text-foreground"
                )}
              >
                <Keyboard className="w-4 h-4" />
                キーマップ
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
                        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
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
                characterExtractionBatchSize={characterExtractionBatchSize}
                onCharacterExtractionBatchSizeChange={onCharacterExtractionBatchSizeChange}
                characterExtractionConcurrency={characterExtractionConcurrency}
                onCharacterExtractionConcurrencyChange={onCharacterExtractionConcurrencyChange}
                correctionConfig={correctionConfig}
                onCorrectionConfigChange={onCorrectionConfigChange}
              />
            )}

            {/* Speech / TTS section */}
            {activeCategory === "speech" && (
              <div className="space-y-8 p-6">
                {/* 聴写 section */}
                <div>
                  <h3 className="text-lg font-semibold text-foreground mb-1">聴写</h3>
                  <p className="text-sm text-foreground-tertiary">
                    音声認識による入力機能は今後のアップデートで追加予定です。
                  </p>
                </div>

                <div className="border-t border-border" />

                {/* 朗読 section */}
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground mb-1">朗読</h3>
                    <p className="text-sm text-foreground-secondary mb-4">
                      テキストの読み上げ（Text-to-Speech）の設定を調整します。
                    </p>
                  </div>

                  {/* Voice selection */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      音声
                    </label>
                    <select
                      value={speechVoiceURI}
                      onChange={(e) => onSpeechVoiceURIChange(e.target.value)}
                      className="w-full px-3 py-2 border border-border-secondary rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                    >
                      <option value="">自動（デフォルト）</option>
                      {availableVoices.map((voice) => (
                        <option key={voice.voiceURI} value={voice.voiceURI}>
                          {voice.name}
                        </option>
                      ))}
                    </select>
                    {availableVoices.length === 0 && (
                      <p className="text-xs text-foreground-tertiary mt-1">
                        日本語の音声が見つかりません。OSの音声設定をご確認ください。
                      </p>
                    )}
                  </div>

                  {/* Rate slider */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      速度 <span className="text-foreground-tertiary font-normal">({speechRate.toFixed(1)}x)</span>
                    </label>
                    <input
                      type="range"
                      min={0.5}
                      max={2.0}
                      step={0.1}
                      value={speechRate}
                      onChange={(e) => onSpeechRateChange(parseFloat(e.target.value))}
                      className="w-full accent-accent"
                    />
                    <div className="flex justify-between text-xs text-foreground-tertiary mt-1">
                      <span>0.5x（遅い）</span>
                      <span>2.0x（速い）</span>
                    </div>
                  </div>

                  {/* Pitch slider */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      ピッチ <span className="text-foreground-tertiary font-normal">({speechPitch.toFixed(1)})</span>
                    </label>
                    <input
                      type="range"
                      min={0.5}
                      max={2.0}
                      step={0.1}
                      value={speechPitch}
                      onChange={(e) => onSpeechPitchChange(parseFloat(e.target.value))}
                      className="w-full accent-accent"
                    />
                    <div className="flex justify-between text-xs text-foreground-tertiary mt-1">
                      <span>0.5（低い）</span>
                      <span>2.0（高い）</span>
                    </div>
                  </div>

                  {/* Volume slider */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      音量 <span className="text-foreground-tertiary font-normal">({Math.round(speechVolume * 100)}%)</span>
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.1}
                      value={speechVolume}
                      onChange={(e) => onSpeechVolumeChange(parseFloat(e.target.value))}
                      className="w-full accent-accent"
                    />
                    <div className="flex justify-between text-xs text-foreground-tertiary mt-1">
                      <span>0%</span>
                      <span>100%</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Keymap section */}
            {activeCategory === "keymap" && (
              <div className="p-6">
                <h3 className="text-lg font-semibold text-foreground mb-1">キーマップ</h3>
                <KeymapSettings />
              </div>
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
                <div className="mt-4">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoPowerSaveOnBattery ?? true}
                      onChange={(e) => onAutoPowerSaveOnBatteryChange?.(e.target.checked)}
                      className="w-4 h-4 rounded border-border accent-accent"
                    />
                    <span className="text-sm font-medium text-foreground">バッテリー駆動時に自動で省電力モードを提案する</span>
                  </label>
                </div>
                <div className="text-xs text-foreground-secondary space-y-1">
                  <p>• AC電源接続時に自動的に省電力モードを解除します</p>
                  <p>• 省電力モードを解除すると、以前の校正・AI設定が復元されます</p>
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

