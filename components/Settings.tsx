"use client";

import { useState } from "react";
import clsx from "clsx";
import ColorPicker from "./ColorPicker";
import { DEFAULT_POS_COLORS } from "@/packages/milkdown-plugin-japanese-novel/pos-highlight/pos-colors";
import { PRESET_LABELS, PRESET_DESCRIPTIONS, getPresetOptions } from "@/packages/milkdown-plugin-japanese-novel/pos-highlight/merge-presets";
import type { TokenizePreset, TokenMergeOptions } from "@/packages/milkdown-plugin-japanese-novel/pos-highlight/types";

interface SettingsProps {
  // 構文ハイライト設定
  posHighlightEnabled: boolean;
  onPosHighlightEnabledChange: (enabled: boolean) => void;
  posHighlightColors: Record<string, string>;
  onPosHighlightColorsChange: (colors: Record<string, string>) => void;
  
  // 分詞設定（新增）
  tokenizePreset: TokenizePreset;
  onTokenizePresetChange: (preset: TokenizePreset) => void;
  mergeOptions: TokenMergeOptions;
  onMergeOptionsChange: (options: TokenMergeOptions) => void;
}

type SettingsTab = 'highlight' | 'general';

export default function Settings({
  posHighlightEnabled,
  onPosHighlightEnabledChange,
  posHighlightColors,
  onPosHighlightColorsChange,
  tokenizePreset,
  onTokenizePresetChange,
  mergeOptions,
  onMergeOptionsChange,
}: SettingsProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('highlight');
  const [showHighlightSection, setShowHighlightSection] = useState(false);
  const [showColorSettings, setShowColorSettings] = useState(false);

  const handleColorChange = (key: string, color: string) => {
    onPosHighlightColorsChange({
      ...posHighlightColors,
      [key]: color,
    });
  };

  const handleResetColors = () => {
    onPosHighlightColorsChange({});
  };

  const handlePresetChange = (preset: TokenizePreset) => {
    onTokenizePresetChange(preset);
    if (preset !== 'custom') {
      // 自動更新合併選項
      const options = getPresetOptions(preset);
      onMergeOptionsChange(options);
    }
  };

  const handleMergeOptionChange = (key: keyof TokenMergeOptions, value: boolean | number) => {
    onMergeOptionsChange({
      ...mergeOptions,
      [key]: value,
    });
    // 切換到カスタム模式
    if (tokenizePreset !== 'custom') {
      onTokenizePresetChange('custom');
    }
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* タブ */}
      <div className="flex-shrink-0 border-b border-border">
        <div className="flex">
          <button
            onClick={() => setActiveTab('highlight')}
            className={clsx(
              "flex-1 px-4 py-3 text-sm font-medium transition-colors",
              activeTab === 'highlight'
                ? "text-foreground border-b-2 border-accent"
                : "text-foreground-secondary hover:text-foreground"
            )}
          >
            構文ハイライト
          </button>
          <button
            onClick={() => setActiveTab('general')}
            className={clsx(
              "flex-1 px-4 py-3 text-sm font-medium transition-colors",
              activeTab === 'general'
                ? "text-foreground border-b-2 border-accent"
                : "text-foreground-secondary hover:text-foreground"
            )}
          >
            一般設定
          </button>
        </div>
      </div>

      {/* 内容 */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'highlight' && (
          <div className="space-y-6">
            {/* 構文ハイライトセクション（可折叠） */}
            <div className="border border-border rounded-lg">
              {/* セクションヘッダー */}
              <button
                onClick={() => setShowHighlightSection(!showHighlightSection)}
                className="w-full flex items-center justify-between p-4 hover:bg-hover transition-colors rounded-t-lg"
              >
                <h2 className="text-base font-medium text-foreground">構文ハイライト</h2>
                <span className={clsx("transition-transform text-foreground-secondary", showHighlightSection && "rotate-90")}>
                  ▶
                </span>
              </button>

              {/* セクション内容 */}
              {showHighlightSection && (
                <div className="px-4 pb-4 space-y-6 border-t border-border">
                  {/* 開關 */}
                  <div className="flex items-center justify-between pt-4">
                    <div>
                      <h3 className="text-sm font-medium text-foreground">構文ハイライトを有効化</h3>
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

                  {/* 分詞粒度選択 */}
                  <div className="space-y-3">
                    <div>
                      <h3 className="text-sm font-medium text-foreground mb-1">分詞粒度</h3>
                      <p className="text-xs text-foreground-tertiary">
                        テキストをどのように分割するか選択
                      </p>
                    </div>

                    <div className="space-y-2">
                      {(['fine', 'medium', 'coarse', 'custom'] as TokenizePreset[]).map((preset) => (
                        <button
                          key={preset}
                          onClick={() => handlePresetChange(preset)}
                          className={clsx(
                            "w-full text-left px-3 py-2 rounded-lg border transition-colors",
                            tokenizePreset === preset
                              ? "border-accent bg-accent/10"
                              : "border-border hover:border-accent/50 hover:bg-hover"
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <div
                              className={clsx(
                                "w-4 h-4 rounded-full border-2 flex items-center justify-center",
                                tokenizePreset === preset
                                  ? "border-accent"
                                  : "border-border-secondary"
                              )}
                            >
                              {tokenizePreset === preset && (
                                <div className="w-2 h-2 rounded-full bg-accent" />
                              )}
                            </div>
                            <div className="flex-1">
                              <div className="text-sm font-medium text-foreground">
                                {PRESET_LABELS[preset]}
                              </div>
                              <div className="text-xs text-foreground-tertiary">
                                {PRESET_DESCRIPTIONS[preset]}
                              </div>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* カスタム詳細設定 */}
                  {tokenizePreset === 'custom' && (
                    <div className="space-y-3 pt-3 border-t border-border">
                      <h4 className="text-sm font-medium text-foreground">詳細設定</h4>

                      <div className="space-y-2">
                        <label className="flex items-center justify-between text-sm">
                          <span className="text-foreground-secondary">助詞を結合</span>
                          <input
                            type="checkbox"
                            checked={mergeOptions.mergeParticles}
                            onChange={(e) => handleMergeOptionChange('mergeParticles', e.target.checked)}
                            className="w-4 h-4"
                          />
                        </label>

                        <label className="flex items-center justify-between text-sm">
                          <span className="text-foreground-secondary">動詞+助動詞を結合</span>
                          <input
                            type="checkbox"
                            checked={mergeOptions.mergeVerbAuxiliary}
                            onChange={(e) => handleMergeOptionChange('mergeVerbAuxiliary', e.target.checked)}
                            className="w-4 h-4"
                          />
                        </label>

                        <label className="flex items-center justify-between text-sm">
                          <span className="text-foreground-secondary">形容詞+助動詞を結合</span>
                          <input
                            type="checkbox"
                            checked={mergeOptions.mergeAdjectiveAux}
                            onChange={(e) => handleMergeOptionChange('mergeAdjectiveAux', e.target.checked)}
                            className="w-4 h-4"
                          />
                        </label>

                        <label className="flex items-center justify-between text-sm">
                          <span className="text-foreground-secondary">副詞+助詞を結合</span>
                          <input
                            type="checkbox"
                            checked={mergeOptions.mergeAdverbParticle}
                            onChange={(e) => handleMergeOptionChange('mergeAdverbParticle', e.target.checked)}
                            className="w-4 h-4"
                          />
                        </label>

                        <label className="flex items-center justify-between text-sm">
                          <span className="text-foreground-secondary">名詞+接尾詞を結合</span>
                          <input
                            type="checkbox"
                            checked={mergeOptions.mergeNounSuffix}
                            onChange={(e) => handleMergeOptionChange('mergeNounSuffix', e.target.checked)}
                            className="w-4 h-4"
                          />
                        </label>
                      </div>
                    </div>
                  )}

                  {/* ハイライト色の設定 */}
                  <div>
                    <button
                      onClick={() => setShowColorSettings(!showColorSettings)}
                      className="w-full flex items-center justify-between text-sm font-medium text-foreground hover:text-accent transition-colors"
                    >
                      <span>ハイライト色の設定</span>
                      <span className={clsx("transition-transform", showColorSettings && "rotate-90")}>
                        ▶
                      </span>
                    </button>

                    {showColorSettings && (
                      <div className="mt-3 space-y-3">
                        {Object.entries(DEFAULT_POS_COLORS).map(([key, defaultColor]) => {
                          if (key === '記号' || key === '名詞') return null;
                          const currentColor = posHighlightColors[key] || defaultColor;
                          
                          return (
                            <div key={key} className="flex items-center justify-between">
                              <span className="text-sm text-foreground-secondary">{key}</span>
                              <ColorPicker
                                value={currentColor}
                                onChange={(color) => handleColorChange(key, color)}
                              />
                            </div>
                          );
                        })}

                        <button
                          onClick={handleResetColors}
                          className="w-full mt-2 py-2 text-xs text-foreground-secondary hover:text-foreground border border-border-secondary rounded hover:border-accent transition-colors"
                        >
                          デフォルトに戻す
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'general' && (
          <div className="space-y-4">
            <p className="text-sm text-foreground-secondary">一般設定は開発中です</p>
          </div>
        )}
      </div>
    </div>
  );
}
