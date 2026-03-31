"use client";

import type React from "react";
import clsx from "clsx";
import dynamic from "next/dynamic";
import { DEFAULT_POS_COLORS } from "@/packages/milkdown-plugin-japanese-novel/pos-highlight/pos-colors";
import { usePosHighlightSettings } from "@/contexts/EditorSettingsContext";
import ColorPicker from "@/components/ColorPicker";

const PosHighlightPreview = dynamic(() => import("@/components/PosHighlightPreview"), {
  ssr: false,
});

const POS_COLOR_ITEMS = [
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
] as const;

/**
 * Settings tab for part-of-speech highlight configuration.
 * Covers: enable/disable toggle, per-POS color pickers, and a live preview.
 */
export default function PosHighlightSettingsTab(): React.ReactElement {
  const {
    posHighlightEnabled,
    posHighlightColors,
    onPosHighlightEnabledChange,
    onPosHighlightColorsChange,
  } = usePosHighlightSettings();

  function handleResetColors(): void {
    onPosHighlightColorsChange({});
  }

  function getEffectiveColor(key: string): string {
    return posHighlightColors[key] || DEFAULT_POS_COLORS[key] || "#000000";
  }

  return (
    <div className="flex gap-6 h-full">
      {/* Left: controls */}
      <div className="w-2/5 overflow-y-auto space-y-6 pr-2">
        {/* Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-foreground">品詞ハイライトを有効化</h3>
            <p className="text-xs text-foreground-tertiary mt-0.5">動詞・助詞などを色分け表示</p>
          </div>
          <button
            onClick={() => onPosHighlightEnabledChange(!posHighlightEnabled)}
            className={clsx(
              "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
              posHighlightEnabled ? "bg-accent" : "bg-border-secondary",
            )}
          >
            <span
              className={clsx(
                "inline-block h-4 w-4 transform rounded-full bg-background transition-transform",
                posHighlightEnabled ? "translate-x-6" : "translate-x-1",
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
            {POS_COLOR_ITEMS.map(({ key, label }) => (
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
  );
}
